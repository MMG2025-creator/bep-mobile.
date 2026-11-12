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
      "savingsRewards", "savingsProjectionTotal", "customSavingsRate", "goalsList"
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

test("monthly save distinguishes a persisted snapshot from a failed module sync", () => {
  for (const file of ["monthly-budget-ui.js", "dist/monthly-budget-ui.js"]) {
    const js = read(file);
    assert.match(js, /let syncWarning = null/);
    assert.match(js, /Budget mensuel enregistré · version /);
    assert.match(js, /Synchronisation des autres modules à reprendre/);
    assert.match(js, /Actualisation de la liste des mois impossible/);
  }
});
