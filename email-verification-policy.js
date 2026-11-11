"use strict";
function verificationFailure({recordFound,emailVerified,codeMatches}){
 if(!recordFound){
  return emailVerified
   ? {status:409,body:{error:"CODE_ALREADY_USED",message:"Ce code a déjà été utilisé. Ton adresse est déjà vérifiée."}}
   : {status:400,body:{error:"CODE_EXPIRED",message:"Code expiré ou remplacé. Demande un nouveau code."}};
 }
 if(codeMatches===false)return {status:400,body:{error:"INVALID_CODE",message:"Code incorrect."}};
 return null;
}
module.exports={verificationFailure};
