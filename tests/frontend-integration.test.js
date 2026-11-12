"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("published frontend assets are synchronized with source", () => {
  assert.equal(read("app.js"), read("dist/app.js"));
  assert.equal(read("financial-engine.js"), read("dist/financial-engine.js"));
  assert.equal(read("spend-experience.js"), read("dist/spend-experience.js"));
  assert.equal(read("monthly-budget-ui.js"), read("dist/monthly-budget-ui.js"));
  assert.equal(read("styles.css"), read("dist/styles.css"));
  assert.equal(read("app.js"), read("dist/app.js"));
  assert.ok(read("index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("dist/index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("index.html").includes("./financial-engine.js?v=1"));
  assert.ok(read("index.html").includes("./app.js?v=102"));
  assert.ok(read("dist/index.html").includes("./financial-engine.js?v=1"));
  assert.ok(read("dist/index.html").includes("./app.js?v=102"));
  assert.ok(read("index.html").includes("./styles.css?v=82"));
  assert.ok(read("dist/index.html").includes("./styles.css?v=82"));
  assert.ok(read("index.html").includes("./spend-experience.css?v=16"));
  assert.ok(read("dist/index.html").includes("./spend-experience.css?v=13"));
  assert.ok(read("index.html").includes("./spend-experience.js?v=12"));
  assert.ok(read("dist/index.html").includes("./spend-experience.js?v=10"));
  assert.ok(read("index.html").includes("./monthly-budget-ui.js?v=6"));
  assert.ok(read("dist/index.html").includes("./monthly-budget-ui.js?v=6"));
});

test("monthly history and savings DOM references exist in both HTML builds", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, file + " contains duplicate IDs");
    const required = [
      "homeFinancialDetail", "monthlyHistoryCard", "monthlyBudgetMonth", "monthlyBudgetActualTotal", "monthlyBudgetActualVariance",
      "monthlyBudgetItemSubmit", "monthlyBudgetItemCancel", "monthlyBudgetItems",
      "savingsCapital", "savingsGoalCards", "savingsOperationForm",
      "savingsRewards", "savingsRewardsTitle", "savingsModuleGoals", "savingsModuleMovements", "customSavingsRate", "goalsList"
    ];
    for (const id of required) assert.ok(ids.includes(id), file + " missing #" + id);
  }
});

test("monthly and savings scripts use the configured API and shared budget bridge", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.ok(js.includes("window.BEP_API_BASE"), file + " ignores runtime API target");
    assert.ok(js.includes("BEP_APPLY_MONTHLY_ITEMS"), file + " lacks monthly snapshot bridge");
    assert.ok(js.includes("bep:legacy-budget-changed"), file + " lacks legacy-to-monthly sync event");
    assert.ok(js.includes("function renderSavingsExperience()"), file + " lacks savings experience");
  }
});

test("savings objectives and movements tabs are wired in both frontend builds", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /function setSavingsModule\(name\)/);
    assert.match(js, /data-savings-module/);
    assert.match(js, /setSavingsModule\("goals"\)/);
    assert.match(js, /addEventListener\("keydown"/);
    assert.match(js, /ArrowRight.*ArrowLeft.*Home.*End/);
  }
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    assert.match(html, /id="savingsModuleGoals"/);
    assert.match(html, /id="savingsModuleMovements"/);
    assert.match(html, /data-savings-module="goals"/);
    assert.match(html, /data-savings-module="movements"/);
  }
  for (const file of ["styles.css", "dist/styles.css"]) {
    assert.match(read(file), /\.savings-module-tab/);
  }
});

test("deleted savings movements are hidden while compensating ledger entries remain internal", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /cancelledIds=new Set\(ops\.filter\(o=>o\.reversalOf\)/);
    assert.match(js, /visibleOps=ops\.filter\(o=>!o\.reversalOf&&!cancelledIds\.has\(o\.id\)\)/);
    assert.match(js, /Supprimer ce mouvement de l'historique/);
    assert.match(js, /savings-delete-button/);
    assert.match(js, /Mouvement supprimé\./);
  }
});

