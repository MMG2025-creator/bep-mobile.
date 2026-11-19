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
  const reloadAfterControllerChange=()=>{
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
  };
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js?v=27",{scope:"./",updateViaCache:"none"})
      .then(registration=>{
        checkForUpdate(registration);
        window.addEventListener("focus",()=>checkForUpdate(registration));
        document.addEventListener("visibilitychange",()=>checkForUpdate(registration));
        window.setInterval(()=>checkForUpdate(registration),5*60*1000);
        registration.addEventListener("updatefound",()=>{
          const worker=registration.installing;
          if(worker)worker.addEventListener("statechange",()=>{
            if(worker.state==="redundant")console.error("BEP PWA: le nouveau Service Worker n'a pas pu être installé");
          });
        });
      })
      .catch(error=>console.warn("BEP PWA: service worker non disponible",error));
  });
}
refresh();
})();