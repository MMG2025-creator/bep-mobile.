"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
globalThis.crypto=webcrypto;
const vault=require("../backup-vault.js");
const sample={format:"BEP-BACKUP-DATA",version:1,createdAt:"2026-11-14T12:00:00.000Z",data:{local:{income:3200,incomes:[{id:"i1",amount:3200}],budgets:[{id:"b1",amount:500}],expenses:[],goals:[],transactions:[],savingsOperations:[],coachProfile:[],treasury:{overdraftLimit:200,validUntil:""}},remote:{income:3200},pending:null}};
test("BEP backup encrypts and decrypts the complete payload",async()=>{
 const encrypted=await vault.encrypt(sample,"phrase-de-sauvegarde-solide");
 assert.equal(JSON.parse(encrypted).cipher,"AES-256-GCM");
 assert.deepEqual(await vault.decrypt(encrypted,"phrase-de-sauvegarde-solide"),sample);
 assert.notEqual(encrypted,JSON.stringify(sample));
});
test("BEP backup rejects an incorrect password and tampered ciphertext",async()=>{
 const encrypted=JSON.parse(await vault.encrypt(sample,"phrase-de-sauvegarde-solide"));
 await assert.rejects(()=>vault.decrypt(JSON.stringify(encrypted),"mauvais-mot-de-passe"),/Mot de passe incorrect/);
 encrypted.ciphertext=encrypted.ciphertext.slice(0,-4)+"AAAA";
 await assert.rejects(()=>vault.decrypt(JSON.stringify(encrypted),"phrase-de-sauvegarde-solide"),/Mot de passe incorrect/);
});
test("BEP backup rejects unsupported or malformed payloads",async()=>{
 await assert.rejects(()=>vault.encrypt({format:"OTHER",version:1,data:{local:{}}},"phrase-de-sauvegarde-solide"),/invalide/);
 const encrypted=JSON.parse(await vault.encrypt(sample,"phrase-de-sauvegarde-solide"));
 encrypted.version=99;
 await assert.rejects(()=>vault.decrypt(JSON.stringify(encrypted),"phrase-de-sauvegarde-solide"),/version non prise en charge/);
});
test("BEP backup requires a ten-character password",async()=>{
 await assert.rejects(()=>vault.encrypt(sample,"short"),/10 caractères/);
});
