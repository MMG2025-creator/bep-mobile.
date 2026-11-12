"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const regression = JSON.parse(read("src/coach/knowledge/coachRegressionCases.fr.json"));
const server = read("server.js");

test("Coach regression corpus is valid, French, unique and sufficiently populated", () => {
  assert.equal(regression.locale, "fr-FR");
  assert.ok(regression.cases.length >= 15);
  const ids = regression.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, "case IDs must be unique");
  for (const item of regression.cases) {
    assert.ok(item.id && item.input, "every case needs an id and input");
    assert.ok(Array.isArray(item.expectedIntents) || Array.isArray(item.must) || Array.isArray(item.mustAsk),
      `case ${item.id} needs at least one behavioral expectation`);
  }
});

test("critical fraud case requires immediate protective actions", () => {
  const item = regression.cases.find(x => x.id === "fraud-001");
  assert.ok(item);
  assert.equal(item.severity, "critical");
  for (const action of ["do_not_share_code", "stop_transfer", "contact_bank_official_channel", "preserve_evidence"]) {
    assert.ok(item.must.includes(action), `missing fraud safeguard: ${action}`);
  }
});

test("housing and debt distress case does not default to new credit", () => {
  const item = regression.cases.find(x => x.id === "distress-001");
  assert.ok(item);
  assert.ok(item.mustNot.includes("recommend_new_credit_as_default"));
  for (const action of ["prioritize_food_housing_energy", "point_conseil_budget", "banque_de_france_information"]) {
    assert.ok(item.must.includes(action));
  }
});

test("period integrity and current-rate cases prohibit unsupported calculations", () => {
  const period = regression.cases.find(x => x.id === "missing-period-001");
  const rate = regression.cases.find(x => x.id === "savings-current-001");
  assert.ok(period.mustNot.includes("calculate_final_surplus_without_period_alignment"));
  assert.ok(rate.mustNot.includes("reuse_undated_rate"));
  assert.ok(rate.must.includes("require_current_dated_rate_data"));
});

test("advice endpoint remains deterministic and does not call an external provider", () => {
  const start = server.indexOf('app.post("/api/ai/advice"');
  const end = server.indexOf('app.post("/api/ai/chat"', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(server.slice(start, end), /invokeAi\s*\(/);
});

test("chat routes known financial intents to structured answers before provider invocation", () => {
  const start = server.indexOf('app.post("/api/ai/chat"');
  const end = server.indexOf('app.get("/api/coach/knowledge"', start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(route.indexOf("routeStructuredQuestion") < route.indexOf("userAi("));
  assert.ok(route.includes('mode:"structured"'));
});

test("provider calls have a timeout and reject redirects and custom endpoints", () => {
  assert.match(server, /AbortSignal\.timeout\(45000\)/);
  assert.match(server, /redirect:"error"/);
  assert.match(server, /provider==="custom"\)throw Error/);
});

test("provider failure releases reserved quota and returns a structured fallback", () => {
  const start = server.indexOf('app.post("/api/ai/chat"');
  const end = server.indexOf('app.get("/api/coach/knowledge"', start);
  const route = server.slice(start, end);
  assert.match(route, /releaseBepAiQuota\(req\.session\.user\.id,quota\.month\)/);
  assert.match(route, /mode:"structured-fallback"/);
  assert.match(route, /Aucun appel payant de remplacement/);
});

test("quota reservation is transactional and enforces user and global caps", () => {
  assert.match(server, /BEP_AI_FREE_MONTHLY_LIMIT/);
  assert.match(server, /BEP_AI_GLOBAL_MONTHLY_LIMIT/);
  assert.match(server, /await client\.query\("BEGIN"\)/);
  assert.match(server, /await client\.query\("COMMIT"\)/);
  assert.match(server, /await client\.query\("ROLLBACK"\)/);
});

test("external provider stays disabled unless the explicit no-billing guard is enabled", () => {
  assert.match(server, /BEP_AI_ZERO_BILLING_CONFIRMED!=="true"/);
  assert.match(server, /Aucun service payant n'a été sollicité/);
});

test("purchase review preserves an unknown available balance as null", () => {
  const start = server.indexOf('app.post("/api/ai/chat"');
  const end = server.indexOf('app.get("/api/coach/knowledge"', start);
  const route = server.slice(start, end);
  assert.match(route, /p\.available===null\|\|p\.available===undefined\|\|p\.available===""\?null/);
});

test("knowledge import is bounded and personal knowledge retrieval is user-scoped", () => {
  assert.match(server, /items\.length>100/);
  assert.match(server, /detail\.slice\(0,1500\)/);
  const intelligence = read("lib/bep-financial-intelligence.js");
  assert.match(intelligence, /WHERE user_id=\$1 AND review_status='accepted'/);
});
