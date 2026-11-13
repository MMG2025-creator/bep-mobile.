"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("treasury and overdraft UI is mirrored in the published frontend",()=>{
 assert.equal(read("app.js"),read("dist/app.js"));
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  for(const id of ["treasuryForm","overdraftLimit","overdraftUsed","overdraftValidUntil","overdraftAlertPercent","expectedCreditForm","expectedCreditLabel","expectedCreditAmount","expectedCreditDate","treasurySummary","treasuryForecast"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/treasury-overdraft-20261113/);
 }
});

test("overdraft is stored separately from budget income and available balance",()=>{
 const app=read("app.js");
 assert.match(app,/treasury:\{overdraftLimit:0,usedAmount:0,validUntil:"",alertPercent:80,expectedCredits:\[\]\}/);
 assert.match(app,/state\.treasury=\{\.\.\.state\.treasury,overdraftLimit:limit,usedAmount:used,validUntil,alertPercent\}/);
 assert.match(app,/status:x\.status==="received"\?"received":"planned"/);
 assert.match(app,/Marge restante/);
 assert.match(app,/Dépassement de la limite autorisée/);
 assert.doesNotMatch(app,/function available\(\)\{[^}]*overdraft/);
});

test("treasury feature does not alter the standalone expenses module",()=>{
 assert.match(read("index.html"),/spend-experience\.js\?v=/);
 assert.match(read("index.html"),/spend-clean-ui\.js\?v=/);
 assert.match(read("app.js"),/function charges\(\)/);
});
