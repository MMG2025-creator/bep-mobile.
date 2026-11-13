/* BEP authentication page controller — isolated from the main application controller. */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const login=$("loginForm"),register=$("registerForm"),verify=$("verifyEmailForm"),forgot=$("forgotPasswordForm"),reset=$("resetPasswordForm"),message=$("authMessage");
 const switcher=document.querySelector(".auth-switch"),google=$("googleLogin"),divider=document.querySelector(".auth-divider"),forgotLink=$("forgotPasswordLink");
 const pendingKey="bep-pending-verification-email";
 let pendingEmail=localStorage.getItem(pendingKey)||"";
 function setMode(mode,clearMessage=false){
  if(login)login.hidden=mode!=="login";
  if(register)register.hidden=mode!=="register";
  if(verify)verify.hidden=mode!=="verify";
  if(forgot)forgot.hidden=mode!=="forgot";
  if(reset)reset.hidden=mode!=="reset";
  if(switcher)switcher.hidden=["verify","forgot","reset"].includes(mode);
  if(google)google.hidden=["verify","forgot","reset"].includes(mode);
  if(divider)divider.hidden=["verify","forgot","reset"].includes(mode);
  if(forgotLink)forgotLink.hidden=mode!=="login";
  $("showLogin")?.classList.toggle("active",mode==="login");
  $("showRegister")?.classList.toggle("active",mode==="register");
  if(clearMessage&&message)message.textContent="";
 }
 function showVerification(email,text){
  pendingEmail=String(email||"").trim().toLowerCase();
  if(pendingEmail)localStorage.setItem(pendingKey,pendingEmail);
  setMode("verify");
  if(message)message.textContent=text||("Code envoyé à "+pendingEmail+". Consulte Gmail puis reviens ici pour le saisir.");
 }
 function clearPendingEmail(){pendingEmail="";localStorage.removeItem(pendingKey);}
 $("showLogin")?.addEventListener("click",()=>setMode("login",true));
 $("showRegister")?.addEventListener("click",()=>setMode("register",true));
 google?.addEventListener("click",async()=>{
  if(google.disabled)return;
  const originalText=google.textContent;
  google.disabled=true;
  google.setAttribute("aria-busy","true");
  const attempts=20;
  try{
   let ready=false;
   for(let attempt=1;attempt<=attempts;attempt++){
    google.textContent="Réveil du serveur… ("+attempt+"/"+attempts+")";
    try{
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),5000);
     let response;
     try{response=await fetch("https://bep-v2-api.onrender.com/api/health",{method:"GET",credentials:"include",cache:"no-store",signal:controller.signal})}
     finally{clearTimeout(timeout)}
     if(response.ok){const health=await response.json();if(health.ok&&health.databaseReady){ready=true;break}}
    }catch{}
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,2500));
   }
   if(!ready)throw new Error("Le serveur BEP met trop de temps à répondre. Réessaie dans quelques instants.");
   google.textContent="Ouverture de Google…";
   window.location.assign("https://bep-v2-api.onrender.com/api/auth/google");
  }catch(error){
   if(message)message.textContent=error.message||"Impossible de joindre le serveur BEP. Réessaie.";
   google.disabled=false;
   google.removeAttribute("aria-busy");
   google.textContent=originalText;
  }
 });
 window.BEPAuthPage={setMode,showVerification,getPendingEmail:()=>pendingEmail,clearPendingEmail};
/* Keep the main BEP application isolated from the standalone authentication module. */
(()=> {
 "use strict";
 const appRoot=document.getElementById("bepAppRoot");
 const authGate=document.getElementById("authGate");
 if(!appRoot)return;
 function syncApplicationAccess(){
  const allowed=window.bepSignedIn===true||window.bepOfflineMode===true;
  appRoot.hidden=!allowed;
  if(authGate)authGate.hidden=allowed;
  document.documentElement.classList.toggle("bep-authenticated-view",allowed);
 }
 window.addEventListener("bep:auth-ready",syncApplicationAccess);
 syncApplicationAccess();
})();

})();
