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
  for(const id of ["budget","budgetModuleIncome","budgetModuleCharges","incomeForm","overdraftForm","overdraftLimit","removeOverdraftBtn","savingsModuleGoals","savingsModuleMovements","monthlyHistoryCard","homeSavingsCapital"])assert.ok(ids.includes(id),file+" missing #"+id);
  assert.match(html,/ui-polish\.css\?v=/);
  assert.match(html,/monthly-budget-ui\.js\?v=/);
 }
});

test("homepage savings capital mirrors the savings ledger total in both builds",()=>{
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/id="homeSavingsCapital"/);
 for(const file of ["app.js","dist/app.js"])assert.match(read(file),/set\("homeSavingsCapital",money\(total\)\)/);
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

test("mobile connection status is centered below the BEP footer and stays clear of the advice dock",()=>{
 for(const file of ["connection-status.css","dist/connection-status.css"]){
  const css=read(file);
  assert.match(css,/\.bep-footer\{display:flex;flex-direction:column/);
  assert.match(css,/\.bep-connection-status\{[^}]*position:static;z-index:auto/);
  assert.match(css,/padding:12px 12px calc\(28px \+ env\(safe-area-inset-bottom\)\)/);
 }
 for(const file of ["styles.css","dist/styles.css"]){
  const css=read(file);
  assert.match(css,/\.bep-advice-robot:active\{transform:scale\(\.94\)/);
  assert.match(css,/\.bep-advice-robot:focus-visible/);
 }
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/styles\.css\?v=104&bep=uniform-home-metric-rows-20261115/);
  assert.match(html,/connection-status\.css\?v=3&bep=compact-mobile-footer-20261115/);
 }
});

test("overdraft is a permission only and does not alter the financial engine",()=>{
 const app=read("app.js"),engine=read("financial-engine.js");
 assert.match(app,/treasury:\{overdraftLimit:0\}/);
 assert.match(app,/function overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/return Number\(projectedAvailable\)>=-limit/);
 assert.match(app,/function available\(\)\{return financialPosition\(\)\.available\}/);
 assert.match(app,/const projectedAvailable=availableBeforeSavings\(\)-otherGoals-m;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.match(app,/const projectedAvailable=financialPosition\(\{expenses:nextExpenses\}\)\.available;[\s\S]{0,250}overdraftCapacityAllows\(projectedAvailable\)/);
 assert.doesNotMatch(app,/expectedCredits|overdraftUsed|overdraftValidUntil|validUntil/);
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
 const app=read("app.js"),offline=read("offline-storage.js"),server=read("server.js");
 assert.match(app,/window\.BEPOffline\.hasTrustedSnapshot\(\)/);
 assert.match(app,/window\.BEPOffline\.markKnownUser\(/);
 assert.match(app,/window\.BEPOffline\.setBaseline\(d\.payload\|\|\{\}\)/);
 assert.match(offline,/window\.BEPOffline\?\.hasKnownUser\(\)/);
 assert.match(offline,/hasKnownUser:\(\)=>!!localStorage\.getItem\(USER_KEY\)/);
 assert.match(offline,/hasTrustedSnapshot/);
 assert.match(offline,/__bepOfflineSync:true,base:pending\.base,payload:pending\.payload/);
 assert.doesNotMatch(offline,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(server,/mergeOfflinePayload\(base,p,previous\)/);
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
 assert.ok(offline.includes("if(pending!==null&&pending!==undefined)throw Error("),"pending offline changes must block local erasure");
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/app\.js\?v=118&bep=oauth-popup-history-isolation-20261115/);
  assert.match(html,/offline-storage\.js\?v=6&bep=robust-local-clear-20261114/);
 }
});


test("purchase statistics navigate to an opened purchases history accordion",()=>{
 const spend=read("spend-experience.js");
 assert.match(spend,/details\.id="bepSpendPurchaseHistory"/);
 assert.match(spend,/purchaseHistory\.open=true/);
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
  assert.match(html,/spend-experience\.css\?v=34&bep=budget-copy-typography-20261115/);
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


test("RATE_LIMITED opens a visual explanation with a retry countdown",()=>{
 const app=read("app.js");
 assert.match(app,/function showRateLimitPage\(seconds\)/);
 assert.match(app,/function handleAuthRateLimit\(response,data\)/);
 assert.match(app,/response\?\.status!==429&&data\?\.error!=="RATE_LIMITED"/);
 assert.match(app,/Retry-After/);
 for(const endpoint of ["resend-verification","verify-email","login","register"])assert.ok(app.includes('handleAuthRateLimit(r,d)'),"missing RATE_LIMITED handling for "+endpoint);
 for(const file of ["index.html","dist/index.html"]){const html=read(file);assert.match(html,/id="rateLimitPage"/);assert.match(html,/Une courte pause est nécessaire/);assert.match(html,/auth-recovery\.css\?v=6/)}
 for(const file of ["auth-recovery.css","dist/auth-recovery.css"]){const css=read(file);assert.match(css,/\.rate-limit-page/);assert.match(css,/\.rate-limit-countdown/)}
});


test("custom 404 page explains missing route without implying account or data loss",()=>{
 for(const file of ["404.html","dist/404.html"]){const html=read(file);assert.match(html,/<title>Page introuvable — BEP<\/title>/);assert.match(html,/>404</);assert.match(html,/Cette page n’existe pas ici/);assert.match(html,/Cela ne signifie pas que ton compte a été supprimé/);assert.match(html,/href=\"\/\">Retourner à l’accueil BEP/);}
});

test("clearing local data resets every collection required by the first render",()=>{
 const js=read("app.js");
 assert.match(js,/defaults=\{income:0,incomes:\[\],budgets:\[\],expenses:\[\],goals:\[\],transactions:\[\]/);
 assert.match(js,/state=\{\.\.\.defaults\};syncIncomeTotal\(\);/);
});


test("successful local-data clearing does not re-render the cleared application state",()=>{
 const app=read("app.js");
 const start=app.indexOf('$("deleteBtn").onclick=async()=>{');
 const end=app.indexOf('$("deleteAccountBtn").onclick=async()=>{',start);
 assert.ok(start>=0&&end>start,"local clear handler must exist");
 const handler=app.slice(start,end);
 assert.match(handler,/authMessage\.textContent="Les données locales de cet appareil ont été effacées/);
 assert.doesNotMatch(handler,/render\(\);notify\("Données locales effacées"\)/);
 assert.match(handler,/window\.BEPOffline\?\.clearLocalData\)await window\.BEPOffline\.clearLocalData\(\)/);
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/app\.js\?v=118&bep=oauth-popup-history-isolation-20261115/);
});

test("purchase history observer does not rewrite unchanged hidden attributes",()=>{
 const spend=read("spend-clean-ui.js");
 assert.match(spend,/if\(row\.hidden!==shouldHide\)row\.hidden=shouldHide/);
 assert.equal(spend,read("dist/spend-clean-ui.js"));
});

test("savings movements reject dates before today with a persistent explicit message",()=>{
 const app=read("app.js");
 assert.ok(app.includes('savingsOperationDate").min=savingsToday'));
 assert.ok(!app.includes('savingsOperationDate").max=savingsToday'));
 assert.ok(app.includes("date<savingsToday"));
 assert.ok(app.includes("La date de cette épargne ne peut pas être antérieure à aujourd’hui"));
 assert.ok(app.includes('savingsOperationStatus");if(status)status.textContent=message'));
});

test("receipt import opens the validation dialog immediately, announces progress and blocks duplicate processing",()=>{
 const app=read("app.js");
 for(const marker of ["let receiptProcessing=false","if(receiptProcessing)","BEP_OPEN_PURCHASE_DIALOG?.()","Ticket importé. Analyse en cours","setAttribute(\"aria-busy\",\"true\")","submit.disabled=true","receiptProcessing=false"])assert.ok(app.includes(marker),"missing receipt UX marker: "+marker);
});


test("receipt imports persist a stable OCR fingerprint and compare with earlier receipt captures independently of edited form labels",()=>{
 const app=read("app.js");
 for(const marker of [
  "function fingerprintReceiptText(value)",
  "function findExistingReceiptMatch(extracted,fingerprint)",
  "purchase.receiptFingerprint===fingerprint",
  "const capture=String(purchase.captureText||\"\")",
  "oldMerchant===merchant",
  "Math.abs(oldAmount-amount)<0.01",
  "localPurchaseDate(purchase.at)===date",
  "receiptFingerprint:receiptCaptureText?receiptFingerprint",
  "receiptIdentity:receiptCaptureText?receiptIdentity",
  "Doublon certain : ce justificatif a déjà été importé",
  "Correspondance probable avec un ancien ticket",
  "if(receiptDuplicateMatch.exact){notify(message);return}",
  "window.BEP_CONFIRM_ACTION?await window.BEP_CONFIRM_ACTION"
 ])assert.ok(app.includes(marker),"missing duplicate-receipt control: "+marker);
});

test("savings capacity uses the financial engine totals and excludes archived goals",()=>{
 const app=read("app.js"),dist=read("dist/app.js"),engine=read("financial-engine.js");
 for(const source of [app,dist]){
  assert.match(source,/const position=financialPosition\(\);[\s\S]*?const plannedSavings=position\.plannedSavings;/);
  assert.match(source,/fixedCharges=position\.plannedCharges,afterSavings=position\.plannedAvailable/);
  assert.doesNotMatch(source,/const plannedSavings=\(state\.goals\|\|\[\]\)\.reduce/);
 }
 assert.match(engine,/goals\.filter\(x=>x&&!x\.archivedAt/);
});

test("source and published homepage are one canonical HTML artifact with the production design",()=>{
 const source=read("index.html"),published=read("dist/index.html");
 assert.equal(source,published,"dist/index.html must be generated from the canonical source without design drift");
 assert.match(source,/ui-polish\.css\?v=4/);
 assert.match(source,/settings\.css\?v=4/);
 assert.match(source,/pwa\.js\?v=12/);
 assert.match(source,/home-financial-snapshot/);
});


test("monthly budget visual workspace uses synchronized client assets and published styles",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.equal(read("monthly-budget-ui.css"),read("dist/monthly-budget-ui.css"));
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  for(const id of ["monthlyBudgetMonthStrip","monthlyBudgetMonthPrev","monthlyBudgetMonthNext","monthlyBudgetCalendar","monthlyBudgetAllocationDonut","monthlyBudgetCategoryDonut"])assert.ok(html.includes('id="'+id+'"'),file+" missing #"+id);
  assert.ok(html.includes("monthly-budget-ui.css?v=4&bep=calendar-day-context-dialog-20261115"));
  assert.ok(html.includes("monthly-budget-ui.js?v=17&bep=calendar-day-context-dialog-20261115"));
 }
 for(const marker of ["function renderMonthlyVisuals()","let monthDetailsExpanded = false;","calendarCard.hidden = !monthDetailsExpanded;","monthDetailsExpanded = true;","monthDetailsExpanded = false;","data-month-key","monthlyBudgetCalendarSummary","monthlyBudgetAllocationLegend","monthlyBudgetCategoryLegend"])assert.ok(js.includes(marker),"missing monthly visual marker "+marker);
});

test("monthly calendar collapses when the active month chip is tapped again and the header includes motion pictograms",()=>{
 const js=read("monthly-budget-ui.js"),css=read("monthly-budget-ui.css"),html=read("index.html");
 assert.match(js,/selectedMonth === current\?\.monthKey && monthDetailsExpanded/);
 assert.match(js,/monthDetailsExpanded = false;[\s\S]{0,100}renderMonthlyVisuals\(\)/);
 assert.match(html,/monthly-budget-heading-art/);
 assert.match(css,/@keyframes monthlyBudgetFloat/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});


test("budget has no robot shortcut or floating advice dock and monthly header uses full-width copy",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.doesNotMatch(html,/budgetCoachLauncher|budget-coach-entry|bepAdviceDock|bepAdviceRobot|bepAdviceDialog/);
  assert.match(html,/data-tab="coach"/);
  assert.match(html,/monthly-budget-heading-art/);
 }
 for(const file of ["styles.css","dist/styles.css"]){
  const css=read(file);
  assert.doesNotMatch(css,/budget-coach-launcher|budget-coach-robot-art/);
 }
 for(const file of ["monthly-budget-ui.css","dist/monthly-budget-ui.css"]){
  const css=read(file);
  assert.match(css,/\.monthly-budget-heading-copy\{max-width:100%!important;width:100%/);
  assert.match(css,/\.monthly-budget-heading-art\{top:12px!important/);
 }
});


test("monthly expense calendar opens a read-only contextual detail dialog for days with expenses",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  for(const id of ["monthlyBudgetCalendar","monthlyBudgetDayDialog","monthlyBudgetDayTitle","monthlyBudgetDaySummary","monthlyBudgetDayExpenses"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(html.includes("monthly-budget-ui.css?v=4&bep=calendar-day-context-dialog-20261115"));
  assert.ok(html.includes("monthly-budget-ui.js?v=17&bep=calendar-day-context-dialog-20261115"));
 }
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/data-day=/);
 assert.match(js,/openCalendarDayDetails/);
 assert.ok(js.includes("actuals.expenses || []"));
 assert.ok(js.includes("showModal()"));
 assert.match(js,/data-close-monthly-day-dialog/);
 assert.ok(js.includes("event.target === dayDialog"));
 assert.ok(js.includes('dayDialog?.addEventListener("close"'));
 assert.ok(js.includes('expense.label || expense.merchant || "Dépense"'));
 assert.ok(js.includes('expense.category || "Sans catégorie"'));
 assert.match(js,/monthlyBudgetDayExpenses/);
 for(const file of ["monthly-budget-ui.css","dist/monthly-budget-ui.css"]){
  const css=read(file);
  assert.ok(css.includes(".monthly-budget-day-dialog::backdrop"));
  assert.ok(css.includes(".monthly-budget-calendar-day-button:focus-visible"));
  assert.ok(css.includes("@media(max-width:480px){.monthly-budget-day-dialog"));
 }
});


test("service worker shell cache is advanced when monthly calendar HTML and assets change",()=>{
 assert.match(read("sw.js"),/const CACHE_NAME="bep-shell-v21"/);
 assert.equal(read("sw.js"),read("dist/sw.js"));
 assert.match(read("pwa.js"),/updateViaCache:"none"/);
});


test("all six homepage financial tiles use the same aligned label, amount and action rows",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file),start=html.indexOf('<div class="home-budget-metrics home-snapshot-grid">');
  assert.ok(start>=0,file+" must expose the homepage financial grid");
  const end=html.indexOf("</div>\\n</article>",start);
  const grid=html.slice(start,end);
  assert.equal((grid.match(/home-snapshot-card/g)||[]).length,6,file+" must apply the shared card structure to all six tiles");
  assert.ok(html.includes('class="home-budget-metric home-snapshot-card home-snapshot-action" id="homeImpulsivePurchases"'),file+" expenses tile must use the shared structure");
 }
 for(const file of ["styles.css","dist/styles.css"]){
  const css=read(file);
  assert.ok(css.includes(".home-snapshot-card{\n  display:grid;"),file+" must use a shared grid layout");
  assert.ok(css.includes("grid-template-rows:2.8em 1.8em 2.8em"),file+" must align label, amount and action rows");
  assert.ok(css.includes(".home-snapshot-card>span{")&&css.includes(".home-snapshot-card>strong{")&&css.includes(".home-snapshot-card>small{"));
 }
});

test("Google OAuth runs in a separate popup and returns to BEP without adding Google to the main navigation history",()=>{
 for(const file of ["app.js","dist/app.js"]){
  const app=read(file);
  assert.ok(app.includes('window.open("about:blank"'),file+" must open a separate OAuth context");
  assert.ok(app.includes("bep-google-oauth-result:"),file+" must consume the popup result");
  assert.ok(app.includes('popup.location.replace(API+"/api/auth/google?flow_id="+encodeURIComponent(flowId))'));
  assert.ok(!app.includes('window.location.href=API+"/api/auth/google"'),"main tab must not navigate to Google");
  assert.ok(!app.includes("window.location.href=d.url"),"Google account linking must not navigate the main tab");
 }
 const server=read("server.js");
 assert.ok(server.includes("function oauthPopupRedirect("));
 assert.ok(server.includes("/oauth-popup.html?"));
 assert.ok(server.includes("rawState.slice(-32)"));
 assert.ok(!server.includes('res.redirect(FRONTEND_ORIGIN+"/?login='));
 for(const file of ["oauth-popup.html","dist/oauth-popup.html"])assert.ok(read(file).includes('oauth-popup.js?v=1'));
 assert.equal(read("oauth-popup.js"),read("dist/oauth-popup.js"));
 for(const file of ["sw.js","dist/sw.js"]){
  const sw=read(file);
  assert.ok(sw.includes('const CACHE_NAME="bep-shell-v21"'));
  assert.ok(sw.includes('url.pathname.endsWith("/oauth-popup.html")'));
 }
});


test("overdraft permission can be deleted and has no validity date",()=>{
 for(const file of ["index.html","dist/index.html"]){const html=read(file);assert.match(html,/id="removeOverdraftBtn"/);assert.doesNotMatch(html,/overdraftValidUntil|Valable jusqu/);}
 for(const file of ["app.js","dist/app.js"]){const app=read(file);assert.match(app,/removeOverdraftBtn\.onclick/);assert.match(app,/state\.treasury=\{overdraftLimit:0\}/);assert.doesNotMatch(app,/overdraftValidUntil|overdraftExpired|validUntil/);}
});
