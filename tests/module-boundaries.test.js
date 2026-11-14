const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const index = read("index.html");
const loader = read("lazy-load.js");
const app = read("app.js");
const monthly = read("monthly-budget-ui.js");
const spend = read("spend-experience.js");
const spendClean = read("spend-clean-ui.js");
const receipt = read("receipt-ocr.js");
const coreCss = read("styles.css");
const authCss = read("auth-page.css");
const spendCss = read("spend-experience.css");
const monthlyCss = read("monthly-budget-ui.css");
const savingsCss = read("savings-ui.css");

test("core scripts load before the application and lazy loader", () => {
  const lazyIndex = index.indexOf("./lazy-load.js");
  const appIndex = index.indexOf("./app.js");
  const authRecoveryIndex = index.indexOf("./auth-recovery.js");
  assert.ok(lazyIndex >= 0 && appIndex > lazyIndex);
  assert.ok(authRecoveryIndex > appIndex);
});

test("feature assets are not eagerly loaded by index.html", () => {
  for (const asset of [
    "spend-experience.css",
    "spend-clean-ui.css",
    "spend-clean-ui.js",
    "spend-experience.js",
    "monthly-budget-ui.css",
    "monthly-budget-ui.js",
    "savings-ui.css",
    "receipt-ocr.js"
  ]) {
    assert.equal(index.includes(asset), false, asset + " must remain lazy-loaded");
  }
});

test("lazy loader declares ordered dependencies for each extracted feature", () => {
  const purchases = loader.slice(loader.indexOf("purchases:"), loader.indexOf("monthlyBudget:"));
  assert.ok(purchases.indexOf("spend-experience.css") < purchases.indexOf("spend-clean-ui.js"));
  assert.ok(purchases.indexOf("spend-clean-ui.js") < purchases.indexOf("spend-experience.js"));

  const monthlyBlock = loader.slice(loader.indexOf("monthlyBudget:"), loader.indexOf("savings:"));
  assert.ok(monthlyBlock.indexOf("monthly-budget-ui.css") < monthlyBlock.indexOf("monthly-budget-ui.js"));
  assert.match(loader, /savings:\s*\(\)\s*=>\s*loadStyle\(["']\.\/savings-ui\.css/);
  assert.match(loader, /data-tab="purchases"/);
  assert.match(loader, /data-budget-module="monthly"/);
  assert.match(loader, /data-tab="savings"/);
});

test("feature styles are scoped to their owning application panel", () => {
  assert.match(authCss, /\.auth-gate \.auth-card/);
  assert.match(authCss, /\.auth-gate \.google-login/);
  assert.match(spendCss, /#purchases \.bep-spend-hero/);
  assert.match(spendCss, /#purchases\s*\{--sp-ink:/);
  assert.match(monthlyCss, /#budget \.monthly-budget-metrics/);
  assert.match(monthlyCss, /#budget \.monthly-budget-row/);
  assert.match(savingsCss, /#savings\.savings-page/);
  assert.match(savingsCss, /#savings \.savings-module-nav/);
  assert.doesNotMatch(coreCss, /\.monthly-budget-metrics\s*\{/);
  assert.doesNotMatch(coreCss, /\.savings-module-nav\s*\{/);
});

test("monthly module can initialize after the authentication event has already fired", () => {
  assert.match(monthly, /window\.addEventListener\(["']bep:auth-ready["']/);
  assert.match(monthly, /if\s*\(window\.bepSignedIn\)\s*refresh\(\)/);
  for (const eventName of ["bep:legacy-budget-changed", "bep:state-rendered", "bep:offline-synced"]) {
    assert.ok(monthly.includes(eventName), "missing monthly lifecycle event: " + eventName);
  }
});

test("purchase modules initialize when loaded after DOMContentLoaded", () => {
  assert.match(spend, /if\s*\(document\.readyState\s*===\s*["']loading["']\)[\s\S]*?else\s+init\(\)/);
  assert.match(spendClean, /if\s*\(document\.readyState\s*===\s*["']loading["']\)[\s\S]*?else\s+build\(\)/);
  for (const eventName of ["bep:state-rendered", "bep:auth-ready", "bep:expense-saved"]) {
    assert.ok(spend.includes(eventName) || spendClean.includes(eventName), "missing purchase lifecycle event: " + eventName);
  }
});

test("receipt OCR is loaded before its API is accessed", () => {
  const loadIndex = app.indexOf('await window.BEPLoadModule("receiptOCR")');
  const apiIndex = app.indexOf("window.BEPReceiptOCR", loadIndex);
  assert.ok(loadIndex >= 0 && apiIndex > loadIndex);
  assert.match(receipt, /root\.BEPReceiptOCR\s*=\s*api/);
});
