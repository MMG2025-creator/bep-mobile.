(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={sync:"idle",lastSync:null,session:"unknown"};
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function render(){
 const online=navigator.onLine;
 let label="Connecté";
 let detail="Connecté au réseau";
 let cls="is-online";
 if(!online){label="Hors ligne";detail="Données conservées sur cet appareil";cls="is-offline"}
 else if(state.session==="expired"){label="Session expirée";detail="Une nouvelle connexion est nécessaire";cls="is-error"}
 else if(state.sync==="conflict"){label="Synchronisation suspendue";detail="Conflit détecté : données locales préservées";cls="is-error"}
 else if(state.sync==="pending"){label="Synchronisation en attente";detail="Modifications locales à transmettre";cls="is-pending"}
 else if(state.sync==="syncing"){label="Synchronisation…";detail="Échange sécurisé avec le serveur";cls="is-pending"}
 const root=$("bepConnectionStatus");if(root){root.className="bep-connection-status "+cls;root.title=detail}
 setText("bepConnectionLabel",label);
 setText("settingsNetworkState",online?"Connecté":"Hors ligne");
 setText("settingsSessionState",state.session==="expired"?"Session révoquée ou expirée":window.bepSignedIn?"Session active":"Non connecté / mode local");
 setText("settingsSyncState",state.sync==="conflict"?"Suspendue — conflit à résoudre":state.sync==="pending"?"En attente":state.sync==="syncing"?"En cours":online?"Aucune opération en attente":"En pause jusqu'au retour du réseau");
 setText("settingsLastSync",state.lastSync?new Date(state.lastSync).toLocaleString("fr-FR"):"Aucune synchronisation confirmée sur cet appareil");
}
async function refreshPending(){
 try{const p=await window.BEPOffline?.readPending?.();const count=p?1:0;setText("settingsPendingCount",String(count));if(count&&state.sync==="idle")state.sync="pending";if(!count&&state.sync==="pending")state.sync="idle"}catch{setText("settingsPendingCount","Indisponible")}
 render();
}
async function checkSession(){
 if(!navigator.onLine||!window.bepSignedIn)return;
 try{
  const api=(window.BEP_API_BASE||"https://bep-coach-functional-test-api-vouu.onrender.com").replace(/\/+$/,"");
  const r=await fetch(api+"/api/auth/status",{credentials:"include",cache:"no-store"});
  if(r.status===401||r.ok&&!(await r.clone().json()).user){
   state.session="expired";window.bepSignedIn=false;
   const gate=$("authGate"),app=document.querySelector(".app"),message=$("authMessage");
   if(message)message.textContent="Cette session a été fermée car ton compte a été connecté sur un autre appareil. Reconnecte-toi pour continuer. Tes données locales sont conservées.";
   if(gate)gate.hidden=false;
   if(app)app.setAttribute("aria-hidden","true");
   render();return;
  }
  if(r.ok){state.session="active"}
 }catch{}
 render();
}
window.addEventListener("online",async()=>{state.sync="syncing";render();try{await window.BEPOffline?.refreshAuthAndSync?.()}finally{await refreshPending();if(state.sync==="syncing")state.sync="idle";render();checkSession()}});
window.addEventListener("offline",()=>{render()});
window.addEventListener("bep:offline-pending",()=>{state.sync="pending";refreshPending()});
window.addEventListener("bep:offline-conflict",()=>{state.sync="conflict";render()});
window.addEventListener("bep:offline-sync-error",()=>{state.sync="pending";render()});
window.addEventListener("bep:offline-synced",()=>{state.sync="idle";state.lastSync=new Date().toISOString();try{localStorage.setItem("bep-last-sync-at",state.lastSync)}catch{}refreshPending()});
window.addEventListener("bep:auth-ready",()=>{if(window.bepSignedIn){state.session="active";state.sync="idle";document.querySelector(".app")?.removeAttribute("aria-hidden");checkSession()}else if(!navigator.onLine){state.session="offline"}render();refreshPending()});
try{state.lastSync=localStorage.getItem("bep-last-sync-at")}catch{}
render();refreshPending();checkSession();window.setInterval(checkSession,15000);window.setInterval(refreshPending,10000);
})();