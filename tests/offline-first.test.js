"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("offline persistence runtime and published app bundles are synchronized",()=>{
 assert.equal(read("app.js"),read("dist/app.js"));
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

test("explicit logout and account deletion clear the remembered offline identity",()=>{
 const js=read("app.js");
 assert.ok(js.includes('window.BEPOffline?.forgetKnownUser()'));
 assert.ok(js.includes('window.bepOfflineMode=false;window.bepSignedIn=false'));
 const logout=js.indexOf('$("logoutBtn").onclick');
 const forget=js.indexOf('forgetKnownUser()',logout);
 const localDataClear=js.indexOf('localStorage.removeItem(DB)',logout);
 assert.ok(logout>=0&&forget>logout&&localDataClear>forget);
});

test("offline restoration requires a known identity and a valid local snapshot",()=>{
 const js=read("app.js");
 assert.ok(js.includes('const localSnapshotRaw=localStorage.getItem(DB)'));
 assert.ok(js.includes('hasSnapshot:!!localSnapshot'));
 assert.ok(js.includes('const showOfflineSnapshot=()=>'));
 assert.ok(js.includes('if(showOfflineSnapshot())return'));
 assert.ok(js.includes('window.bepOfflineMode=true'));
});

test("server logout, unauthenticated and authorization-denied responses never reopen offline access",()=>{
 const js=read("app.js");
 assert.ok(js.includes('if(!auth.user){showLogin("");return}'));
 assert.ok(js.includes('authResponse.status===401||authResponse.status===403'));
 assert.ok(js.includes('dataResponse.status===401||dataResponse.status===403'));
 assert.ok(js.includes('showLogin("Ta session n’est plus valide.'));
 assert.ok(js.includes('showLogin("L’accès aux données a été refusé.'));
});

test("startup mode matrix covers online, logged out, unauthorized, no-cache and network loss",()=>{
 const store=new Map();
 const context={
  localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
  window:{addEventListener:()=>{}}
 };
 vm.runInNewContext(read("offline-storage.js"),context);
 const decide=context.window.BEPOffline.resolveStartupMode;
 const cases=[
  [true,true,"authenticated","online"],
  [false,false,"authenticated","online"],
  [true,true,"unauthenticated","login"],
  [true,false,"unauthenticated","login"],
  [false,true,"unauthenticated","login"],
  [false,false,"unauthenticated","login"],
  [true,true,"unauthorized","login"],
  [true,false,"unauthorized","login"],
  [false,true,"unauthorized","login"],
  [false,false,"unauthorized","login"],
  [true,true,"unavailable","offline"],
  [true,false,"unavailable","login"],
  [false,true,"unavailable","login"],
  [false,false,"unavailable","login"]
 ];
 for(const [knownUser,hasSnapshot,authState,expected] of cases){
  assert.equal(decide({knownUser,hasSnapshot,authState}),expected,JSON.stringify({knownUser,hasSnapshot,authState}));
 }
});

test("forgetKnownUser disables automatic restoration without deleting queued data or baseline",()=>{
 const store=new Map([
  ["bep-last-authenticated-user","user-1"],
  ["bep-offline-pending-v1:user-1","pending"],
  ["bep-offline-baseline-v1:user-1","baseline"]
 ]);
 const context={
  localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
  window:{addEventListener:()=>{}}
 };
 vm.runInNewContext(read("offline-storage.js"),context);
 const api=context.window.BEPOffline;
 assert.equal(api.hasKnownUser(),true);
 api.forgetKnownUser();
 assert.equal(api.hasKnownUser(),false);
 assert.equal(store.get("bep-offline-pending-v1:user-1"),"pending");
 assert.equal(store.get("bep-offline-baseline-v1:user-1"),"baseline");
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
