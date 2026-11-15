"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("overdraft permission UI supports deletion and has no validity date",()=>{
 const app=read("app.js");
 assert.equal(app,read("dist/app.js"));
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/id="overdraftForm"/);
  assert.match(html,/id="overdraftLimit"/);
  assert.match(html,/id="removeOverdraftBtn"/);
  assert.doesNotMatch(html,/overdraftValidUntil|Valable jusqu/);
 }
 assert.match(app,/removeOverdraftBtn\.onclick/);
 assert.match(app,/state\.treasury=\{overdraftLimit:0\}/);
 assert.doesNotMatch(app,/overdraftValidUntil|overdraftExpired|validUntil/);
 assert.equal(read("spend-experience.js"),read("dist/spend-experience.js"));
});

test("overdraft only authorizes a negative projected balance and never changes financial calculations",()=>{
 const app=read("app.js");
 assert.match(app,/treasury:\{overdraftLimit:0\}/);
 assert.match(app,/function overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/return Number\(projectedAvailable\)>=-limit/);
 assert.match(app,/function available\(\)\{return financialPosition\(\)\.available\}/);
 assert.doesNotMatch(app,/function available\(\)\{[^}]*overdraft/);
 assert.doesNotMatch(app,/function totalIncome\(\)[^}]*overdraft/);
 assert.doesNotMatch(read("financial-engine.js"),/overdraft/);
 const allows=(balance,limit)=>Number(balance)>=-Math.max(0,Number(limit)||0);
 assert.equal(allows(-300,500),true);
 assert.equal(allows(-500,500),true);
 assert.equal(allows(-501,500),false);
 assert.equal(allows(-1,0),false);
 assert.equal(allows(100,0),true);
});

test("savings and new expense entries check the projected balance against the overdraft permission",()=>{
 const app=read("app.js");
 assert.match(app,/const projectedAvailable=availableBeforeSavings\(\)-otherGoals-m;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/const projectedAvailable=financialPosition\(\{expenses:nextExpenses\}\)\.available;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/state\.expenses=nextExpenses/);
});

test("monthly snapshots preserve overdraft separately and expected credits are not treated as income",()=>{
 const app=read("app.js");
 assert.match(app,/const nextState=\{\s*\.\.\.state,/);
 assert.match(app,/nextState\.income=nextIncome/);
 assert.doesNotMatch(app,/expectedCredits/);
});

test("API persists only a validated overdraft limit and removes validity metadata",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.put("/api/data"');
 const route=server.slice(start,server.indexOf('app.use((req,res)=>',start));
 assert.ok(route.includes("const treasury={overdraftLimit}"));
 assert.ok(route.includes('error:"INVALID_TREASURY"'));
 assert.doesNotMatch(route,/validUntil|validDate/);
 assert.ok(route.includes("JSON.stringify(safe)"));
});