test("legacy module changes are persisted locally and queued for conflict-guarded sync", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    const start = js.indexOf("function save(){");
    const end = js.indexOf("\nwindow.BEP_APPLY_MONTHLY_ITEMS", start);
    assert.ok(start >= 0 && end > start, file + " save function is missing");
    const save = js.slice(start, end);
    assert.ok(save.includes('localStorage.setItem(DB,JSON.stringify(state))'));
    assert.ok(save.includes("window.BEPOffline.enqueue(state)"));
    assert.ok(save.includes("Données conservées"));
    assert.ok(js.includes('window.addEventListener("bep:offline-synced",()=>{dispatchLegacyBudgetChanged()'));
  }
});

test("monthly-to-savings bridge commits locally and queues a guarded background sync", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    const start = js.indexOf("window.BEP_APPLY_MONTHLY_ITEMS=async(monthKey,monthlyItems)=>{");
    const end = js.indexOf("async function persistMigratedIncomeState()", start);
    assert.ok(start >= 0 && end > start, file + " monthly bridge is missing");
    const bridge = js.slice(start, end);
    const localWrite = bridge.indexOf('localStorage.setItem(DB,JSON.stringify(nextState))');
    const stateCommit = bridge.indexOf('state=nextState');
    const queueWrite = bridge.indexOf('await window.BEPOffline.enqueue(nextState)');
    assert.ok(localWrite >= 0 && stateCommit > localWrite && queueWrite > stateCommit,
      file + " must commit local state before queuing offline sync");
    assert.ok(bridge.includes("const nextIncome=nextIncomes.reduce"),
      file + " must calculate savings rates from the imported monthly income");
  }
});

test("legacy module synchronization preserves manually managed monthly rows", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    assert.match(js, /const managed = new Set\(\["legacy-income", "legacy-budget", "legacy-savings-goal"\]\)/,
      file + " must only replace rows owned by legacy modules");
    assert.match(js, /const custom = items\.filter\(x => !managed\.has\(x\.metadata\?\.source\)\)/,
      file + " must preserve manually created monthly rows");
  }
});

test("first monthly snapshot requires explicit confirmation before importing legacy data", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    const start = js.indexOf('$("monthlyBudgetCreateForm").onsubmit');
    const end = js.indexOf('$("monthlyBudgetItemForm").onsubmit', start);
    assert.ok(start >= 0 && end > start, file + " month creation handler is missing");
    const create = js.slice(start, end);
    const confirm = create.indexOf("window.confirm(confirmation)");
    const post = create.indexOf('api("/api/budgets/months"');
    assert.ok(confirm >= 0 && post > confirm, file + " must confirm the one-time legacy import before creating the first snapshot");
    assert.match(create, /Cette copie sera indépendante/);
  }
});

test("monthly load preserves a failed cross-module sync warning", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    const start = js.indexOf("async function loadMonth(monthKey)");
    const end = js.indexOf("\n  async function refresh()", start);
    assert.ok(start >= 0 && end > start, file + " loadMonth function is missing");
    const load = js.slice(start, end);
    assert.match(load, /let syncWarning = null/);
    assert.match(load, /Boolean\(syncWarning\)/);
    assert.ok(load.indexOf("syncWarning") < load.lastIndexOf("status("),
      file + " must preserve sync failure feedback after loading");
  }
});

test("missing actual expenses are not displayed or compared as zero spending", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    const start = js.indexOf("function renderActuals()");
    const end = js.indexOf("\n  function renderItems()", start);
    assert.ok(start >= 0 && end > start, file + " actuals renderer is missing");
    const renderer = js.slice(start, end);
    assert.match(renderer, /const hasActuals = Number\(actuals\.count\) > 0/);
    assert.match(renderer, /hasActuals \? money\(actuals\.actualExpenseTotal\) : "Non renseigné"/);
    assert.match(renderer, /Écart non calculable : aucun achat n’est enregistré/);
    assert.ok(renderer.indexOf("if (hasActuals)") < renderer.indexOf("const variance ="),
      file + " must calculate a variance only when actual purchases exist");
  }
});

