"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","offline-storage.js"),"utf8");
function createRuntime(fetchImpl=async()=>({ok:true,status:200,json:async()=>({payload:{value:0}})})){
 const values=new Map(),listeners=new Map();
 const localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
 };
 const navigator={onLine:false};
 const window={
  BEP_API_BASE:"https://staging.example.test",
  addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},
  dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true}
 };
 class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
 const context={window,localStorage,navigator,fetch:fetchImpl,CustomEvent,Date,JSON,Promise,Error,String,Number,Array,Object,Set,Map};
 vm.runInNewContext(source,context,{filename:"offline-storage.js"});
 return {window,localStorage,navigator,values,listeners};
}
test("offline queue uses local fallback and is isolated by authenticated user",async()=>{
 const runtime=createRuntime(),offline=runtime.window.BEPOffline;
 offline.markKnownUser("user-a");
 await offline.setBaseline({owner:"a",value:0});
 assert.equal(await offline.enqueue({owner:"a",value:1}),true);
 assert.equal((await offline.readPending()).base.owner,"a");
 offline.markKnownUser("user-b");
 assert.equal(await offline.enqueue({owner:"b",value:1}),true);
 const pending=await offline.readPending();
 assert.equal(pending.base,null,"a user's baseline must never be reused for another account");
 assert.equal(pending.payload.owner,"b");
});
test("an enqueue during PUT is preserved and rebased instead of being deleted",async()=>{
 const runtimeHolder={runtime:null,remote:{value:0},puts:0};
 const fetchImpl=async(url,options={})=>{
  if((options.method||"GET")==="GET")return {ok:true,status:200,json:async()=>({payload:runtimeHolder.remote})};
  runtimeHolder.puts++;
  const body=JSON.parse(options.body);
  if(runtimeHolder.puts===1){
   await runtimeHolder.runtime.window.BEPOffline.enqueue({value:2});
  }
  runtimeHolder.remote={...body.payload,canonical:true};
  return {ok:true,status:200,json:async()=>({ok:true,payload:runtimeHolder.remote})};
 };
 const runtime=createRuntime(fetchImpl);runtimeHolder.runtime=runtime;
 const offline=runtime.window.BEPOffline;
 offline.markKnownUser("user-a");
 await offline.setBaseline({value:0});
 await offline.enqueue({value:1});
 runtime.navigator.onLine=true;runtime.window.bepSignedIn=true;
 assert.equal(await offline.flush(),true);
 const pending=await offline.readPending();
 assert.equal(pending.payload.value,2);
 assert.equal(pending.base.value,1,"the second snapshot must use the first committed snapshot as its new baseline");
 assert.equal(pending.base.canonical,true,"the baseline must use the exact server-confirmed normalized payload");
 assert.equal(runtimeHolder.puts,1);
 assert.equal(await offline.flush(),true);
 assert.equal(await offline.readPending(),null);
 assert.equal(runtimeHolder.remote.value,2);
 assert.equal(runtimeHolder.puts,2);
});
test("a remote change blocks PUT and preserves the local queue",async()=>{
 let puts=0;
 const runtime=createRuntime(async(url,options={})=>{
  if((options.method||"GET")==="GET")return {ok:true,status:200,json:async()=>({payload:{value:9}})};
  puts++;return {ok:true,status:200,json:async()=>({ok:true})};
 });
 const offline=runtime.window.BEPOffline;
 offline.markKnownUser("user-a");
 await offline.setBaseline({value:0});
 await offline.enqueue({value:1});
 runtime.navigator.onLine=true;runtime.window.bepSignedIn=true;
 assert.equal(await offline.flush(),false);
 assert.equal(puts,0);
 assert.equal((await offline.readPending()).payload.value,1);
});
test("an atomic server-side conflict response preserves the pending snapshot",async()=>{
 let puts=0;
 const runtime=createRuntime(async(url,options={})=>{
  if((options.method||"GET")==="GET")return {ok:true,status:200,json:async()=>({payload:{value:0}})};
  puts++;return {ok:false,status:409,json:async()=>({error:"OFFLINE_CONFLICT"})};
 });
 const offline=runtime.window.BEPOffline;
 offline.markKnownUser("user-a");
 await offline.setBaseline({value:0});
 await offline.enqueue({value:1});
 runtime.navigator.onLine=true;runtime.window.bepSignedIn=true;
 assert.equal(await offline.flush(),false);
 assert.equal(puts,1);
 assert.equal((await offline.readPending()).payload.value,1);
});
