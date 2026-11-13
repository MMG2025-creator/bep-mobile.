"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("published JavaScript assets are synchronized without overwriting production-specific CSS",()=>{
 for(const file of ["app.js","financial-engine.js","spend-experience.js","spend-clean-ui.js","monthly-budget-ui.js","offline-storage.js","sw.js","connection-status.js"]){
  assert.equal(read(file),read("dist/"+file),file+" source and dist must match");
 }
});

test("both HTML builds expose the current budget, savings and overdraft interfaces",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,file+" contains duplicate IDs");
  for(const id of ["budget","budgetModuleIncome","budgetModuleCharges","incomeForm","overdraftForm","overdraftLimit","overdraftValidUntil","savingsModuleGoals","savingsModuleMovements","monthlyHistoryCard"])assert.ok(ids.includes(id),file+" missing #"+id);
  assert.match(html,/ui-polish\.css\?v=/);
  assert.match(html,/monthly-budget-ui\.js\?v=/);
 }
});

test("overdraft is a permission only and does not alter the financial engine",()=>{
 const app=read("app.js"),engine=read("financial-engine.js");
 assert.match(app,/treasury:\{overdraftLimit:0,validUntil:""\}/);
 assert.match(app,/function overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/return valid&&Number\(projectedAvailable\)>=-limit/);
 assert.match(app,/function available\(\)\{return financialPosition\(\)\.available\}/);
 assert.match(app,/const projectedAvailable=availableBeforeSavings\(\)-otherGoals-m;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/const projectedAvailable=financialPosition\(\{expenses:nextExpenses\}\)\.available;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.doesNotMatch(app,/expectedCredits|overdraftUsed/);
 assert.doesNotMatch(engine,/overdraft/);
});

test("monthly budget offline cache is user-isolated and read-only",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/bep-monthly-history-cache-v1/);
 assert.match(js,/const key = "monthly-history:" \+ user/);
 assert.match(js,/cached\?\.budgets\?\.\[monthKey\]/);
 assert.match(js,/cacheOnlyMode/);
 assert.match(js,/lecture seule/);
 assert.match(js,/L’enregistrement d’un budget mensuel nécessite une connexion/);
});

test("expense experience remains a separate module and uses the existing purchase form",()=>{
 const html=read("index.html"),spend=read("spend-experience.js");
 assert.match(html,/spend-experience\.js\?v=/);
 assert.match(spend,/function init\(\)\{mountFinancialEntryDialogs\(\);mountFinancialConfirmDialog\(\)/);
 assert.match(spend,/mountQuickExpenseModal\(panel,entry,addButton\)/);
 assert.match(spend,/bepQuickExpenseDialog/);
 assert.match(read("spend-experience.css"),/body:has\(#budget\.active\) #bepQuickExpense/);
 const clean=read("spend-clean-ui.js");
 assert.equal(clean,read("dist/spend-clean-ui.js"));
 assert.match(clean,/const wasActive=p\.classList\.contains\("active"\)/);
 assert.match(clean,/p\.className="panel bep-expenses-page";if\(wasActive\)p\.classList\.add\("active"\);p\.hidden=!wasActive/);
});

test("offline-first state persistence keeps local writes and conflict protection",()=>{
 const app=read("app.js"),offline=read("offline-storage.js");
 assert.match(app,/window\.BEPOffline\.hasTrustedSnapshot\(\)/);
 assert.match(app,/window\.BEPOffline\.markKnownUser\(/);
 assert.match(app,/window\.BEPOffline\.setBaseline\(d\.payload\|\|\{\}\)/);
 assert.match(offline,/window\.BEPOffline\?\.hasKnownUser\(\)/);
 assert.match(offline,/hasKnownUser:\(\)=>!!localStorage\.getItem\(USER_KEY\)/);
 assert.match(offline,/hasTrustedSnapshot/);
 assert.match(offline,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(offline,/bep:offline-conflict/);
});

test("savings tabs and monthly history bridge remain wired",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/function setSavingsModule\(name\)/);
 assert.match(app,/data-savings-module/);
 assert.match(app,/BEP_APPLY_MONTHLY_ITEMS/);
 assert.match(html,/data-savings-module="goals"/);
 assert.match(html,/data-savings-module="movements"/);
});

test("single-session policy invalidates previous sessions and connection status stays isolated",()=>{
 const server=read("server.js"),status=read("connection-status.js"),html=read("index.html"),sw=read("sw.js");
 assert.match(server,/async function keepSingleSession\(userId,sessionId\)/);
 assert.match(server,/DELETE FROM user_sessions WHERE sess->'user'->>'id'=\$1 AND sid<>\$2/);
 assert.match(server,/keepSingleSession\(u\.id,req\.sessionID\)/);
 assert.match(server,/keepSingleSession\(userId,req\.sessionID\)/);
 assert.match(server,/keepSingleSession\(user\.id,req\.sessionID\)/);
 assert.match(status,/setInterval\(checkSession,15000\)/);
 assert.match(status,/Cette session a été fermée car ton compte a été connecté sur un autre appareil/);
 assert.match(status,/bepConnectionStatus/);
 assert.match(html,/connection-status\.js\?v=/);
 assert.match(html,/connection-status\.css\?v=/);
 assert.match(html,/settingsNetworkState/);
 assert.match(sw,/\.\/connection-status\.js/);
 assert.match(sw,/\.\/connection-status\.css/);
});
