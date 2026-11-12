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
  const savedData=await saved.json().catch(()=>({}));
  const committedPayload=savedData.payload&&typeof savedData.payload==="object"&&!Array.isArray(savedData.payload)?savedData.payload:pending.payload;
  await setBaselineFor(user,committedPayload);
  await serializeQueue(async()=>{
   const latest=await read(key);
   if(!latest)return;
   if(Number(latest.revision)===Number(pending.revision)){await clear(key);return}
   if(Number(latest.revision)>Number(pending.revision)){
    latest.base=JSON.parse(JSON.stringify(committedPayload));
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
  window.bepSignedIn=true;
  const user=String(auth.user.id||auth.user.email||"authenticated");
  if(identity()!==user)window.BEPOffline.markKnownUser(user);
  await loadBaseline(user);
  window.dispatchEvent(new CustomEvent("bep:auth-ready"));
  await flush();
 }catch{}
}
async function resolveConflict(choice){
 if(choice!=="local"&&choice!=="remote")return false;
 if(!navigator.onLine||!window.bepSignedIn)return false;
 const user=identity(),key=queueKey(user),api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
 try{
  const response=await fetch(api+"/api/data",{credentials:"include",cache:"no-store"});
  if(!response.ok)throw Error("Lecture de la version du compte impossible ("+response.status+")");
  const server=await response.json(),remote=server.payload&&typeof server.payload==="object"?server.payload:{};
  if(choice==="remote"){
   await setBaselineFor(user,remote);
   await serializeQueue(async()=>{await clear(key)});
   window.dispatchEvent(new CustomEvent("bep:offline-use-remote",{detail:{payload:remote}}));
   window.dispatchEvent(new CustomEvent("bep:offline-conflict-resolved"));
   return true;
  }
  await serializeQueue(async()=>{
   const latest=await read(key);
   if(!latest)return;
   latest.base=JSON.parse(JSON.stringify(remote));
   latest.revision=(Number(latest.revision)||0)+1;
   latest.queuedAt=new Date().toISOString();
   await write(key,latest);
  });
  return await flush();
 }catch(error){
  window.dispatchEvent(new CustomEvent("bep:offline-sync-error",{detail:{message:error.message}}));
  return false;
 }
}
let conflictDialogPending=false;
function showConflictDialog(){
 conflictDialogPending=true;
 if(typeof document==="undefined")return;
 const dialog=document.getElementById("bepOfflineConflictDialog");
 const banner=document.getElementById("bepOfflineConflictBanner");
 if(banner)banner.hidden=false;
 if(dialog&&!dialog.open)dialog.showModal();
}
function setupConflictDialog(){
 const dialog=document.getElementById("bepOfflineConflictDialog");
 if(!dialog)return;
 const localButton=document.getElementById("bepOfflineKeepLocal");
 const remoteButton=document.getElementById("bepOfflineUseRemote");
 const laterButton=document.getElementById("bepOfflineConflictLater");
 const status=document.getElementById("bepOfflineConflictStatus");
 const banner=document.getElementById("bepOfflineConflictBanner");
 const reopen=document.getElementById("bepOfflineConflictReopen");
 const close=()=>{if(dialog.open)dialog.close()};
 const run=async(choice)=>{
  const warning=choice==="local"
   ?"Cette action remplacera les données actuelles du compte par tes modifications locales. Continuer ?"
   :"Cette action abandonnera les modifications locales en attente et chargera la version du compte. Continuer ?";
  if(!window.confirm(warning))return;
  [localButton,remoteButton,laterButton].forEach(button=>{if(button)button.disabled=true});
  if(status)status.textContent="Résolution du conflit en cours…";
  const ok=await window.BEPOffline.resolveConflict(choice);
  [localButton,remoteButton,laterButton].forEach(button=>{if(button)button.disabled=false});
  if(ok&&choice==="remote")close();
  else if(!ok&&status)status.textContent="Le conflit n’a pas pu être résolu. Tes données locales restent conservées.";
 };
 localButton?.addEventListener("click",()=>run("local"));
 remoteButton?.addEventListener("click",()=>run("remote"));
 laterButton?.addEventListener("click",close);
 reopen?.addEventListener("click",()=>{if(!dialog.open)dialog.showModal()});
 window.addEventListener("bep:offline-synced",()=>{close();if(banner)banner.hidden=true});
 window.addEventListener("bep:offline-conflict-resolved",()=>{close();if(banner)banner.hidden=true});
 window.addEventListener("bep:offline-sync-error",event=>{if(dialog.open&&status)status.textContent=event.detail?.message||"Synchronisation en attente."});
 if(conflictDialogPending&&!dialog.open)dialog.showModal();
}
if(typeof document!=="undefined"){
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupConflictDialog,{once:true});
 else setupConflictDialog();
}
window.BEPOffline={
 setBaseline,enqueue,flush,resolveConflict,readPending:()=>read(queueKey()),refreshAuthAndSync,
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
window.addEventListener("bep:offline-conflict",()=>{showConflictDialog();window.dispatchEvent(new CustomEvent("bep:toast",{detail:{message:"Conflit de synchronisation : tes données locales sont préservées. Choisis quelle version conserver."}}))});
})();