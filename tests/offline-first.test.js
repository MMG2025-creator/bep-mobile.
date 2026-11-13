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
 assert.equal(read("styles.css"),read("dist/styles.css"));
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/offline-storage\.js\?v=/);
 const assetRefs=html=>[...html.matchAll(/(?:src|href)="\.\/(?:runtime-config|financial-engine|offline-storage|app|styles|monthly-budget-ui|spend-experience)\.(?:js|css)\?v=[^"]+"/g)].map(match=>match[0]).sort();
 assert.deepEqual(assetRefs(read("index.html")),assetRefs(read("dist/index.html")));
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


test("session logout propagates across tabs through BroadcastChannel and shared storage",()=>{
 const store=new Map([["bep-last-authenticated-user","user-1"]]),listeners={},events=[],channels=[];
 class FakeBroadcastChannel{constructor(name){this.name=name;this.onmessage=null;channels.push(this)}postMessage(data){this.sent=data}}
 class FakeCustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}}
 const window={BroadcastChannel:FakeBroadcastChannel,addEventListener:(name,fn)=>{listeners[name]=fn},dispatchEvent:event=>events.push(event)};
 const context={window,localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},BroadcastChannel:FakeBroadcastChannel,CustomEvent:FakeCustomEvent,navigator:{onLine:true},document:{visibilityState:"visible"},fetch:async()=>({ok:true,status:200,json:async()=>({user:{id:"user-1"}})})};
 vm.runInNewContext(read("offline-storage.js"),context);
 const api=window.BEPOffline;api.broadcastSessionEnd("logout");
 assert.equal(channels[0].name,"bep-auth-session-v1");assert.equal(channels[0].sent.type,"logout");
 channels[0].onmessage({data:{type:"logout"}});
 assert.ok(events.some(event=>event.type==="bep:session-invalidated"&&event.detail.reason==="logout"));
 listeners.storage({key:"bep-last-authenticated-user",oldValue:"user-1",newValue:null});
 assert.ok(events.some(event=>event.type==="bep:session-invalidated"&&event.detail.reason==="storage-identity-changed"));
});

test("foreground revalidation invalidates a session revoked by another interface",async()=>{
 const store=new Map([["bep-last-authenticated-user","user-1"]]),events=[];
 class FakeCustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}}
 const window={bepSignedIn:true,addEventListener:()=>{},dispatchEvent:event=>events.push(event)};
 const context={window,localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},CustomEvent:FakeCustomEvent,navigator:{onLine:true},document:{visibilityState:"visible"},fetch:async()=>({ok:false,status:401,json:async()=>({})})};
 vm.runInNewContext(read("offline-storage.js"),context);
 const valid=await window.BEPOffline.validateActiveSession();
 assert.equal(valid,false);assert.equal(store.has("bep-last-authenticated-user"),false);
 assert.ok(events.some(event=>event.type==="bep:session-invalidated"&&event.detail.reason==="server-session-ended"));
});

