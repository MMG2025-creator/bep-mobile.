(()=>{"use strict";
const DB_NAME="bep-offline-v1",STORE="sync",QUEUE_KEY="bep-offline-pending-v1",BASELINE_KEY="bep-offline-baseline-v1",USER_KEY="bep-last-authenticated-user",TOMBSTONE="__BEP_OFFLINE_DELETED__";
const identity=()=>String(localStorage.getItem(USER_KEY)||"guest");
const queueKey=user=>QUEUE_KEY+":"+String(user||identity());
const baselineKey=user=>BASELINE_KEY+":"+String(user||identity());
let dbPromise;
function openDb(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!("indexedDB"in window))return reject(Error("IndexedDB unavailable"));
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("IndexedDB unavailable"));
 });
 return dbPromise;
}
function readLocal(key){
 try{const raw=localStorage.getItem(key);if(raw===TOMBSTONE)return {found:true,deleted:true,value:null};if(raw!==null)return {found:true,deleted:false,value:JSON.parse(raw)}}catch{}
 return {found:false,deleted:false,value:null};
}
async function read(key){
 const local=readLocal(key);
 if(local.found)return local.deleted?null:local.value;
 try{return await new Promise((resolve,reject)=>{
  openDb().then(db=>{
   const request=db.transaction(STORE).objectStore(STORE).get(key);
   request.onsuccess=()=>resolve(request.result??null);
   request.onerror=()=>reject(request.error||Error("IndexedDB read failed"));
  }).catch(reject);
 })}catch{return null}
}
async function write(key,value){
 try{
  const db=await openDb();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite");
   tx.objectStore(STORE).put(value,key);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error||Error("IndexedDB write failed"));
   tx.onabort=()=>reject(tx.error||Error("IndexedDB write aborted"));
  });
  try{localStorage.removeItem(key)}catch{}
 }catch(error){
  try{localStorage.setItem(key,JSON.stringify(value))}
  catch{throw Error("Stockage local indisponible")}
 }
}
async function clear(key){
 try{
  const db=await openDb();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite");
   tx.objectStore(STORE).delete(key);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error||Error("IndexedDB delete failed"));
   tx.onabort=()=>reject(tx.error||Error("IndexedDB delete aborted"));
  });
  try{localStorage.removeItem(key)}catch{}
 }catch{
  try{localStorage.setItem(key,TOMBSTONE)}catch{throw Error("Suppression du stockage local impossible")}
 }
}
function stable(value){
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
 return JSON.stringify(value);
}
let baseline=null,baselineUser=null,baselineWrite=Promise.resolve(),queueWrite=Promise.resolve(),flushing=false;
function serializeQueue(task){
 const operation=queueWrite.then(task,task);
 queueWrite=operation.catch(()=>{});
 return operation;
}
async function loadBaseline(user=identity()){
 await baselineWrite;
 if(baselineUser!==user){baselineUser=user;baseline=null}
 if(baseline===null)baseline=await read(baselineKey(user));
 return baseline;
}
function setBaselineFor(user,payload){
 const copy=payload&&typeof payload==="object"?JSON.parse(JSON.stringify(payload)):null;
 if(identity()===user){baselineUser=user;baseline=copy}
 baselineWrite=write(baselineKey(user),copy);
 return baselineWrite;
}
function setBaseline(payload){return setBaselineFor(identity(),payload)}
async function enqueue(payload){
 if(!window.BEPOffline?.hasKnownUser())return false;
 const user=identity(),copy=JSON.parse(JSON.stringify(payload));
 return serializeQueue(async()=>{
  if(identity()!==user)return false;
  await loadBaseline(user);
  const key=queueKey(user),existing=await read(key);
  const base=existing?existing.base:baseline;
  const record={revision:(Number(existing?.revision)||0)+1,base:base?JSON.parse(JSON.stringify(base)):null,payload:copy,queuedAt:new Date().toISOString()};
  await write(key,record);
  window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:record.queuedAt,revision:record.revision}}));
  if(navigator.onLine&&window.bepSignedIn)flush().catch(()=>{});
  return true;
 });
}
async function flush(){
 if(flushing||!navigator.onLine||!window.bepSignedIn)return false;
 flushing=true;
 const user=identity(),key=queueKey(user);
 try{
  await queueWrite;
  const baselineValue=await loadBaseline(user),pending=await read(key);
  if(!pending)return true;
  if(!pending.base){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline"}}));return false}
  const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
  const response=await fetch(api+"/api/data",{credentials:"include",cache:"no-store"});
  if(!response.ok)throw Error("Lecture du compte impossible ("+response.status+")");
  const server=await response.json(),remote=server.payload||{};
  if(stable(remote)!==stable(pending.base)){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"remote-changed"}}));return false}
  if(identity()!==user)return false;
  const saved=await fetch(api+"/api/data",{
   method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({__bepOfflineSync:true,base:pending.base,payload:pending.payload})
  });
  if(saved.status===409){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"remote-changed"}}));return false}
  if(!saved.ok)throw Error("Synchronisation refusée ("+saved.status+")");
  await setBaselineFor(user,pending.payload);
  await serializeQueue(async()=>{
   const latest=await read(key);
   if(!latest)return;
   if(Number(latest.revision)===Number(pending.revision)){await clear(key);return}
   if(Number(latest.revision)>Number(pending.revision)){
    latest.base=JSON.parse(JSON.stringify(pending.payload));
    await write(key,latest);
   }
  });
  window.dispatchEvent(new CustomEvent("bep:offline-synced"));
  return true;
 }catch(error){
  window.dispatchEvent(new CustomEvent("bep:offline-sync-error",{detail:{message:error.message}}));
  return false;
 }finally{flushing=false}
}
async function refreshAuthAndSync(){
 if(!navigator.onLine)return;
 try{
  const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
  const response=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});
  if(!response.ok)return;
  const auth=await response.json();
  if(!auth.user)return;
  const wasSignedIn=Boolean(window.bepSignedIn);
  window.bepSignedIn=true;
  const user=String(auth.user.id||auth.user.email||"authenticated");
  if(identity()!==user)window.BEPOffline.markKnownUser(user);
  await loadBaseline(user);
  if(!wasSignedIn)window.dispatchEvent(new CustomEvent("bep:auth-ready"));
  await flush();
 }catch{}
}
window.BEPOffline={
 setBaseline,enqueue,flush,readPending:()=>read(queueKey()),refreshAuthAndSync,
 hasKnownUser:()=>!!localStorage.getItem(USER_KEY),
 markKnownUser:id=>{
  try{
   const next=String(id||"authenticated");
   if(identity()!==next){baseline=null;baselineUser=next;baselineWrite=Promise.resolve()}
   localStorage.setItem(USER_KEY,next);
  }catch{}
 }
};
window.addEventListener("online",()=>{refreshAuthAndSync()});
window.addEventListener("bep:offline-conflict",()=>{window.dispatchEvent(new CustomEvent("bep:toast",{detail:{message:"Synchronisation suspendue : les données du compte ont changé sur un autre appareil. Tes données locales sont préservées."}}))});
})();