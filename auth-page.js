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
  /* Enforce visibility with an inline !important rule so global/module CSS cannot reveal private UI. */
  appRoot.hidden=!allowed;
  appRoot.inert=!allowed;
  appRoot.setAttribute("aria-hidden",String(!allowed));
  appRoot.style.setProperty("display",allowed?"block":"none","important");
  if(authGate)authGate.hidden=allowed;
  document.documentElement.classList.toggle("bep-authenticated-view",allowed);
 }
 window.addEventListener("bep:auth-ready",syncApplicationAccess);
 syncApplicationAccess();
})();


 /* Authentication lifecycle is owned here; the application receives only a verified session. */
 const API=String(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
 const loginMessageMap={success:"Connexion Google réussie.",error:"Google n’a pas finalisé la connexion. Vérifie le compte Google choisi puis réessaie.",google_config_error:"La configuration Google de BEP est invalide : le Client Secret OAuth doit être renouvelé dans Google Cloud puis mis à jour sur le serveur.",link_required:"Un compte BEP existe déjà avec cette adresse. Connecte-toi par e-mail puis associe Google dans les paramètres.",link_email_mismatch:"Choisis dans Google la même adresse e-mail que celle de ton compte BEP.",google_already_linked:"Ce compte Google est déjà associé à un autre compte BEP.",google_email_changed:"L’adresse e-mail Google ne correspond plus au compte associé.",link_session_required:"La session BEP a expiré. Reconnecte-toi puis réessaie.",link_account_missing:"Le compte BEP à associer est introuvable.",link_session_error:"Google est associé, mais la session n’a pas pu être actualisée. Reconnecte-toi.",google_linked:"Compte Google associé avec succès."};
 const authGate=document.getElementById("authGate");
 const loginForm=$("loginForm"),registerForm=$("registerForm"),verifyForm=$("verifyEmailForm"),message=$("authMessage");
 function showAuthMessage(value){if(message)message.textContent=value}
 async function finishAppAuthentication(isNew){
  if(!window.BEPApp)throw Error("Le moteur BEP n’est pas prêt. Recharge la page puis réessaie.");
  await window.BEPApp.finishAuth(isNew);
 }
 $("resendVerification")?.addEventListener("click",async()=>{
  const email=pendingEmail;if(!email)return showAuthMessage("Adresse e-mail manquante. Recommence l'inscription.");
  showAuthMessage("Envoi du code…");
  try{const r=await fetch(API+"/api/auth/resend-verification",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})}),d=await r.json();if(!r.ok)throw Error(d.message||"Envoi impossible.");showAuthMessage("Un nouveau code a été envoyé à "+email+".")}catch(e){showAuthMessage(e.message)}
 });
 verifyForm?.addEventListener("submit",async e=>{
  e.preventDefault();if(!pendingEmail)return showAuthMessage("Adresse e-mail manquante. Recommence l'inscription.");
  showAuthMessage("Vérification…");
  try{const r=await fetch(API+"/api/auth/verify-email",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:pendingEmail,code:$("verifyEmailCode").value})}),d=await r.json();if(!r.ok)throw Error(d.message||"Vérification impossible.");await finishAppAuthentication(true)}catch(error){showAuthMessage(error.message)}
 });
 loginForm?.addEventListener("submit",async e=>{
  e.preventDefault();showAuthMessage("Connexion…");
  try{const r=await fetch(API+"/api/auth/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})}),d=await r.json();if(!r.ok)throw Error(d.message||"Connexion impossible.");await finishAppAuthentication(false)}catch(error){showAuthMessage(error.message)}
 });
 register?.addEventListener("submit",async e=>{
  e.preventDefault();const email=$("registerEmail").value.trim().toLowerCase();showAuthMessage("Création du compte et envoi du code…");
  try{const r=await fetch(API+"/api/auth/register",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("registerName").value,email,password:$("registerPassword").value})}),d=await r.json();if(!r.ok){if(r.status===409){showVerification(email,"Un compte existe déjà avec cette adresse. Si l'inscription précédente a été interrompue, appuie sur « Renvoyer le code ».");return}throw Error(d.message||"Création impossible.")}showVerification(d.email,"Code envoyé à "+d.email+". Consulte Gmail puis reviens ici pour le saisir.")}catch(error){showAuthMessage(error.message)}
 });
 async function restoreSession(){
  const params=new URLSearchParams(window.location.search),oauthResult=params.get("login");
  if(params.has("reset")){authGate.hidden=false;return}
  if(oauthResult&&loginMessageMap[oauthResult]){showAuthMessage(loginMessageMap[oauthResult]);history.replaceState({},document.title,window.location.pathname+window.location.hash)}
  if(pendingEmail)showVerification(pendingEmail,"Inscription en attente pour "+pendingEmail+". Saisis le code reçu ou demande-en un nouveau.");
  try{
   let data=null,lastStatus=0;
   for(let attempt=0;attempt<12;attempt++){
    const response=await fetch(API+"/api/auth/status",{credentials:"include",cache:"no-store"});lastStatus=response.status;
    if(!response.ok)throw Error("Vérification de session impossible (HTTP "+response.status+").");
    data=await response.json();if(data.user)break;
    if(attempt<11)await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(data?.user){await window.BEPApp.initializeAuthenticatedSession(data.user);return}
   if(oauthResult==="success")showAuthMessage("Google a confirmé la connexion, mais la session BEP n’a pas été retrouvée. Vérifie que les cookies du site sont autorisés, puis réessaie.");
   authGate.hidden=false;
  }catch(error){
   if(window.BEPOffline&&window.BEPOffline.hasKnownUser()&&window.BEPApp){window.BEPApp.enableOfflineMode();notifyOfflineFallback();return}
   authGate.hidden=false;showAuthMessage(error.message||"Connexion au serveur impossible.");
  }finally{const startupLoader=document.getElementById("bepStartupLoader");if(startupLoader)startupLoader.hidden=true}
 }
 function notifyOfflineFallback(){showAuthMessage("Mode hors ligne : tes données locales restent accessibles. Les changements seront synchronisés après reconnexion et vérification du compte.")}
 window.addEventListener("load",restoreSession,{once:true});

})();
