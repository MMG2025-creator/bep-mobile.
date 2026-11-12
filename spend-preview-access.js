(()=>{"use strict";
if(location.hostname!=="bep-depenses-preview.onrender.com")return;
window.BEP_PREVIEW_MODE=true;
const reveal=()=>{
 const gate=document.getElementById("authGate");
 const app=document.querySelector(".app");
 if(gate)gate.hidden=true;
 if(app){app.style.display="block";app.setAttribute("aria-label","Prévisualisation BEP sans compte");}
 const loader=document.getElementById("bepStartupLoader");
 if(loader)loader.hidden=true;
};
reveal();
const observer=new MutationObserver(reveal);
const gate=document.getElementById("authGate");
if(gate)observer.observe(gate,{attributes:true,attributeFilter:["hidden","class","style"]});
const app=document.querySelector(".app");
if(app)observer.observe(app,{attributes:true,attributeFilter:["style","class"]});
window.addEventListener("bep:auth-ready",reveal);
window.addEventListener("DOMContentLoaded",reveal);
})();
