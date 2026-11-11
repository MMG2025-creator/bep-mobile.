"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {verificationFailure}=require("../email-verification-policy");

test("un code expiré ou absent reste redemandable",()=>{
 const result=verificationFailure({recordFound:false,emailVerified:false});
 assert.equal(result.status,400);
 assert.equal(result.body.error,"CODE_EXPIRED");
});
test("un code incorrect est rejeté",()=>{
 const result=verificationFailure({recordFound:true,codeMatches:false});
 assert.equal(result.status,400);
 assert.equal(result.body.error,"INVALID_CODE");
});
test("un code déjà consommé ne peut pas être rejoué",()=>{
 const result=verificationFailure({recordFound:false,emailVerified:true});
 assert.equal(result.status,409);
 assert.equal(result.body.error,"CODE_ALREADY_USED");
});
test("un code valide n'est pas classé en échec",()=>{
 assert.equal(verificationFailure({recordFound:true,codeMatches:true}),null);
});
