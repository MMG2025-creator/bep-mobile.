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
  let hadController=Boolean(navigator.serviceWorker.controller);
  let updateBannerShown=false;
  const showUpdateBanner=()=>{
    if(updateBannerShown||!document.body)return;
    updateBannerShown=true;
    const banner=document.createElement("div");
    banner.id="bepUpdateAvailable";
    banner.setAttribute("role","status");
    banner.setAttribute("aria-live","polite");
    banner.style.cssText="position:fixed;z-index:10001;top:calc(env(safe-area-inset-top, 0px) + 12px);left:12px;right:12px;max-width:560px;margin:0 auto;padding:13px 14px;border:1px solid #c9d9ce;border-radius:14px;background:#fff;box-shadow:0 8px 28px rgba(15,45,34,.18);display:flex;align-items:center;gap:12px;color:#173b30;font:500 14px/1.35 system-ui,sans-serif";
    banner.innerHTML='<span style="flex:1">Une nouvelle version de BEP est disponible.</span><button type="button" data-bep-update-now style="border:0;border-radius:999px;background:#176b50;color:#fff;padding:9px 13px;font-weight:700;white-space:nowrap">Actualiser</button><button type="button" data-bep-update-dismiss aria-label="Fermer" style="border:0;background:transparent;color:#52665d;font-size:21px;padding:2px 5px">×</button>';
    banner.querySelector("[data-bep-update-now]").addEventListener("click",()=>window.location.reload());
    banner.querySelector("[data-bep-update-dismiss]").addEventListener("click",()=>banner.remove());
    document.body.appendChild(banner);
  };
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(hadController)showUpdateBanner();
    hadController=true;
  });
  const checkForUpdate=registration=>{
    if(document.visibilityState==="visible"&&navigator.onLine)registration.update().catch(()=>{});
  };
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"})
      .then(registration=>{
        checkForUpdate(registration);
        window.addEventListener("focus",()=>checkForUpdate(registration));
        document.addEventListener("visibilitychange",()=>checkForUpdate(registration));
        window.setInterval(()=>checkForUpdate(registration),5*60*1000);
      })
      .catch(error=>console.warn("BEP PWA: service worker non disponible",error));
  });
}
refresh();
})();