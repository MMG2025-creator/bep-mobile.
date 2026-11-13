(()=>{"use strict";
const DB_NAME="bep-offline-v1",STORE="sync",QUEUE_KEY="bep-offline-pending-v1",BASELINE_KEY="bep-offline-baseline-v1",USER_KEY="bep-last-authenticated-user";
const queueKey=()=>QUEUE_KEY+":"+String(localStorage.getItem(USER_KEY)||"guest");
const baselineKey=()=>BASELINE_KEY+":"+String(localStorage.getItem(USER_KEY)||"guest");
let dbPromise;
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!("indexedDB"in window))return reject(Error("IndexedDB unavailable"));const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise}
async function read(key){try{const db=await openDb();return await new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}catch{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}}
async function write(key,value){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.setItem(key,JSON.stringify(value))}catch{throw Error("Stockage local indisponible")}}}
async function clear(key){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.removeItem(key)}catch{}}}
function hasUsableSnapshot(snapshot){return !!(snapshot&&typeof snapshot==="object"&&(Number(snapshot.income)>0||["incomes","budgets","goals","expenses","transactions","savingsOperations"].some(key=>Array.isArray(snapshot[key])&&snapshot[key].length>0)))}
function resolveStartupMode({knownUser=false,hasSnapshot=false,authState="unavailable"}={}){if(authState==="authenticated")return "online";if(authState==="unavailable"&&knownUser&&hasSnapshot)return "offline";return "login"}
function dispatchSessionInvalidated(reason){window.dispatchEvent(new CustomEvent("bep:session-invalidated",{detail:{reason}}))}
let authChannel=null;
try{if("BroadcastChannel"in window){authChannel=new BroadcastChannel("bep-auth-session-v1");authChannel.onmessage=event=>{if(event.data?.type==="logout"||event.data?.type==="account-deleted")dispatchSessionInvalidated(event.data.type)}}}catch{}
function broadcastSessionEnd(reason="logout"){try{authChannel?.postMessage({type:reason==="account-deleted"?"account-deleted":"logout",at:Date.now()})}catch{}}
function forgetKnownUser(){try{localStorage.removeItem(USER_KEY)}catch{}}
window.addEventListener("storage",event=>{if(event.key===USER_KEY&&((event.newValue===null&&event.oldValue)||(event.newValue&&event.oldValue&&event.newValue!==event.oldValue)))dispatchSessionInvalidated("storage-identity-changed")});
let validatingSession=false;
async function validateActiveSession(){
 if(validatingSession||!navigator.onLine||!window.bepSignedIn)return false;
 validatingSession=true;
 try{
  const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
  const response=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});
  if(response.status===401||response.status===403){forgetKnownUser();dispatchSessionInvalidated("server-session-ended");return false}
  if(!response.ok)return false;
  const auth=await response.json();
  if(!auth.user){forgetKnownUser();dispatchSessionInvalidated("server-session-ended");return false}
  const identity=String(auth.user.id||auth.user.email||"authenticated");
  const known=localStorage.getItem(USER_KEY);
  if(known&&known!==identity){forgetKnownUser();dispatchSessionInvalidated("server-identity-changed");return false}
  return true;
 }catch{return false}finally{validatingSession=false}
}
window.addEventListener("pageshow",()=>{if(window.bepSignedIn)validateActiveSession()});
window.addEventListener("focus",()=>{if(window.bepSignedIn)validateActiveSession()});
if(typeof document!=="undefined"&&document.addEventListener)document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&window.bepSignedIn)validateActiveSession()});
function stable(value){if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";return JSON.stringify(value)}
let baseline=null,flushing=false,baselineWrite=Promise.resolve();async function loadBaseline(){await baselineWrite;if(baseline===null)baseline=await read(baselineKey())}
function setBaseline(payload){baseline=payload&&typeof payload==="object"?JSON.parse(JSON.stringify(payload)):null;baselineWrite=write(baselineKey(),baseline);return baselineWrite}
async function enqueue(payload){if(!window.BEPOffline?.hasKnownUser())return false;await loadBaseline();const existing=await read(queueKey());const base=existing?existing.base:baseline;const record={base:base?JSON.parse(JSON.stringify(base)):null,payload:JSON.parse(JSON.stringify(payload)),queuedAt:new Date().toISOString()};await write(queueKey(),record);window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:record.queuedAt}}));if(navigator.onLine&&window.bepSignedIn)flush().catch(()=>{})}
async function flush(){if(flushing||!navigator.onLine||!window.bepSignedIn)return false;flushing=true;try{await loadBaseline();const pending=await read(queueKey());if(!pending)return true;if(!pending.base){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline"}}));return false}
const response=await fetch((window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"")+"/api/data",{credentials:"include",cache:"no-store"});if(!response.ok)throw Error("Lecture du compte impossible ("+response.status+")");const server=await response.json(),remote=server.payload||{};
if(stable(remote)!==stable(pending.base)){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"remote-changed"}}));return false}
const saved=await fetch((window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"")+"/api/data",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(pending.payload)});if(!saved.ok)throw Error("Synchronisation refusée ("+saved.status+")");setBaseline(pending.payload);await clear(queueKey());window.dispatchEvent(new CustomEvent("bep:offline-synced"));return true
}catch(error){window.dispatchEvent(new CustomEvent("bep:offline-sync-error",{detail:{message:error.message}}));return false}finally{flushing=false}}
async function refreshAuthAndSync(){if(!navigator.onLine)return;try{const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");const r=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});if(!r.ok)return;const auth=await r.json();if(!auth.user)return;window.bepSignedIn=true;const identity=String(auth.user.id||auth.user.email||"authenticated");if(localStorage.getItem(USER_KEY)!==identity){localStorage.setItem(USER_KEY,identity);await loadBaseline()}await flush()}catch{}}
window.BEPOffline={setBaseline,enqueue,flush,readPending:()=>read(queueKey()),refreshAuthAndSync,hasKnownUser:()=>!!localStorage.getItem(USER_KEY),markKnownUser:id=>{try{localStorage.setItem(USER_KEY,String(id||"authenticated"))}catch{}},forgetKnownUser,resolveStartupMode,hasUsableSnapshot};
window.addEventListener("online",()=>{validateActiveSession().then(valid=>{if(valid)refreshAuthAndSync()})});
window.addEventListener("bep:offline-conflict",()=>{window.dispatchEvent(new CustomEvent("bep:toast",{detail:{message:"Synchronisation suspendue : les données du compte ont changé sur un autre appareil. Tes données locales sont préservées."}}))});
})();