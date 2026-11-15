(()=>{"use strict";
const params=new URLSearchParams(window.location.search);
const result=params.get("result")||"error";
const flowId=String(params.get("flow_id")||"");
const retryAfter=Math.max(0,Math.min(3600,Number(params.get("retry"))||0));
const allowed=new Set(["success","error","google_config_error","link_required","link_email_mismatch","google_already_linked","google_email_changed","link_session_required","link_account_missing","link_session_error","google_linked","rate_limited","google_cancelled"]);
const safeResult=allowed.has(result)?result:"error";
const messages={
 success:"Connexion Google réussie.",
 google_linked:"Compte Google associé avec succès.",
 google_cancelled:"Connexion Google annulée.",
 rate_limited:"Trop de tentatives. Tu peux réessayer après le délai indiqué.",
 google_config_error:"La configuration Google de BEP est indisponible.",
 link_required:"Un compte BEP existe déjà avec cette adresse. Connecte-toi par e-mail puis associe Google dans les paramètres.",
 link_email_mismatch:"Choisis dans Google la même adresse e-mail que celle de ton compte BEP.",
 google_already_linked:"Ce compte Google est déjà associé à un autre compte BEP.",
 google_email_changed:"L’adresse e-mail Google ne correspond plus au compte associé.",
 link_session_required:"La session BEP a expiré. Reconnecte-toi puis réessaie.",
 link_account_missing:"Le compte BEP à associer est introuvable.",
 link_session_error:"Google est associé, mais la session n’a pas pu être actualisée. Reconnecte-toi.",
 error:"La connexion Google n’a pas abouti. Tu peux fermer cette fenêtre et réessayer."
};
const title=document.getElementById("oauthTitle"),message=document.getElementById("oauthMessage"),home=document.getElementById("oauthHome");
if(flowId&&/^[a-f0-9]{32}$/.test(flowId)){
 try{localStorage.setItem("bep-google-oauth-result:"+flowId,JSON.stringify({id:flowId,result:safeResult,retryAfter,at:Date.now()}))}catch{}
 title.textContent=safeResult==="success"||safeResult==="google_linked"?"Connexion terminée":"Retour vers BEP";
 message.textContent="Tu peux reprendre BEP. Cette fenêtre va se fermer.";
 window.setTimeout(()=>{try{window.close()}catch{}},250);
}else{
 title.textContent="Connexion BEP";
 message.textContent=messages[safeResult]||messages.error;
 home.hidden=false;
}
})();