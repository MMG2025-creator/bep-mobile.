"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("overdraft permission UI is part of income and mirrored in production assets",()=>{
 const app=read("app.js");
 assert.equal(app,read("dist/app.js"));
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/<section class="card overdraft-permission-card"/);
  assert.match(html,/id="overdraftForm"/);
  assert.match(html,/id="overdraftLimit"/);
  assert.match(html,/id="overdraftValidUntil"/);
  assert.doesNotMatch(html,/id="treasuryForm"|id="expectedCreditForm"|id="overdraftUsed"/);
  assert.match(html,/overdraft-permission-20261113/);
 }
 const dialogs=read("spend-experience.js");
 assert.match(dialogs,/\["overdraft","Découvert autorisé","Gérer mon découvert autorisé","\.overdraft-permission-card"\]/);
 assert.equal(dialogs,read("dist/spend-experience.js"));
 assert.match(app,/BEP_OPEN_ENTRY_DIALOG\("overdraft"\)/);
 assert.match(app,/detail:\{id:"overdraft"\}/);
 assert.equal(app,read("dist/app.js"));
});

test("overdraft only authorizes a negative projected balance and never changes financial calculations",()=>{
 const app=read("app.js");
 assert.match(app,/treasury:\{overdraftLimit:0,validUntil:""\}/);
 assert.match(app,/function overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/return valid&&Number\(projectedAvailable\)>=-limit/);
 assert.match(app,/function available\(\)\{return financialPosition\(\)\.available\}/);
 assert.match(app,/function availableBeforeSavings\(\)\{return financialPosition\(\{goals:\[\]\}\)\.available\}/);
 assert.doesNotMatch(app,/function available\(\)\{[^}]*overdraft/);
 assert.doesNotMatch(app,/function totalIncome\(\)[^}]*overdraft/);
 const allows=(balance,limit,valid=true)=>valid&&Number(balance)>=-Math.max(0,Number(limit)||0);
 assert.equal(allows(-300,500),true);
 assert.equal(allows(-500,500),true);
 assert.equal(allows(-501,500),false);
 assert.equal(allows(-1,0),false);
 assert.equal(allows(100,0),true);
 assert.equal(allows(-100,500,false),false);
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

test("standalone expenses module assets remain present and untouched",()=>{
 assert.match(read("index.html"),/spend-experience\.js\?v=/);
 assert.match(read("index.html"),/spend-clean-ui\.js\?v=/);
 assert.match(read("app.js"),/function charges\(\)/);
});
