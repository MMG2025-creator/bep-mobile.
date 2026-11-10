(()=>{"use strict";
const btn=document.getElementById("installBtn");let deferred=null;
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
function refresh(){if(!btn)return;if(standalone()){btn.hidden=false;btn.textContent="Application installée";btn.disabled=true}else if(deferred){btn.hidden=false;btn.disabled=false;btn.textContent="Installer l’app"}else{btn.hidden=false;btn.disabled=false;btn.textContent="Ajouter à l’écran d’accueil"}}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;refresh()});
window.addEventListener("appinstalled",()=>{deferred=null;refresh();});
if(btn)btn.addEventListener("click",async()=>{if(standalone())return;if(deferred){deferred.prompt();const choice=await deferred.userChoice;deferred=null;refresh();if(choice.outcome==="accepted")btn.textContent="Installation lancée";return}
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid=/android/i.test(navigator.userAgent);
const msg=isIOS?"Sur iPhone : touche Partager, puis « Sur l’écran d’accueil ».":"Dans Chrome : ouvre le menu ⋮ puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».";
if(isAndroid||isIOS)alert(msg);else alert("Ouvre BEP depuis Chrome ou Edge, puis choisis Installer l’application dans le menu du navigateur.");
});
if("serviceWorker"in navigator&&location.protocol==="https:"){navigator.serviceWorker.register("./sw.js").then(reg=>reg.update()).catch(()=>{});}
refresh();
})();