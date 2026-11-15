(()=>{"use strict";
const DB_NAME="bep-offline-v1",STORE="sync",QUEUE_KEY="bep-offline-pending-v1",BASELINE_KEY="bep-offline-baseline-v1",USER_KEY="bep-last-authenticated-user",SNAPSHOT_KEY="bep-trusted-offline-snapshot-v1",DATA_KEY="bep-mobile-v1";
const identity=()=>String(localStorage.getItem(USER_KEY)||"");
const queueKeyFor=user=>QUEUE_KEY+":"+String(user||"guest");
const baselineKeyFor=user=>BASELINE_KEY+":"+String(user||"guest");
const queueKey=()=>queueKeyFor(identity());
const baselineKey=()=>baselineKeyFor(identity());
let dbPromise;
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!("indexedDB"in window))return reject(Error("IndexedDB unavailable"));const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise}
async function read(key){try{const db=await openDb();return await new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}catch{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}}
async function write(key,value){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.setItem(key,JSON.stringify(value))}catch{throw Error("Stockage local indisponible")}}}
async function clear(key){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.removeItem(key)}catch{}}}
function stable(value){if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";return JSON.stringify(value)}
let baseline=null,baselineLoaded=false,flushing=false,baselineWrite=Promise.resolve();
async function loadBaseline(){await baselineWrite;if(!baselineLoaded){baseline=await read(baselineKey());baselineLoaded=true}}
async function setBaseline(payload){baseline=payload&&typeof payload==="object"&&!Array.isArray(payload)?JSON.parse(JSON.stringify(payload)):null;baselineLoaded=true;baselineWrite=write(baselineKey(),baseline);await baselineWrite;const identity=String(localStorage.getItem(USER_KEY)||"");if(!identity||!baseline)return false;try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,user:identity,verifiedAt:new Date().toISOString()}));return true}catch{return false}}
function hasTrustedSnapshot(){try{const identity=String(localStorage.getItem(USER_KEY)||"");const marker=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||"null");const local=JSON.parse(localStorage.getItem(DATA_KEY)||"null");return !!(identity&&marker&&marker.version===1&&marker.user===identity&&marker.verifiedAt&&local&&typeof local==="object"&&!Array.isArray(local))}catch{return false}}
async function enqueue(payload){const owner=identity();if(!owner||!window.BEPOffline?.hasKnownUser())return false;const key=queueKeyFor(owner);await loadBaseline();if(identity()!==owner)return false;const existing=await read(key);if(identity()!==owner)return false;const base=existing?existing.base:baseline;if(!base||typeof base!=="object"||Array.isArray(base)){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline"}}));return false}const record={base:JSON.parse(JSON.stringify(base)),payload:JSON.parse(JSON.stringify(payload)),queuedAt:new Date().toISOString()};await write(key,record);if(identity()!==owner)return false;window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:record.queuedAt}}));if(navigator.onLine&&window.bepSignedIn)flush().catch(()=>{});return true}
async function stage(payload){
 const owner=identity();
 if(!owner||!window.BEPOffline?.hasKnownUser())throw Error("Aucun compte BEP connu pour préparer la synchronisation.");
 const key=queueKeyFor(owner);
 await loadBaseline();
 if(identity()!==owner)throw Error("Le compte actif a changé. Recommence la préparation.");
 const existing=await read(key);
 if(identity()!==owner)throw Error("Le compte actif a changé. Recommence la préparation.");
 if(existing)throw Error("Des modifications hors ligne sont déjà en attente. Synchronise-les avant de restaurer une sauvegarde.");
 if(!baseline||typeof baseline!=="object"||Array.isArray(baseline))throw Error("La référence de synchronisation du compte est indisponible.");
 const record={base:JSON.parse(JSON.stringify(baseline)),payload:JSON.parse(JSON.stringify(payload)),queuedAt:new Date().toISOString()};
 await write(key,record);
 if(identity()!==owner)throw Error("Le compte actif a changé. Vérifie la file de synchronisation.");
 window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:record.queuedAt}}));
 return true;
}
async function discardPending(){await clear(queueKey());window.dispatchEvent(new CustomEvent("bep:offline-pending-cleared"));}
async function clearLocalData(){
 // Vérifier la file avant toute suppression : aucune modification non synchronisée ne doit être perdue.
 const pending=await read(queueKey());
 if(pending!==null&&pending!==undefined)throw Error("Des modifications hors ligne ne sont pas encore synchronisées. Synchronise-les avant d’effacer les données locales.");
 const keys=[baselineKey(),queueKey()];
 if("indexedDB" in window){
  try{
   const db=await openDb();
   await new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(STORE,"readwrite")}catch(error){reject(error);return}
    const store=tx.objectStore(STORE);
    for(const key of keys)store.delete(key);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||Error("Suppression du stockage local impossible"));
    tx.onabort=()=>reject(tx.error||Error("Suppression du stockage local interrompue"));
   });
  }catch(error){
   // Repli localStorage uniquement si IndexedDB n'est pas disponible.
   if(!window.localStorage)throw error;
   for(const key of keys){try{localStorage.removeItem(key)}catch(removeError){throw removeError}}
  }
 }else{
  for(const key of keys){try{localStorage.removeItem(key)}catch(error){throw error}}
 }
 for(const key of [USER_KEY,SNAPSHOT_KEY,DATA_KEY]){
  try{localStorage.removeItem(key)}catch(error){throw Error("Impossible d’effacer une donnée locale ("+key+").")}
 }
 try{dbPromise?.then(db=>db.close()).catch(()=>{})}catch{}
 dbPromise=null;baseline=null;baselineLoaded=false;baselineWrite=Promise.resolve();
}
async function flush(){if(flushing||!navigator.onLine||!window.bepSignedIn)return false;const owner=identity();if(!owner)return false;const pendingKey=queueKeyFor(owner),referenceKey=baselineKeyFor(owner);flushing=true;try{await loadBaseline();if(identity()!==owner||!window.bepSignedIn)return false;const pending=await read(pendingKey);if(identity()!==owner||!window.bepSignedIn)return false;if(!pending)return true;if(!pending.base||typeof pending.base!=="object"||Array.isArray(pending.base)||!pending.payload||typeof pending.payload!=="object"||Array.isArray(pending.payload)){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline"}}));return false}
const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
const response=await fetch(api+"/api/data",{credentials:"include",cache:"no-store"});if(!response.ok)throw Error("Lecture du compte impossible ("+response.status+")");const server=await response.json(),remote=server.payload||{};
if(identity()!==owner||!window.bepSignedIn)return false;
if(stable(remote)===stable(pending.payload)){await write(referenceKey,remote);if(identity()===owner){baseline=remote;baselineLoaded=true;try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,user:owner,verifiedAt:new Date().toISOString()}))}catch{}}await clear(pendingKey);if(identity()===owner)window.dispatchEvent(new CustomEvent("bep:offline-synced"));return true}
if(stable(remote)!==stable(pending.base)){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"remote-changed"}}));return false}
if(identity()!==owner||!window.bepSignedIn)return false;
const saved=await fetch(api+"/api/data",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({__bepOfflineSync:true,base:pending.base,payload:pending.payload})});const savedData=await saved.json().catch(()=>({}));if(saved.status===409){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:savedData.error||"remote-changed"}}));return false}if(!saved.ok)throw Error("Synchronisation refusée ("+saved.status+")");const committed=savedData.payload&&typeof savedData.payload==="object"?savedData.payload:pending.payload;await write(referenceKey,committed);if(identity()===owner){baseline=committed;baselineLoaded=true;try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,user:owner,verifiedAt:new Date().toISOString()}))}catch{}}await clear(pendingKey);if(identity()===owner)window.dispatchEvent(new CustomEvent("bep:offline-synced"));return true
}catch(error){window.dispatchEvent(new CustomEvent("bep:offline-sync-error",{detail:{message:error.message}}));return false}finally{flushing=false}}
async function refreshAuthAndSync(){if(!navigator.onLine)return;try{const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");const r=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});if(!r.ok)return;const auth=await r.json();if(!auth.user)return;const identity=String(auth.user.id||auth.user.email||"authenticated");if(localStorage.getItem(USER_KEY)!==identity){localStorage.setItem(USER_KEY,identity);baseline=null;baselineLoaded=false}window.bepSignedIn=true;await flush()}catch{}}
window.BEPOffline={setBaseline,enqueue,flush,readPending:()=>read(queueKey()),stage,discardPending,clearLocalData,refreshAuthAndSync,hasKnownUser:()=>!!localStorage.getItem(USER_KEY),hasTrustedSnapshot,markKnownUser:id=>{try{const next=String(id||"authenticated");if(localStorage.getItem(USER_KEY)!==next){localStorage.setItem(USER_KEY,next);localStorage.removeItem(SNAPSHOT_KEY);baseline=null;baselineLoaded=false}}catch{}}};
window.addEventListener("online",()=>{refreshAuthAndSync()});
window.addEventListener("bep:offline-conflict",()=>{window.dispatchEvent(new CustomEvent("bep:toast",{detail:{message:"Synchronisation suspendue : les données du compte ont changé sur un autre appareil. Tes données locales sont préservées."}}))});
})();