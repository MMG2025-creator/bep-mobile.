"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("published JavaScript and CSS assets are synchronized",()=>{
 for(const file of ["app.js","financial-engine.js","spend-experience.js","monthly-budget-ui.js","offline-storage.js","sw.js","styles.css"]){
  assert.equal(read(file),read("dist/"+file),file+" source and dist must match");
 }
});

test("both HTML builds expose the current budget, savings and overdraft interfaces",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file),ids=[...html.matchAll(/\\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,file+" contains duplicate IDs");
  for(const id of ["budget","budgetModuleIncome","budgetModuleCharges","incomeForm","overdraftForm","overdraftLimit","overdraftValidUntil","savingsModuleGoals","savingsModuleMovements","monthlyHistoryCard"])assert.ok(ids.includes(id),file+" missing #"+id);
  assert.match(html,/ui-polish\\.css\\?v=/);
  assert.match(html,/monthly-budget-ui\\.js\\?v=/);
 }
});

test("overdraft is a permission only and does not alter the financial engine",()=>{
 const app=read("app.js"),engine=read("financial-engine.js");
 assert.match(app,/treasury:\\{overdraftLimit:0,validUntil:""\\}/);
 assert.match(app,/function overdraftCapacityAllows\\(projectedAvailable\\)/);
 assert.match(app,/return valid&&Number\\(projectedAvailable\\)>=-limit/);
 assert.match(app,/function available\\(\\)\\{return financialPosition\\(\\)\\.available\\}/);
 assert.match(app,/const projectedAvailable=availableBeforeSavings\\(\\)-otherGoals-m;[\\s\\S]{0,250}overdraftCapacityAllows\\(projectedAvailable\\)/);
 assert.match(app,/const projectedAvailable=financialPosition\\(\\{expenses:nextExpenses\\}\\)\\.available;[\\s\\S]{0,250}overdraftCapacityAllows\\(projectedAvailable\\)/);
 assert.doesNotMatch(app,/expectedCredits|overdraftUsed/);
 assert.doesNotMatch(engine,/overdraft/);
});

test("monthly budget offline cache is user-isolated and read-only",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/bep-monthly-history-cache-v1/);
 assert.match(js,/const key = "monthly-history:" \\+ user/);
 assert.match(js,/cached\\?\\.budgets\\?\\.\\[monthKey\\]/);
 assert.match(js,/cacheOnlyMode/);
 assert.match(js,/lecture seule/);
 assert.match(js,/L’enregistrement d’un budget mensuel nécessite une connexion/);
});

test("expense experience remains a separate module and uses the existing purchase form",()=>{
 const html=read("index.html"),spend=read("spend-experience.js");
 assert.match(html,/spend-experience\\.js\\?v=/);
 assert.match(spend,/function init\\(\\)\\{mountFinancialEntryDialogs\\(\\);mountFinancialConfirmDialog\\(\\)/);
 assert.match(spend,/mountQuickExpenseModal\\(panel,entry,addButton\\)/);
 assert.match(spend,/bepQuickExpenseDialog/);
 assert.match(read("spend-experience.css"),/body:has\\(#budget\\.active\\) #bepQuickExpense/);
});

test("offline-first state persistence keeps local writes and conflict protection",()=>{
 const app=read("app.js"),offline=read("offline-storage.js");
 assert.match(app,/window\\.BEPOffline\\.hasKnownUser\\(\\)/);
 assert.match(app,/window\\.BEPOffline\\.setBaseline\\(d\\.payload\\|\\|\\{\\}\\)/);
 assert.match(offline,/hasKnownUser\\(\\)\\)return false/);
 assert.match(offline,/stable\\(remote\\)!==stable\\(pending\\.base\\)/);
 assert.match(offline,/bep:offline-conflict/);
});

test("savings tabs and monthly history bridge remain wired",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/function setSavingsModule\\(name\\)/);
 assert.match(app,/data-savings-module/);
 assert.match(app,/BEP_APPLY_MONTHLY_ITEMS/);
 assert.match(html,/data-savings-module="goals"/);
 assert.match(html,/data-savings-module="movements"/);
});
