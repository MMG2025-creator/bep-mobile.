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

test("extracts purchase time and classifies a card terminal receipt",()=>{
 const result=extract(["CARTE BANCAIRE","LE 11/11/26 A 13:42:32","PHARMACIE DU CC","MONTANT :","17,99 EUR"].join("\\n"));
 assert.equal(result.date,"2026-11-11");
 assert.equal(result.time,"13:42:32");
 assert.equal(result.dateTime,"2026-11-11T13:42:32");
 assert.equal(result.documentType,"ticket_caisse");
 assert.ok(result.confidence.time>=.9);
});
test("recognizes an online order screenshot and extracts its total",()=>{
 const result=extract(["Amazon.fr","Commande confirmée","Date de commande : 11/11/2026","Total de la commande : 42,90 €"].join("\\n"));
 assert.equal(result.date,"2026-11-11");
 assert.equal(result.amount,42.9);
 assert.equal(result.documentType,"commande_web");
 assert.equal(result.merchant,"Amazon.fr");
});
test("uses adjacent OCR lines to identify a labelled amount",()=>{
 const result=extract(["MAGASIN DU CENTRE","TOTAL TTC","17,99 EUR"].join("\\n"));
 assert.equal(result.amount,17.99);
 assert.ok(result.confidence.amount>=.95);
});

test("source and published OCR assets stay synchronized and support generic image uploads",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 assert.equal(fs.readFileSync(path.join(root,"receipt-ocr.js"),"utf8"),fs.readFileSync(path.join(root,"dist/receipt-ocr.js"),"utf8"));
 for(const file of ["app.js","dist/app.js"]){
  const js=fs.readFileSync(path.join(root,file),"utf8");
  assert.ok(js.includes("image\\/"), file + " must accept image MIME types");
  assert.match(js,/Support détecté/);
  assert.ok(js.includes('canvas.toDataURL("image/jpeg",.86)'));
  assert.ok(js.includes("loadHeicDecoder"));
  assert.ok(js.includes("heic2any@0.0.4"));
  assert.ok(js.includes("decodeReceiptImage"));
  assert.match(js,/worker\.recognize\(ocrImage\)/);
  assert.doesNotMatch(js,/canvas\.toBlob/);
  assert.match(js,/extracted\.confidence\.time/);
 }
 for(const file of ["index.html","dist/index.html"]){
  const html=fs.readFileSync(path.join(root,file),"utf8");
  assert.match(html,/id="receiptFile" type="file" accept="image\\/\\*,\\.heic,\\.heif"/);
  assert.match(html,/receipt-ocr\.js\?v=2&bep=multi-source-ocr-20261112/);
 }
});
