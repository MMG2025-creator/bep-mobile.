"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("offline persistence runtime is synchronized and included in the app shell",()=>{
 assert.equal(read("offline-storage.js"),read("dist/offline-storage.js"));
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/offline-storage\.js\?v=/);
});

test("offline sync is account-scoped and refuses to overwrite a changed remote snapshot",()=>{
 const js=read("offline-storage.js");
 assert.match(js,/hasKnownUser\(\)\)return false/);
 assert.match(js,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(js,/bep:offline-conflict/);
 const conflict=js.indexOf('if(stable(remote)!==stable(pending.base))');
 assert.ok(conflict>=0&&js.indexOf('method:"PUT"',conflict)>conflict);
});

test("offline startup restores the local session and sets the remote baseline",()=>{
 const js=read("app.js");
 assert.match(js,/window\.BEPOffline\.hasKnownUser\(\)/);
 assert.match(js,/window\.bepOfflineMode=true/);
 assert.match(js,/gate\.hidden=true/);
 assert.match(js,/window\.BEPOffline\.setBaseline\(d\.payload\|\|\{\}\)/);
});

test("source and published service workers use the same cache and include offline dependencies",()=>{
 const source=read("sw.js"),published=read("dist/sw.js");
 assert.equal(source,published);
 assert.match(source,/bep-shell-v8/);
 assert.match(source,/offline-storage\.js/);
 assert.match(source,/cdn\.jsdelivr\.net/);
 assert.match(source,/tessdata\.projectnaptha\.com/);
 assert.match(source,/caches\.open\(RUNTIME_CACHE\)/);
});

test("receipt OCR runs locally and does not upload the image file",()=>{
 const js=read("app.js");
 assert.match(js,/window\.Tesseract\.recognize\(ocrImage,"fra\+eng"/);
 assert.doesNotMatch(js,/fetch\([^)]*receiptFile/);
});

test("monthly budget history cache is isolated by authenticated user",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/bep-monthly-history-cache-v1/);
 assert.match(js,/const key = "monthly-history:" \+ user/);
 assert.match(js,/cached\?\.budgets\?\.\[monthKey\]/);
 assert.match(js,/cacheOnlyMode/);
 assert.match(js,/lecture seule/);
});


test("revocation state blocks offline access and survives until explicit authentication",async()=>{
 const store=new Map([["bep-last-authenticated-user","user-1"]]),events=[];
 const window={bepSignedIn:false,bepOfflineMode:true,addEventListener:()=>{},dispatchEvent:e=>events.push(e),BroadcastChannel:undefined};
 const context={window,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{onLine:true},document:{addEventListener:()=>{}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},fetch:async()=>({ok:true,status:200,json:async()=>({user:{id:"user-1"}})})};
 vm.runInNewContext(read("offline-storage.js"),context);const api=window.BEPOffline;api.revokeSession("logout");
 assert.equal(api.isRevoked(),true);assert.equal(window.bepSignedIn,false);assert.equal(await api.enqueue({income:500}),false);assert.equal(await api.flush(),false);
 assert.equal(api.clearRevocationAfterAuthentication("user-2"),false);assert.equal(api.isRevoked(),true);
 assert.equal(api.clearRevocationAfterAuthentication("user-1"),true);assert.equal(api.isRevoked(),false);
});

test("pending offline queue rejects a different authenticated user before any write",async()=>{
 const store=new Map([["bep-last-authenticated-user","user-1"]]),calls=[];
 const context={window:{bepSignedIn:true,bepOfflineMode:false,addEventListener:()=>{},dispatchEvent:()=>{},BroadcastChannel:undefined},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{onLine:true},document:{addEventListener:()=>{}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},fetch:async(url,options={})=>{calls.push({url,method:options.method||"GET"});return {ok:true,status:200,json:async()=>url.endsWith("/api/auth/status")?{user:{id:"user-2"}}:{payload:{income:1000}}}}};
 vm.runInNewContext(read("offline-storage.js"),context);const api=context.window.BEPOffline;
 await api.enqueue({income:1200});store.set("bep-last-authenticated-user","user-2");await api.flush();
 assert.equal(calls.some(x=>x.method==="PUT"),false);
});
