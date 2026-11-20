(()=>{"use strict";
const button=document.getElementById("installBtn");
let deferredPrompt=null;
const isStandalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)&&!isStandalone();
const refresh=()=>{
  if(!button)return;
  if(isStandalone()){button.hidden=true;return;}
  button.hidden=false;
  button.disabled=false;
  button.textContent="Installer BEP";
  button.setAttribute("aria-label","Installer BEP sur cet appareil");
};
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();deferredPrompt=event;refresh();
});
window.addEventListener("appinstalled",()=>{deferredPrompt=null;refresh();});
if(button)button.addEventListener("click",async()=>{
  if(isStandalone())return;
  if(deferredPrompt){
    const prompt=deferredPrompt;deferredPrompt=null;
    await prompt.prompt();
    const choice=await prompt.userChoice;
    if(choice&&choice.outcome==="accepted"){button.textContent="Installation lancée";button.disabled=true;}
    else refresh();
    return;
  }
  const instructions=isIOS()
    ?"Pour installer BEP sur ton iPhone :\n1. Appuie sur le bouton Partager de Safari.\n2. Choisis « Sur l’écran d’accueil ».\n3. Appuie sur Ajouter."
    :/android/i.test(navigator.userAgent)
      ?"Dans Chrome : ouvre le menu ⋮ puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »."
      :"Dans Chrome ou Edge : ouvre le menu du navigateur puis choisis « Installer BEP » ou « Installer cette application ».";
  window.alert(instructions);
});
if("serviceWorker" in navigator){
  const hadController=Boolean(navigator.serviceWorker.controller);
  const showUpdateNotice=registration=>{
    if(!registration.waiting||!hadController||document.getElementById("bepUpdateNotice"))return;
    if(!document.getElementById("bep-update-style")){
      const style=document.createElement("style");style.id="bep-update-style";
      style.textContent=".bep-update-notice{position:fixed;z-index:10001;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border:1px solid #cbded2;border-radius:16px;background:#fff;color:#173b30;box-shadow:0 12px 36px #102e2930;font:500 14px/1.45 system-ui,sans-serif}.bep-update-actions{display:flex;gap:8px;margin-left:auto}.bep-update-actions button{min-height:38px;padding:0 13px;border:1px solid #cbded2;border-radius:10px;background:#f2f7f3;color:#173b30;font:600 13px system-ui,sans-serif;cursor:pointer}.bep-update-actions [data-bep-update-accept]{border-color:#176b50;background:#176b50;color:#fff}.bep-update-actions button:focus-visible{outline:3px solid #e8c66f;outline-offset:2px}@media(max-width:480px){.bep-update-notice{align-items:flex-start}.bep-update-actions{width:100%;justify-content:flex-end}}";
      document.head.appendChild(style);
    }
    const notice=document.createElement("div");notice.id="bepUpdateNotice";notice.className="bep-update-notice";notice.setAttribute("role","status");notice.setAttribute("aria-live","polite");
    const message=document.createElement("span");message.textContent="Une nouvelle version de BEP est disponible.";
    const actions=document.createElement("div");actions.className="bep-update-actions";
    const accept=document.createElement("button");accept.type="button";accept.textContent="Mettre à jour";accept.setAttribute("data-bep-update-accept","");
    accept.addEventListener("click",()=>{const waiting=registration.waiting;if(!waiting)return;accept.disabled=true;accept.textContent="Mise à jour…";waiting.postMessage({type:"BEP_SKIP_WAITING"});});
    const dismiss=document.createElement("button");dismiss.type="button";dismiss.textContent="Plus tard";dismiss.setAttribute("data-bep-update-dismiss","");
    dismiss.addEventListener("click",()=>notice.remove());
    actions.append(accept,dismiss);notice.append(message,actions);document.body.appendChild(notice);
  };
  const reloadAfterControllerChange=()=>{
    if(!hadController)return;
    try{
      const key="bep-sw-controller-refresh";
      const previous=Number(sessionStorage.getItem(key)||0);
      const now=Date.now();
      if(now-previous<30000)return;
      sessionStorage.setItem(key,String(now));
    }catch(_error){}
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange",reloadAfterControllerChange);
  const checkForUpdate=registration=>{
    if(document.visibilityState==="visible"&&navigator.onLine){
      registration.update().catch(error=>console.warn("BEP PWA: vérification de mise à jour impossible",error));
    }
    showUpdateNotice(registration);
  };
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js?v=29",{scope:"./",updateViaCache:"none"})
      .then(registration=>{
        checkForUpdate(registration);
        window.addEventListener("focus",()=>checkForUpdate(registration));
        document.addEventListener("visibilitychange",()=>checkForUpdate(registration));
        window.setInterval(()=>checkForUpdate(registration),5*60*1000);
        registration.addEventListener("updatefound",()=>{
          const worker=registration.installing;
          if(worker)worker.addEventListener("statechange",()=>{
            if(worker.state==="installed")showUpdateNotice(registration);
            if(worker.state==="redundant")console.error("BEP PWA: le nouveau Service Worker n'a pas pu être installé");
          });
        });
      })
      .catch(error=>console.warn("BEP PWA: service worker non disponible",error));
  });
}
refresh();
})();