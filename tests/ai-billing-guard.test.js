"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("Gemini requires an explicit zero-billing confirmation", () => {
  assert.match(source, /BEP_AI_ZERO_BILLING_CONFIRMED!=="true"/);
  assert.match(source, /BEP_AI_ZERO_BILLING_CONFIRMED==="true"/);
});

test("Gemini monthly per-user quota is capped at ten requests", () => {
  assert.match(source, /Math\.max\(1,Math\.min\(10,Number\(process\.env\.BEP_AI_FREE_MONTHLY_LIMIT\)\|\|10\)\)/);
});

test("the explicit Gemini test endpoint consumes and releases quota", () => {
  const start = source.indexOf('app.post("/api/ai/test"');
  const end = source.indexOf('app.get("/api/ai/status"', start);
  assert.ok(start >= 0 && end > start);
  const route = source.slice(start, end);
  assert.match(route, /consumeBepAiQuota/);
  assert.match(route, /releaseBepAiQuota/);
});

test("AI status cannot advertise Gemini as available without zero-billing confirmation", () => {
  const start = source.indexOf('app.get("/api/ai/status"');
  const end = source.indexOf('app.post("/api/ai/advice"', start);
  assert.ok(start >= 0 && end > start);
  assert.match(source.slice(start, end), /BEP_AI_ZERO_BILLING_CONFIRMED==="true"/);
});
