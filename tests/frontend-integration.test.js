"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("published JavaScript assets are synchronized without overwriting production-specific CSS",()=>{
 for(const file of ["app.js","financial-engine.js","spend-experience.js","spend-clean-ui.js","monthly-budget-ui.js","offline-storage.js","backup-vault.js","sw.js","connection-status.js"]){
  assert.equal(read(file),read("dist/"+file),file+" source and dist must match");
 }
});

test("encrypted backup controls are wired in both published HTML builds",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/id="vaultPhraseInput"[^>]*type="password"/);
  for(const id of ["exportBtn","importFile","importBtn","backupExportStatus","backupImportStatus"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/<script src="\.\/backup-vault\.js\?v=1"><\/script>[\s\S]*?<script src="\.\/app\.js/);
 }
 const app=read("app.js");
 for(const marker of ["BEPBackupVault.encrypt","BEPBackupVault.decrypt","BEPOffline.stage","BEPOffline.discardPending","/api/data"])assert.ok(app.includes(marker),"missing backup flow: "+marker);
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

test("settings profile row is the direct edit-profile action in both builds",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/<button[^>]*id="openProfileDialog"[^>]*aria-controls="profileSettingsDialog"[\s\S]*?<strong>Modifier mon profil<\/strong>/);
  assert.doesNotMatch(html,/<strong>Informations personnelles<\/strong>/);
 }
});

test("profile settings open directly into one editable form in both published HTML builds",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.equal((html.match(/id="profileSettingsDialog"/g)||[]).length,1,file+" must expose exactly one profile dialog");
  assert.equal((html.match(/id="profileForm"/g)||[]).length,1,file+" must expose exactly one profile form");
  assert.match(html,/<dialog class="settings-modal" id="profileSettingsDialog"[\s\S]*?<form id="profileForm">[\s\S]*?id="profileFirstName"[\s\S]*?id="profileLastName"[\s\S]*?id="profilePhone"/);
  assert.match(html,/id="openProfileDialog"[^>]*aria-controls="profileSettingsDialog"/);
 }
});

test("settings show the package version and home shortcut filters impulsive purchases",()=>{
 const html=read("index.html"),dist=read("dist/index.html"),app=read("app.js");
 for(const source of [html,dist])assert.match(source,/settings-app-version/);
 for(const source of [html,dist])assert.match(source,/id="homeImpulsivePurchases"/);
 assert.match(app,/psychology==="impulsive"\|\|p\.psychology==="pressure"/);
 assert.match(app,/id="clearImpulseFilter"/);
});

test("mobile connection status has space above the fixed advice dock",()=>{
 for(const file of ["connection-status.css","dist/connection-status.css"])
  assert.match(read(file),/padding-bottom:calc\(104px \+ env\(safe-area-inset-bottom\)\)/);
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
 assert.match(server,/app\.post\("\/api\/auth\/login"[\s\S]*?keepSingleSession\(u\.id,req\.sessionID\)/);
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

test("destructive settings actions require an explicit BEP confirmation dialog",()=>{
 const app=read("app.js");
 assert.ok(app.includes("window.BEP_CONFIRM_ACTION="),"shared confirmation dialog must be available");
 assert.ok(app.includes('$("deleteBtn").onclick=async()=>{'));
 assert.ok(app.includes('$("deleteAccountBtn").onclick=async()=>{'));
 assert.ok(app.includes("await window.BEP_CONFIRM_ACTION("),"both destructive actions must await confirmation");
 assert.ok(!app.includes('window.confirm("Supprimer définitivement ton compte BEP'));
 assert.ok(app.includes("window.BEPOffline.clearLocalData()"),"local clearing must clear offline baseline and identity");
 const offline=read("offline-storage.js");
 assert.ok(offline.includes("async function clearLocalData()"));
 assert.ok(offline.includes("if(pending)throw Error("),"pending offline changes must block local erasure");
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/app\.js\?v=111&bep=destructive-confirmation/);
  assert.match(html,/offline-storage\.js\?v=5&bep=guarded-local-clear/);
 }
});


test("purchase statistics navigate to an opened purchases history accordion",()=>{
 const spend=read("spend-experience.js");
 assert.match(spend,/details\.id="bepSpendPurchaseHistory"/);
 assert.match(spend,/details\.open=true/);
 assert.match(spend,/focusPurchaseHistory\(filter\)/);
 for(const id of ["bepSpendMonthTotal","bepSpendMonthCount","bepSpendMonthDecisions"])assert.ok(spend.includes('["'+id+'"'),"missing stat shortcut "+id);
 assert.match(spend,/setAttribute\("role","button"\)/);
 assert.match(spend,/keydown/);
 assert.match(spend,/purchaseHistory\.open=true/);
 const app=read("app.js");
 assert.ok(app.includes("window.BEP_SET_IMPULSIVE_PURCHASES="));
 assert.ok(app.includes("window.BEP_OPEN_PURCHASES="));
 for(const file of ["spend-experience.css","dist/spend-experience.css"]){
  const css=read(file);
  assert.match(css,/#purchases \.bep-spend-history-details>#purchaseRows\s*\{[^}]*overflow-y:auto/s);
 }
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/spend-experience\.css\?v=26&bep=purchase-accordion-shortcuts-20261114/);
 }
});


test("API rate limits are isolated by a signed persistent device cookie, not shared IP",()=>{
 const server=read("server.js");
 assert.match(server,/function readDeviceCookie\(req\)/);
 assert.match(server,/createHmac\("sha256",process\.env\.SESSION_SECRET\)/);
 assert.match(server,/timingSafeEqual/);
 assert.match(server,/bep_device=/);
 assert.match(server,/HttpOnly; Secure; SameSite=None/);
 assert.match(server,/scope\+":device:"\+deviceId/);
 assert.doesNotMatch(server,/scope\+":"\+ip/);
 assert.match(server,/req\.bepDeviceId=id/);
 const app=read("app.js");
 assert.match(app,/api\/auth\/register",\{method:"POST",credentials:"include"/);
 assert.match(app,/api\/auth\/login",\{method:"POST",credentials:"include"/);
 assert.match(app,/api\/auth\/forgot-password",\{method:"POST",credentials:"include"/);
 assert.match(app,/api\/auth\/resend-verification",\{method:"POST",credentials:"include"/);
});