test("logout UI locks a second active interface without deleting its pending offline queue",()=>{
 const js=read("app.js"),offline=read("offline-storage.js"),server=read("server.js");
 assert.match(offline,/new BroadcastChannel\("bep-auth-session-v1"\)/);
 assert.match(offline,/document\.addEventListener\("visibilitychange"/);
 assert.match(js,/window\.addEventListener\("bep:session-invalidated"/);
 assert.match(js,/La session a été fermée depuis une autre interface/);
 assert.match(js,/broadcastSessionEnd\("logout"\)/);
 assert.match(js,/broadcastSessionEnd\("account-deleted"\)/);
 const logout=server.indexOf('app.post("/api/auth/logout"');
 const revoke=server.indexOf("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1",logout);
 const destroy=server.indexOf("req.session.destroy",logout);
 assert.ok(logout>=0&&revoke>logout&&destroy>revoke);
});

test("offline restoration requires a known identity and a valid local snapshot",()=>{
 const js=read("app.js");
 assert.ok(js.includes('const localSnapshotRaw=localStorage.getItem(DB)'));
 assert.ok(js.includes('hasSnapshot:hasUsableSnapshot'));
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
 const usable=context.window.BEPOffline.hasUsableSnapshot;
 assert.equal(usable(null),false);
 assert.equal(usable({}),false);
 assert.equal(usable({income:0,incomes:[],budgets:[],goals:[],expenses:[],transactions:[],savingsOperations:[]}),false);
 assert.equal(usable({income:1250}),true);
 assert.equal(usable({budgets:[{amount:900}]}),true);
 assert.equal(usable({transactions:[{amount:-12}]}),true);
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


async function runStartupScenario({knownUser=false,snapshot=null,previousIdentity=null,responses=[],rejectAt=null,pending=null,flushResult=true}={}){
 const store=new Map();
 if(knownUser)store.set("bep-last-authenticated-user","user-1");
 if(snapshot!==null)store.set("bep-mobile-v1",JSON.stringify(snapshot));
 if(previousIdentity!==null)store.set("bep-last-authenticated-user",previousIdentity);
 const localStorage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
 };
 const window={location:{search:"",pathname:"/",hash:""},dispatchEvent:()=>{},addEventListener:()=>{}};
 const defaults={income:0,incomes:[],budgets:[],goals:[],expenses:[],transactions:[],savingsOperations:[],coachProfile:[],treasury:{overdraftLimit:0,validUntil:""}};
 const state=snapshot?{...defaults,...snapshot}:{...defaults};
 const gate={hidden:true},authMessage={textContent:""},loader={hidden:false},notifications=[];
 const document={getElementById:()=>loader};
 let requestIndex=0;
 const fetch=async()=>{
  if(requestIndex===rejectAt){requestIndex++;throw Error("network unavailable")}
  const response=responses[requestIndex++]||{status:200,body:{}};
  return {status:response.status,ok:response.status>=200&&response.status<300,json:async()=>response.body};
 };
 const context={
  window,localStorage,URLSearchParams,Event,document,fetch,gate,authMessage,
  pendingVerificationEmail:"",API:"https://api.test",DB:"bep-mobile-v1",defaults,state,
  getSavedTab:()=>"home",tab:()=>{},render:()=>{},notify:message=>notifications.push(message),
  dispatchLegacyBudgetChanged:()=>{},persistMigratedIncomeState:async()=>{},
  syncIncomeTotal:()=>{context.state.income=(context.state.incomes||[]).reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0)}
 };
 vm.runInNewContext(read("offline-storage.js"),context);
 context.window.BEPOffline.readPending=async()=>pending;
 context.window.BEPOffline.flush=async()=>flushResult;
 context.window.BEPOffline.setBaseline=async()=>true;
 const app=read("app.js");
 const marker=app.indexOf('const oauthResult=new URLSearchParams(window.location.search).get("login");');
 const start=app.indexOf("(async()=>{",marker);
 const end=app.indexOf("})();",start);
 assert.ok(marker>=0&&start>=0&&end>start,"startup block must be locatable");
 const block=app.slice(start+("(async()=>{").length,end);
 await vm.runInNewContext("(async()=>{"+block+"})()",context);
 return {context,store,notifications,requestCount:requestIndex};
}

test("real startup flow variants protect logout, second-device loading and offline access",async t=>{
 const useful={income:2500,incomes:[{amount:2500}]};
 await t.test("F5 after explicit logout remains on the login gate",async()=>{
  const r=await runStartupScenario({responses:[{status:200,body:{user:null}}]});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepSignedIn,false);
  assert.equal(r.context.window.bepOfflineMode,false);
 });
 await t.test("a second device with no cache loads the account data from the server",async()=>{
  const r=await runStartupScenario({responses:[
   {status:200,body:{user:{id:"user-1"}}},
   {status:200,body:{payload:{income:4200,incomes:[{amount:4200}]}}},
   {status:200,body:{user:{firstName:"Test"}}}
  ]});
  assert.equal(r.context.gate.hidden,true);
  assert.equal(r.context.window.bepSignedIn,true);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.context.state.income,4200);
 });
 await t.test("a known device can use a useful cache when the network is unavailable",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,rejectAt:0});
  assert.equal(r.context.gate.hidden,true);
  assert.equal(r.context.window.bepOfflineMode,true);
  assert.equal(r.context.state.income,2500);
 });
 await t.test("a known identity without a cache cannot open a zero-data offline dashboard",async()=>{
  const r=await runStartupScenario({knownUser:true,rejectAt:0});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.match(r.context.authMessage.textContent,/Aucune session hors ligne enregistrée/);
 });
 await t.test("an empty financial cache is not treated as a usable offline snapshot",async()=>{
  const empty={income:0,incomes:[],budgets:[],goals:[],expenses:[],transactions:[],savingsOperations:[]};
  const r=await runStartupScenario({knownUser:true,snapshot:empty,rejectAt:0});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
 });
 await t.test("a retained cache cannot bypass a cleared identity marker after logout",async()=>{
  const r=await runStartupScenario({snapshot:useful,responses:[{status:200,body:{user:null}}]});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.store.get("bep-mobile-v1"),JSON.stringify(useful));
 });
 await t.test("401 from auth status rejects offline restoration even with a cache",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,responses:[{status:401,body:{}}]});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.context.state.income,0);
 });
 await t.test("403 from data endpoint rejects offline restoration even with a cache",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,responses:[
   {status:200,body:{user:{id:"user-1"}}},{status:403,body:{}}
  ]});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.context.state.income,0);
 });
 await t.test("server outage can use the known device cache",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,responses:[{status:503,body:{}}]});
  assert.equal(r.context.gate.hidden,true);
  assert.equal(r.context.window.bepOfflineMode,true);
  assert.equal(r.context.state.income,2500);
 });
 await t.test("a different account on the same device is never shown the previous account cache",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,previousIdentity:"old-user",responses:[{status:200,body:{user:{id:"new-user"}}}]});
  assert.equal(r.context.gate.hidden,false);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.store.has("bep-mobile-v1"),false);
 });
 await t.test("a sync conflict displays server data and leaves the local queue pending",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,responses:[
   {status:200,body:{user:{id:"user-1"}}},{status:200,body:{payload:{income:4500,incomes:[{amount:4500}]}}}
  ],pending:{payload:useful},flushResult:false});
  assert.equal(r.context.gate.hidden,true);
  assert.equal(r.context.window.bepSignedIn,true);
  assert.equal(r.context.window.bepOfflineMode,false);
  assert.equal(r.context.state.income,4500);
  assert.match(r.notifications[0],/modifications locales restent en attente/);
 });
 await t.test("a successful sync reloads the server's latest data",async()=>{
  const r=await runStartupScenario({knownUser:true,snapshot:useful,responses:[
   {status:200,body:{user:{id:"user-1"}}},
   {status:200,body:{payload:useful}},
   {status:200,body:{payload:{income:2800,incomes:[{amount:2800}]}}},
   {status:200,body:{user:{}}}
  ],pending:{payload:useful},flushResult:true});
  assert.equal(r.context.gate.hidden,true);
  assert.equal(r.context.window.bepSignedIn,true);
  assert.equal(r.context.state.income,2800);
 });
});
