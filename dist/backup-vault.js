(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.BEPBackupVault=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const FORMAT="BEP-ENCRYPTED-BACKUP",VERSION=1,ITERATIONS=310000,MAX_BYTES=10*1024*1024;
 const bytesToBase64=bytes=>{let binary="";for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);return btoa(binary)};
 const base64ToBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const cryptoApi=()=>{if(!globalThis.crypto?.subtle)throw Error("Le chiffrement sécurisé n’est pas disponible sur cet appareil.");return globalThis.crypto};
 function validateData(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||value.format!=="BEP-BACKUP-DATA"||value.version!==VERSION||!value.data||typeof value.data!=="object"||Array.isArray(value.data))throw Error("Cette sauvegarde BEP est invalide ou incompatible.");
  const local=value.data.local;
  if(!local||typeof local!=="object"||Array.isArray(local))throw Error("La sauvegarde ne contient pas de données locales valides.");
  for(const key of ["incomes","budgets","expenses","goals","transactions","savingsOperations","coachProfile"])if(local[key]!=null&&!Array.isArray(local[key]))throw Error("Structure de sauvegarde invalide : "+key+".");
  if(value.data.remote!=null&&(typeof value.data.remote!=="object"||Array.isArray(value.data.remote)))throw Error("Les données du compte dans la sauvegarde sont invalides.");
  if(value.data.pending!=null&&(typeof value.data.pending!=="object"||Array.isArray(value.data.pending)))throw Error("La file de synchronisation dans la sauvegarde est invalide.");
  return value;
 }
 async function derive(password,salt,iterations){
  const c=cryptoApi(),material=await c.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return c.subtle.deriveKey({name:"PBKDF2",salt,iterations,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 }
 async function encrypt(payload,password){
  if(typeof password!=="string"||password.length<10)throw Error("Le mot de passe de sauvegarde doit contenir au moins 10 caractères.");
  validateData(payload);
  const plain=new TextEncoder().encode(JSON.stringify(payload));if(plain.length>MAX_BYTES)throw Error("La sauvegarde dépasse la taille maximale autorisée (10 Mo).");
  const c=cryptoApi(),salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12)),key=await derive(password,salt,ITERATIONS);
  const encrypted=await c.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  return JSON.stringify({format:FORMAT,version:VERSION,kdf:"PBKDF2-SHA-256",iterations:ITERATIONS,cipher:"AES-256-GCM",salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))});
 }
 async function decrypt(serialized,password){
  if(typeof password!=="string"||password.length<10)throw Error("Saisis le mot de passe de sauvegarde (10 caractères minimum).");
  if(typeof serialized!=="string"||serialized.length>MAX_BYTES*2)throw Error("Fichier de sauvegarde trop volumineux ou invalide.");
  let envelope;try{envelope=JSON.parse(serialized)}catch{throw Error("Le fichier sélectionné n’est pas une sauvegarde BEP valide.");}
  if(!envelope||envelope.format!==FORMAT||envelope.version!==VERSION||envelope.kdf!=="PBKDF2-SHA-256"||envelope.cipher!=="AES-256-GCM"||envelope.iterations!==ITERATIONS||typeof envelope.salt!=="string"||typeof envelope.iv!=="string"||typeof envelope.ciphertext!=="string")throw Error("Format de sauvegarde inconnu ou version non prise en charge.");
  try{
   const c=cryptoApi(),salt=base64ToBytes(envelope.salt),iv=base64ToBytes(envelope.iv),ciphertext=base64ToBytes(envelope.ciphertext);
   if(salt.length!==16||iv.length!==12||ciphertext.length>MAX_BYTES+32)throw Error("invalid envelope");
   const key=await derive(password,salt,ITERATIONS),plain=await c.subtle.decrypt({name:"AES-GCM",iv},key,ciphertext);
   return validateData(JSON.parse(new TextDecoder().decode(plain)));
  }catch(error){if(error.message?.includes("invalide")||error.message?.includes("incompatible"))throw error;throw Error("Mot de passe incorrect ou fichier de sauvegarde altéré.");}
 }
 return {encrypt,decrypt,validateData,FORMAT,VERSION};
});