test("monthly save distinguishes a persisted snapshot from a failed module sync", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    assert.match(js, /let syncWarning = null/);
    assert.match(js, /Budget mensuel enregistré · version /);
    assert.match(js, /Synchronisation des autres modules à reprendre/);
    assert.match(js, /Actualisation de la liste des mois impossible/);
  }
});
 
test("budget advice stays above the income, charges and monthly budget navigation", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    const advice = html.indexOf('id="budgetAdvisorCard"');
    const nav = html.indexOf('class="budget-module-nav"');
    const income = html.indexOf('id="budgetModuleIncome"');
    const charges = html.indexOf('id="budgetModuleCharges"');
    const monthly = html.indexOf('id="budgetModuleMonthly"');
    assert.ok(advice >= 0 && advice < nav && nav < income && nav < charges && nav < monthly,
      file + " must show shared BEP advice before all three budget modules");
    assert.match(html, /data-budget-advice="income"/);
    assert.match(html, /data-budget-advice="charges" hidden/);
    assert.match(html, /data-budget-advice="monthly" hidden/);
  }
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /data-budget-advice/);
    assert.match(js, /zone:id==="monthly"\?"budget":id/);
  }
});


test("expenses module keeps the hero, shows only purchases and offers a minimal add-purchase form", () => {
  const js = read("spend-experience.js");
  assert.equal(js, read("dist/spend-experience.js"));
  assert.match(js, /TES DÉPENSES, EN TOUTE SIMPLICITÉ/);
  assert.match(js, /BEP · MON QUOTIDIEN/);
  assert.doesNotMatch(js, /data-spend-tab="radar"|>Mes achats<|bep-spend-nav/);
  assert.doesNotMatch(js, /data-spend-tab="challenges"|data-spend-tab="balance"/);
  assert.match(js, /bepAddPurchase/);
  assert.match(js, /\+ Ajouter un achat/);
  assert.match(js, /merchantField\.remove\(\)/);
  assert.match(js, /bep-spend-history-details/);
  assert.match(js, /mountQuickExpenseModal\(panel,entry,addButton\)/);
  for (const file of ["spend-experience.css", "dist/spend-experience.css"]) {
    const css = read(file);
    assert.match(css, /bep-spend-add-button/);
    assert.match(css, /bep-spend-history-details/);
    assert.match(css, /#purchases #purchaseNew/);
  }
});

test("purchase affordability is judged only against remaining available money and never blocks saving", () => {
  const spend = read("spend-experience.js");
  assert.equal(spend, read("dist/spend-experience.js"));
  assert.match(spend, /function currentBudgetState\(\)/);
  assert.match(spend, /budget\.exceeds/);
  assert.match(spend, /Hors budget : vigilance/);
  assert.match(spend, /Tu peux l'enregistrer, mais sois vigilant/);
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /intent:"purchase_review"/);
    assert.match(js, /Montant restant disponible avant cet achat/);
    assert.match(js, /dépasse le montant restant disponible/);
  }
  const server = read("server.js");
  assert.match(server, /zone==="purchases"/);
  assert.match(server, /purchaseReview=req\.body\?\.intent==="purchase_review"/);
  assert.match(server, /financialPosition:p\.financialPosition/);
  assert.match(server, /la seule référence financière est le montant restant disponible/);
  assert.match(server, /sans bloquer son enregistrement/i);
});


