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
 google?.addEventListener("click",()=>{window.location.href="https://bep-v2-api.onrender.com/api/auth/google"});
 window.BEPAuthPage={setMode,showVerification,getPendingEmail:()=>pendingEmail,clearPendingEmail};
})();
