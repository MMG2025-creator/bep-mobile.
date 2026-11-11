"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("published frontend assets are synchronized with source", () => {
  assert.equal(read("monthly-budget-ui.js"), read("dist/monthly-budget-ui.js"));
  assert.equal(read("styles.css"), read("dist/styles.css"));
  assert.ok(read("index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("dist/index.html").includes("./runtime-config.js?v=1"));
  assert.ok(read("index.html").includes("./monthly-budget-ui.js?v=5"));
  assert.ok(read("dist/index.html").includes("./monthly-budget-ui.js?v=4"));
});

test("monthly history and savings DOM references exist in both HTML builds", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, file + " contains duplicate IDs");
    const required = [
      "monthlyHistoryCard", "monthlyBudgetMonth", "monthlyBudgetActualTotal",
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
