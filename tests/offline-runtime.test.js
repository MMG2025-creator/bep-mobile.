"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"..","offline-storage.js"),"utf8");
const base={income:100,incomes:[],budgets:[],expenses:[],goals:[],transactions:[],savingsOperations:[]};
const payload={income:250,incomes:[],budgets:[],expenses:[],goals:[],transactions:[],savingsOperations:[]};
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});

function runtime(fetchImpl){
 const values=new Map(),events=[];
 const localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
 };
 class TestCustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
 const window={
  localStorage,
  bepSignedIn:true,
  BEP_API_BASE:"https://api.test",
  addEventListener(){},
  dispatchEvent:event=>{events.push(event);return true}
 };
 const context={window,localStorage,navigator:{onLine:true},fetch:fetchImpl,CustomEvent:TestCustomEvent};
 vm.runInNewContext(source,context,{filename:"offline-storage.js"});
 return {window,localStorage,events,values};
}

async function prepare(rt,user="A"){
 rt.window.BEPOffline.markKnownUser(user);
 await rt.window.BEPOffline.setBaseline(base);
 await rt.window.BEPOffline.stage(payload);
}

test("offline queue is isolated by identity when the active account changes",async()=>{
 const rt=runtime(async()=>response(200,{payload:base}));
 await prepare(rt,"account-A");
 assert.ok(await rt.window.BEPOffline.readPending());
 rt.window.BEPOffline.markKnownUser("account-B");
 assert.equal(await rt.window.BEPOffline.readPending(),null);
 rt.window.BEPOffline.markKnownUser("account-A");
 assert.ok(await rt.window.BEPOffline.readPending());
});

test("flush aborts before PUT when identity changes while the remote snapshot is loading",async()=>{
 let signalGet,releaseGet;
 const getStarted=new Promise(resolve=>{signalGet=resolve});
 const getGate=new Promise(resolve=>{releaseGet=resolve});
 let activeSession="account-A",putAccount=null,putCalls=0;
 const rt=runtime(async(_url,options={})=>{
  if(options.method==="PUT"){
   putCalls++;putAccount=activeSession;
   return response(200,{payload});
  }
  signalGet();
  await getGate;
  return response(200,{payload:base});
 });
 await prepare(rt,"account-A");
 const flushing=rt.window.BEPOffline.flush();
 await getStarted;
 activeSession="account-B";
 rt.window.BEPOffline.markKnownUser("account-B");
 releaseGet();
 const result=await flushing;
 assert.equal(putCalls,0,"an account-A queue must never be PUT using account-B's session");
 assert.equal(putAccount,null);
 assert.equal(result,false);
});

test("flush recognizes a committed write after its HTTP response is lost and clears the queue idempotently",async()=>{
 let remote=base,putCalls=0;
 const rt=runtime(async(_url,options={})=>{
  if(options.method==="PUT"){
   putCalls++;
   remote=JSON.parse(options.body).payload;
   throw new Error("simulated connection reset after server commit");
  }
  return response(200,{payload:remote});
 });
 await prepare(rt,"account-A");
 const first=await rt.window.BEPOffline.flush();
 assert.equal(first,false,"the first client call must observe the lost response");
 assert.ok(await rt.window.BEPOffline.readPending(),"the queue remains until the retry confirms the server state");
 const second=await rt.window.BEPOffline.flush();
 assert.equal(second,true,"retry must recognize that the remote state already equals the queued payload");
 assert.equal(putCalls,1,"the same financial write must not be sent twice");
 assert.equal(await rt.window.BEPOffline.readPending(),null);
});

test("flush preserves the pending queue and emits a conflict when the remote snapshot changed independently",async()=>{
 const changed={...base,income:175};
 let putCalls=0;
 const rt=runtime(async(_url,options={})=>{
  if(options.method==="PUT"){putCalls++;return response(200,{payload});}
  return response(200,{payload:changed});
 });
 await prepare(rt,"account-A");
 const result=await rt.window.BEPOffline.flush();
 assert.equal(result,false);
 assert.equal(putCalls,0);
 assert.ok(await rt.window.BEPOffline.readPending());
 assert.ok(rt.events.some(event=>event.type==="bep:offline-conflict"&&event.detail?.reason==="remote-changed"));
});
