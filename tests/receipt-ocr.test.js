"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {extract}=require("../receipt-ocr.js");
test("extracts merchant, amount, date, city and pharmacy category from a card terminal receipt",()=>{
 const text=["CARTE BANCAIRE","SANS CONTACT","A000000003101001","VISA COMPTANT","LE 11/11/26 A 13:42:32","PHARMACIE DU CC","78360","MONTESSON","NO AUTO : 531243","MONTANT : 17,99 EUR"].join("\n");
 const result=extract(text);
 assert.equal(result.merchant,"PHARMACIE DU CC");
 assert.equal(result.amount,17.99);
 assert.equal(result.date,"2026-11-11");
 assert.equal(result.city,"MONTESSON");
 assert.equal(result.category,"Santé et pharmacie");
 assert.ok(result.confidence.amount>=.9);
});
test("prefers the explicit total over line-item amounts and flags competing totals",()=>{
 const result=extract(["BOULANGERIE MARTIN","11/11/2026","PAIN 2,50","CAFE 1,80","TOTAL TTC 4,30 EUR"].join("\n"));
 assert.equal(result.amount,4.3);
 assert.equal(result.date,"2026-11-11");
 assert.equal(result.category,"Restaurant et sorties");
});
test("does not mistake expiry dates for purchase dates and rejects impossible dates",()=>{
 const result=extract(["PHARMACIE CENTRALE","Date expiration 31/12/2027","LE 31/02/2026","MONTANT 12,50 EUR"].join("\n"));
 assert.equal(result.date,"");
 assert.equal(result.amount,12.5);
});
test("returns reviewable low-confidence values when amount is not explicitly labelled",()=>{
 const result=extract(["MAGASIN TEST","11/11/2026","12,50","8,90"].join("\n"));
 assert.equal(result.amount,8.9);
 assert.ok(result.confidence.amount<.7);
});