test("production API initialization and purchase adviser use a single valid server definition", () => {
  const server = read("server.js");
  assert.equal((server.match(/function auth\(req,res,next\)/g)||[]).length, 1);
  assert.equal((server.match(/app\.listen/g)||[]).length, 1);
  assert.match(server, /currency CHAR\(3\)[\s\S]*?currency ~ '\^\[A-Z\]\{3\}\$'/);
  assert.match(server, /const purchaseReview=req\.body\?\.intent==="purchase_review"[\s\S]*?const ctx=purchaseReview\?\{resteDisponible/);
  assert.match(server, /purchaseReview=req\.body\?\.intent==="purchase_review"/);
  assert.match(server, /la seule référence financière est le montant restant disponible/);
  assert.match(server, /sans bloquer son enregistrement/i);
});


test("income entry actions mount as native modal dialogs with valid ID selectors", () => {
  const js = read("spend-experience.js");
  const css = read("spend-experience.css");
  assert.match(js, /\["income"[^\]]+"#incomeEditorDetails"\]/);
  assert.match(js, /\["income-checkup"[^\]]+"#incomeCheckupDetails"\]/);
  assert.match(js, /document\.querySelector\(selector\)/);
  assert.match(js, /dialog\.showModal\(\)/);
  assert.match(css, /#budgetModuleIncome \.income-card/);
  assert.match(css, /#budgetModuleIncome \.bep-entry-dialog/);
});

test("charges module mirrors the income assistant layout with modal-only actions", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    const start = html.indexOf('id="budgetModuleCharges"');
    const end = html.indexOf('id="budgetModulePhotos"', start);
    const charges = html.slice(start, end);
    assert.match(charges, /class="charges-actions-grid"/);
    assert.match(charges, /Assistant charges/);
    assert.match(charges, /As-tu pensé à toutes tes charges \?/);
    assert.match(charges, /id="budgetCheckupDetails"/);
    assert.match(charges, /id="budgetEditorDetails"/);
    assert.match(charges, /Mes charges enregistrées/);
    assert.match(charges, /id="budgetRows"/);
    assert.doesNotMatch(charges, /Parcours ces exemples/);
  }
  for (const file of ["spend-experience.css", "dist/spend-experience.css"]) {
    const css = read(file);
    assert.match(css, /#budgetModuleCharges \.charges-actions-grid/);
    assert.match(css, /#budgetModuleCharges \.charges-card #budgetRows \.rowitem/);
  }
  const js = read("spend-experience.js");
  assert.match(js, /\["charge-checkup","Sélectionner mes charges","Sélectionner mes charges","#budgetCheckupDetails"\]/);
});

test("income assistant action buttons use the same solid green as charges", () => {
  const css = read("spend-experience.css");
  assert.match(css, /#budgetModuleIncome \.bep-entry-trigger\{background:#176b50;border-color:#176b50;color:#fff\}/);
  assert.match(css, /#budgetModuleIncome \.bep-entry-trigger:hover\{background:#12583f;border-color:#12583f;color:#fff\}/);
});

test("Budget income and charges copy is concrete and action-oriented", () => {
  const app = read("app.js");
  const html = read("index.html");
  assert.ok(app.includes("sources enregistrées : "));
  assert.ok(app.includes("charges enregistrées : "));
  assert.ok(!app.includes("poste(s) de charges"));
  assert.ok(html.includes("Vérifie que tous tes revenus sont pris en compte."));
  assert.ok(html.includes("Vérifie que toutes tes charges sont prises en compte."));
  assert.ok(html.includes("Vérifier mes sources de revenus"));
  assert.ok(html.includes("Vérifier mes charges"));
});


test("income button labels use the requested wording without extra captions", () => {
  const html = read("index.html");
  assert.ok(html.includes('<summary class="budget-checkup-summary">Faire le point sur mes revenus</summary>'));
  assert.ok(html.includes('<summary>+ Ajouter un revenu</summary>'));
  assert.ok(!html.includes("income-action-caption"));
  assert.ok(!html.includes("Vérifier mes sources de revenus"));
  assert.ok(!html.includes("+ Ajouter une source de revenu</summary>"));
});

test("income dialog trigger buttons use the requested labels", () => {
  const js = read("spend-experience.js");
  assert.ok(js.includes('["income","+ Ajouter un revenu","+ Ajouter un revenu","#incomeEditorDetails"]'));
  assert.ok(js.includes('["income-checkup","Faire le point sur mes revenus","Faire le point sur mes revenus","#incomeCheckupDetails"]'));
  assert.ok(!js.includes('["income","Ajouter une source de revenu","Ajouter une source de revenu","#incomeEditorDetails"]'));
});

test("saved income typography matches saved charges", () => {
  const css = read("spend-experience.css");
  assert.match(css, /#budgetModuleIncome \.income-saved-details>summary\{font-size:16px;line-height:1\.4\}/);
  assert.match(css, /#budgetModuleIncome #incomeRows \.rowitem\{font-size:14px;line-height:1\.45\}/);
  assert.match(css, /#budgetModuleIncome #incomeRows \.rowitem>b\{font-size:14px;line-height:1\.4;font-weight:700\}/);
});

test("saved income and charges use the same typography scale", () => {
  const css = read("spend-experience.css");
  assert.match(css, /#budgetModuleIncome \.income-saved-details>summary,[\s\S]*?#budgetModuleCharges \.income-saved-details>summary\{font-size:16px!important;line-height:1\.4;font-weight:800\}/);
  assert.match(css, /#budgetModuleIncome #incomeRows \.rowitem,[\s\S]*?#budgetModuleCharges #budgetRows \.rowitem\{font-size:14px;line-height:1\.45\}/);
});

test("income saved accordion and rows match charges by direct element IDs", () => {
  const css = read("spend-experience.css");
  assert.match(css, /#incomeSavedDetails>summary,#chargesSavedDetails>summary\{font-size:16px!important/);
  assert.match(css, /#incomeRows \.rowitem,#budgetRows \.rowitem\{font-size:14px!important/);
  assert.match(css, /#incomeRows \.rowitem>span:first-child small,#budgetRows \.rowitem>span:first-child small\{font-size:12px!important/);
});

test("BEP advice is a contextual popup and quick expense floating button is removed", () => {
 const html=read("index.html");
 assert.ok(html.includes('id="bepAdviceDialog"'));
 assert.ok(html.includes('id="bepAdviceRobot"'));
 assert.ok(html.includes('id="bepCoachMascot"'));
 assert.ok(!html.includes('id="bepQuickExpense"'));
 assert.ok(html.includes('id="aiIncome"')&&html.includes('id="aiCharges"')&&html.includes('id="aiSavings"')&&html.includes('id="aiPurchases"'));
});

test("BEP advice popup replaces repeated cards and floating quick expense", () => {
 const html=read("index.html");
 assert.ok(html.includes('id="bepAdviceDialog"'));
 assert.ok(html.includes('id="bepAdviceRobot"'));
 assert.ok(!html.includes('id="bepQuickExpense"'));
 for (const id of ["aiHome","aiIncome","aiCharges","aiMonthly","aiSavings","aiPurchases"]) assert.ok(html.includes('id="'+id+'"'));
});

test("floating advice control reuses the header robot mascot", () => {
 const html=read("index.html");
 assert.ok(html.includes('sourceFace.cloneNode(true)'));
 assert.ok(html.includes('.bep-advice-robot>svg'));
});

test("header coach shortcut is removed and popup advice uses larger typography", () => {
 const html=read("index.html"),css=read("styles.css");
 assert.ok(!html.includes('id="bepCoachMascot"'));
 assert.ok(html.includes('id="bepAdviceRobot"'));
 assert.match(css,/\.bep-advice-content \.ai-advice\{font-size:23px;line-height:1\.7;font-weight:500\}/);
});


test("homepage hero includes the animated BEP robot mascot", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    assert.match(html, /class="bep-home-mascot"/);
    assert.match(html, /class="bep-home-robot"/);
    assert.match(html, /class="bep-home-robot-eyes"/);
  }
  for (const file of ["styles.css", "dist/styles.css"]) {
    const css = read(file);
    assert.match(css, /@keyframes bepHomeFloat/);
    assert.match(css, /@keyframes bepHomeBlink/);
    assert.match(css, /prefers-reduced-motion:reduce/);
  }
});


test("purchase can be saved without a merchant label", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /const label=\$\("merchant"\)\?\.value\.trim\(\)\|\|""/);
    assert.match(js, /const purchaseLabel=label\|\|category\|\|"Achat"/);
    assert.doesNotMatch(js, /if\(!label\)return notify\("Décris brièvement ton achat/);
    assert.match(js, /label:purchaseLabel/);
  }
});
