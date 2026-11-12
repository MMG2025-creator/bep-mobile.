"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("published frontend assets are synchronized with source", () => {
  assert.equal(read("app.js"), read("dist/app.js"));
  assert.equal(read("monthly-budget-ui.js"), read("dist/monthly-budget-ui.js"));
  assert.equal(read("styles.css"), read("dist/styles.css"));
  assert.ok(read("index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("dist/index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("index.html").includes("./app.js?v=96"));
  assert.ok(read("dist/index.html").includes("./app.js?v=96"));
  assert.ok(read("index.html").includes("./styles.css?v=78"));
  assert.ok(read("dist/index.html").includes("./styles.css?v=78"));
  assert.ok(read("index.html").includes("./spend-experience.css?v=3"));
  assert.ok(read("dist/index.html").includes("./spend-experience.css?v=3"));
  assert.ok(read("index.html").includes("./spend-experience.js?v=3"));
  assert.ok(read("dist/index.html").includes("./spend-experience.js?v=3"));
  assert.ok(read("index.html").includes("./monthly-budget-ui.js?v=5"));
  assert.ok(read("dist/index.html").includes("./monthly-budget-ui.js?v=5"));
});

test("monthly history and savings DOM references exist in both HTML builds", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, file + " contains duplicate IDs");
    const required = [
      "monthlyHistoryCard", "monthlyBudgetMonth", "monthlyBudgetActualTotal", "monthlyBudgetActualVariance",
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

test("legacy module changes notify monthly history only after server persistence", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    const start = js.indexOf("function save(){");
    const end = js.indexOf("\nasync function persistMigratedIncomeState()", start);
    assert.ok(start >= 0 && end > start, file + " save function is missing");
    const save = js.slice(start, end);
    const serverWrite = save.indexOf('fetch(API+"/api/data"');
    const serverConfirm = save.indexOf("dispatchLegacyBudgetChanged()", serverWrite);
    const failure = save.indexOf(".catch(()=>notify", serverWrite);
    assert.ok(serverWrite >= 0 && serverConfirm > serverWrite && failure > serverConfirm,
      file + " must wait for successful legacy-data persistence before syncing monthly history");
  }
});

test("monthly-to-savings bridge waits for server confirmation before changing local state", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    const start = js.indexOf("window.BEP_APPLY_MONTHLY_ITEMS=async(monthKey,monthlyItems)=>{");
    const end = js.indexOf("\nasync function persistMigratedIncomeState()", start);
    assert.ok(start >= 0 && end > start, file + " monthly bridge is missing");
    const bridge = js.slice(start, end);
    const serverWrite = bridge.indexOf('await fetch(API+"/api/data"');
    const localWrite = bridge.indexOf('localStorage.setItem(DB,JSON.stringify(nextState))');
    const stateCommit = bridge.indexOf('state=nextState');
    assert.ok(serverWrite >= 0 && localWrite > serverWrite && stateCommit > localWrite,
      file + " must confirm server sync before committing local state");
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

test("purchase entry keeps the core flow reliable and avoids inline voice prompts", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /const targets=\[\$\("goalName"\)\]/);
    assert.match(js, /Décris brièvement ton achat/);
    assert.match(js, /const category=\$\("purchaseCategory"\)\.value\.trim\(\)\|\|"Autre"/);
    assert.match(js, /if\(save\(\)===false\)\{state\.expenses=beforeExpenses;return\}/);
    assert.match(js, /const rules=\[/);
    assert.doesNotMatch(js, /const m=merchant\.value\.toLowerCase\(\)/);
  }
  assert.equal(read("spend-experience.js"), read("dist/spend-experience.js"));
  assert.equal(read("spend-experience.css"), read("dist/spend-experience.css"));
  for (const file of ["spend-experience.js", "dist/spend-experience.js"]) {
    const js = read(file);
    assert.match(js, /Qu’as-tu acheté/);
    assert.match(js, /Catégorie proposée par BEP/);
    assert.match(js, /purchaseCategory"\)\.required=false/);
  }
});

test("purchase form title follows edit, cancel and new-purchase states", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /function setPurchaseFormTitle\(isEditing\)/);
    assert.match(js, /heading\.textContent=isEditing\?"Modifier ma dépense":"Ajouter une dépense"/);
    assert.match(js, /editingPurchaseId=id;setPurchaseFormTitle\(true\)/);
    assert.match(js, /function cancelPurchaseEdit\(\)\{editingPurchaseId=null;setPurchaseFormTitle\(false\)/);
    assert.match(js, /onclick=\(\)=>\{editingPurchaseId=null;setPurchaseFormTitle\(false\)/);
  }
});


test("spend navigation switches complete views and keeps purchase history inside Mes achats", () => {
  const js = read("spend-experience.js");
  assert.equal(js, read("dist/spend-experience.js"));
  assert.match(js, /function setTab\(tab\)\{const panel=\$\("purchases"\)/);
  assert.match(js, /const radar=document\.createElement\("section"\)/);
  assert.match(js, /radar\.dataset\.spendView="radar"/);
  assert.match(js, /\[advice,entry,history\]\.forEach\(node=>\{if\(node\)radar\.appendChild\(node\);\}\)/);
  assert.match(js, /radar\.insertBefore\(score,entry\?\.nextSibling\|\|null\)/);
  assert.match(js, /panel\.insertBefore\(challenge,radar\.nextSibling\)/);
  assert.match(js, /panel\.insertBefore\(balance,challenge\.nextSibling\)/);
  assert.match(js, /setTab\("radar"\)/);
  assert.match(js, /ArrowRight.*ArrowLeft.*Home.*End/);
  for (const file of ["spend-experience.css", "dist/spend-experience.css"]) {
    assert.match(read(file), /#purchases \.bep-spend-view\[hidden\]\{display:none!important\}/);
  }
});
