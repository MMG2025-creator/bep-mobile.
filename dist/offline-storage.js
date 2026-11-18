(()=>{"use strict";
const DB_NAME="bep-offline-v1",STORE="sync",QUEUE_KEY="bep-offline-pending-v1",BASELINE_KEY="bep-offline-baseline-v1",USER_KEY="bep-last-authenticated-user",SNAPSHOT_KEY="bep-trusted-offline-snapshot-v1",DATA_KEY="bep-mobile-v1";
const queueKey=()=>QUEUE_KEY+":"+String(localStorage.getItem(USER_KEY)||"guest");
const baselineKey=()=>BASELINE_KEY+":"+String(localStorage.getItem(USER_KEY)||"guest");
let dbPromise;
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!("indexedDB"in window))return reject(Error("IndexedDB unavailable"));const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise}
async function read(key){try{const db=await openDb();return await new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}catch{try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}}
async function write(key,value){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.setItem(key,JSON.stringify(value))}catch{throw Error("Stockage local indisponible")}}}
async function clear(key){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{try{localStorage.removeItem(key)}catch{}}}
async function clearIfQueuedAt(expected){try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),get=store.get(queueKey());let removed=false;get.onsuccess=()=>{if(get.result?.queuedAt===expected){store.delete(queueKey());removed=true}};tx.oncomplete=()=>resolve(removed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Queue update aborted"))})}catch{const current=await read(queueKey());if(current?.queuedAt!==expected)return false;try{localStorage.removeItem(queueKey());return true}catch{return false}}}
function stable(value){if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";return JSON.stringify(value)}
let baseline=null,baselineLoaded=false,flushing=false,baselineWrite=Promise.resolve();
async function loadBaseline(){await baselineWrite;if(!baselineLoaded){baseline=await read(baselineKey());baselineLoaded=true}}
async function setBaseline(payload){baseline=payload&&typeof payload==="object"&&!Array.isArray(payload)?JSON.parse(JSON.stringify(payload)):null;baselineLoaded=true;baselineWrite=write(baselineKey(),baseline);await baselineWrite;const identity=String(localStorage.getItem(USER_KEY)||"");if(!identity||!baseline)return false;try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,user:identity,verifiedAt:new Date().toISOString()}));return true}catch{return false}}
function hasTrustedSnapshot(){try{const identity=String(localStorage.getItem(USER_KEY)||"");const marker=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||"null");const local=JSON.parse(localStorage.getItem(DATA_KEY)||"null");return !!(identity&&marker&&marker.version===1&&marker.user===identity&&marker.verifiedAt&&local&&typeof local==="object"&&!Array.isArray(local))}catch{return false}}
let enqueueChain=Promise.resolve();
async function fetchCurrentBaseline(){if(!navigator.onLine||!window.bepSignedIn)return null;try{const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");const response=await fetch(api+"/api/data",{credentials:"include",cache:"no-store"});if(!response.ok)return null;const result=await response.json();return result.payload&&typeof result.payload==="object"&&!Array.isArray(result.payload)?result.payload:{}}catch{return null}}
function deletionOnlySnapshot(local,remote){const deletedRecords={};for(const key of ["incomes","budgets","expenses","goals","transactions"]){const ids=[...(Array.isArray(remote.deletedRecords?.[key])?remote.deletedRecords[key]:[]),...(Array.isArray(local.deletedRecords?.[key])?local.deletedRecords[key]:[])];deletedRecords[key]=[...new Set(ids.filter(id=>typeof id==="string"&&id.length>0&&id.length<=128))].slice(-10000)}const comparable=value=>{const copy=JSON.parse(JSON.stringify(value||{}));delete copy.deletedRecords;for(const key of Object.keys(deletedRecords))if(Array.isArray(copy[key]))copy[key]=copy[key].filter(item=>!deletedRecords[key].includes(String(item?.id||"")));return copy};if(stable(comparable(local))!==stable(comparable(remote)))return null;const payload=JSON.parse(JSON.stringify(remote));payload.deletedRecords=deletedRecords;for(const key of Object.keys(deletedRecords))if(Array.isArray(payload[key]))payload[key]=payload[key].filter(item=>!deletedRecords[key].includes(String(item?.id||"")));if(Array.isArray(payload.incomes))payload.income=payload.incomes.reduce((sum,item)=>sum+Math.max(0,Number(item?.amount)||0),0);return payload}
function markTrustedSnapshot(){try{const identity=String(localStorage.getItem(USER_KEY)||"");const local=JSON.parse(localStorage.getItem(DATA_KEY)||"null");if(identity&&local&&typeof local==="object"&&!Array.isArray(local))localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({version:1,user:identity,verifiedAt:new Date().toISOString()}))}catch{}}
async function enqueueSnapshot(payload){if(!window.BEPOffline?.hasKnownUser())return false;await loadBaseline();const existing=await read(queueKey());let base=existing?existing.base:baseline,queuedPayload=payload;if(!base){const remote=await fetchCurrentBaseline();if(remote){const safePayload=deletionOnlySnapshot(payload,remote);if(safePayload){base=remote;queuedPayload=safePayload;await setBaseline(remote)}}}if(!base||typeof base!=="object"||Array.isArray(base)){const blocked={base:null,payload:JSON.parse(JSON.stringify(payload)),queuedAt:new Date().toISOString()};await write(queueKey(),blocked);markTrustedSnapshot();window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:blocked.queuedAt}}));window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline-or-stale-local-snapshot"}}));return false}const record={base:JSON.parse(JSON.stringify(base)),payload:JSON.parse(JSON.stringify(queuedPayload)),queuedAt:new Date().toISOString()};await write(queueKey(),record);window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:record.queuedAt}}));if(navigator.onLine&&window.bepSignedIn)flush().catch(()=>{});return true}
function enqueue(payload){let snapshot;try{snapshot=JSON.parse(JSON.stringify(payload))}catch{return Promise.resolve(false)}const task=enqueueChain.then(()=>enqueueSnapshot(snapshot));enqueueChain=task.catch(()=>false);return task}
async function stage(payload){
 if(!window.BEPOffline?.hasKnownUser())throw Error("Aucun compte BEP connu pour préparer la synchronisation.");
 await loadBaseline();
 const existing=await read(queueKey());
 if(existing)throw Error("Des modifications hors ligne sont déjà en attente. Synchronise-les avant de restaurer une sauvegarde.");
 if(!baseline||typeof baseline!=="object"||Array.isArray(baseline))throw Error("La référence de synchronisation du compte est indisponible.");
 const record={base:JSON.parse(JSON.stringify(baseline)),payload:JSON.parse(JSON.stringify(payload)),queuedAt:new Date().toISOString()};
 await write(queueKey(),record);
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
async function flush(){if(flushing||!navigator.onLine||!window.bepSignedIn)return false;flushing=true;let retry=false;try{await loadBaseline();const pending=await read(queueKey());if(!pending)return true;if(!pending.base||typeof pending.base!=="object"||Array.isArray(pending.base)){const remote=await fetchCurrentBaseline();const safePayload=remote?deletionOnlySnapshot(pending.payload,remote):null;if(!remote||!safePayload){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:"missing-baseline-or-stale-local-snapshot"}}));return false}pending.base=remote;pending.payload=safePayload;pending.queuedAt=new Date().toISOString();await setBaseline(remote);await write(queueKey(),pending)}
const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
const saved=await fetch(api+"/api/data",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({__bepOfflineSync:true,base:pending.base,payload:pending.payload})});
const savedData=await saved.json().catch(()=>({}));
if(saved.status===409){window.dispatchEvent(new CustomEvent("bep:offline-conflict",{detail:{reason:savedData.error||"remote-changed",path:savedData.conflictPath||""}}));return false}
if(!saved.ok)throw Error("Synchronisation refusée ("+saved.status+")");
const merged=savedData.payload&&typeof savedData.payload==="object"?savedData.payload:pending.payload;
await setBaseline(merged);
const removed=await clearIfQueuedAt(pending.queuedAt);
if(!removed){
 const latest=await read(queueKey());
 if(latest){latest.base=JSON.parse(JSON.stringify(merged));await write(queueKey(),latest);retry=true;window.dispatchEvent(new CustomEvent("bep:offline-pending",{detail:{queuedAt:latest.queuedAt}}))}
 else{try{localStorage.setItem(DATA_KEY,JSON.stringify(merged))}catch{}window.dispatchEvent(new CustomEvent("bep:offline-synced",{detail:{payload:merged}}))}
}else{
 try{localStorage.setItem(DATA_KEY,JSON.stringify(merged))}catch{}
 window.dispatchEvent(new CustomEvent("bep:offline-synced",{detail:{payload:merged}}));
}
return true
}catch(error){window.dispatchEvent(new CustomEvent("bep:offline-sync-error",{detail:{message:error.message}}));return false}
finally{flushing=false;if(retry&&navigator.onLine&&window.bepSignedIn)Promise.resolve().then(()=>flush())}}
async function forceSync(){
 if(!navigator.onLine)throw Error("Aucune connexion Internet détectée.");
 const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
 const authResponse=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});
 if(!authResponse.ok)throw Error("Le serveur BEP ne confirme pas la session (HTTP "+authResponse.status+").");
 const auth=await authResponse.json();if(!auth.user)throw Error("La session BEP n'est plus valide. Reconnecte-toi.");
 const identity=String(auth.user.id||auth.user.email||"authenticated"),known=String(localStorage.getItem(USER_KEY)||"");
 if(known&&known!==identity)throw Error("Ce navigateur est associé à un autre compte. Aucune donnée locale n'a été remplacée.");
 if(!known){const guestPending=await read(QUEUE_KEY+":guest");if(guestPending)throw Error("Des modifications locales du mode invité sont en attente. Elles sont conservées : termine leur synchronisation avant de changer de compte.");const guestData=localStorage.getItem(DATA_KEY);if(guestData&&guestData!=="null"&&guestData!=="{}")throw Error("Des données locales n’ont pas de référence distante fiable. Elles sont conservées pour éviter tout écrasement.");localStorage.setItem(USER_KEY,identity);baseline=null;baselineLoaded=false}
 window.bepSignedIn=true;
 await enqueueChain;let pending=await read(queueKey());
 if(pending){const synced=await flush();if(!synced)throw Error("Des modifications locales sont en attente ou en conflit. Elles ont été conservées.");pending=await read(queueKey());if(pending)throw Error("La file locale n'est pas vide. Aucune donnée n'a été remplacée.")}
 await loadBaseline();const localRaw=localStorage.getItem(DATA_KEY);let local=null;try{local=JSON.parse(localRaw||"null")}catch{throw Error("Les données locales sont illisibles. Elles sont conservées et ne seront pas remplacées.")}
 if(localRaw&&localRaw!=="null"&&localRaw!=="{}"&&(!local||!baseline||stable(local)!==stable(baseline)))throw Error("Des données locales ne disposent pas d’une référence distante fiable ou diffèrent encore de la dernière référence synchronisée. Elles sont préservées pour éviter tout écrasement.");
 const response=await fetch(api+"/api/data",{credentials:"include",cache:"no-store"});if(!response.ok)throw Error("Impossible de récupérer les données du compte (HTTP "+response.status+").");
 const result=await response.json();if(!result.payload||typeof result.payload!=="object"||Array.isArray(result.payload))throw Error("Le serveur a renvoyé un jeu de données invalide. Les données locales sont préservées.");
 await setBaseline(result.payload);localStorage.setItem(DATA_KEY,JSON.stringify(result.payload));const verifiedAt=new Date().toISOString();try{localStorage.setItem("bep-last-sync-at",verifiedAt)}catch{}
 window.dispatchEvent(new CustomEvent("bep:remote-data-refreshed",{detail:{payload:result.payload,verifiedAt}}));window.dispatchEvent(new CustomEvent("bep:offline-synced",{detail:{payload:result.payload,verifiedAt}}));return {verifiedAt,user:auth.user};
}
async function refreshAuthAndSync(){if(!navigator.onLine)return;try{const api=(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");const r=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});if(!r.ok)return;const auth=await r.json();if(!auth.user)return;const identity=String(auth.user.id||auth.user.email||"authenticated");if(localStorage.getItem(USER_KEY)!==identity){localStorage.setItem(USER_KEY,identity);baseline=null;baselineLoaded=false}window.bepSignedIn=true;await flush()}catch{}}
window.BEPOffline={setBaseline,enqueue,flush,readPending:()=>read(queueKey()),stage,discardPending,clearLocalData,refreshAuthAndSync,forceSync,hasKnownUser:()=>!!localStorage.getItem(USER_KEY),hasTrustedSnapshot,markKnownUser:id=>{try{const next=String(id||"authenticated");if(localStorage.getItem(USER_KEY)!==next){localStorage.setItem(USER_KEY,next);localStorage.removeItem(SNAPSHOT_KEY);baseline=null;baselineLoaded=false}}catch{}}};
window.addEventListener("online",()=>{refreshAuthAndSync()});
window.addEventListener("bep:offline-conflict",()=>{window.dispatchEvent(new CustomEvent("bep:toast",{detail:{message:"Synchronisation suspendue : les données du compte ont changé sur un autre appareil. Tes données locales sont préservées."}}))});
})();