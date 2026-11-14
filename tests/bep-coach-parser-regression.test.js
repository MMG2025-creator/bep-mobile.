"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = server.indexOf("function routeStructuredQuestion(question,p){");
const end = server.indexOf("\n}\n", start);
assert.ok(start >= 0 && end > start, "Coach structured parser must remain present");
const parserSource = server.slice(start, end + 2);
const structuredMoney = value => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR"
}).format(Number(value) || 0);
const routeStructuredQuestion = vm.runInNewContext(
  "(" + parserSource + ")",
  { structuredMoney }
);
const context = available => ({ available, income: 0, charges: 0, expenses: [], goals: [] });

test("Coach parses French purchase amounts with ordinary spaces", () => {
  const answer = routeStructuredQuestion("Puis-je acheter un ordinateur à 1 500 € ?", context(2000));
  assert.match(answer, /1\s?500/);
  assert.match(answer, /inférieur au disponible/);
});

test("Coach parses French purchase amounts with narrow no-break spaces", () => {
  const answer = routeStructuredQuestion("Puis-je acheter un ordinateur à 1\u202f500 € ?", context(2000));
  assert.match(answer, /1\s?500/);
  assert.match(answer, /inférieur au disponible/);
});

test("Coach parses grouped amounts with decimal cents", () => {
  const answer = routeStructuredQuestion("Puis-je acheter un ordinateur à 1 500,50 euros ?", context(2000));
  assert.match(answer, /1\s?500,50/);
  assert.match(answer, /inférieur au disponible/);
});

test("Coach rejects a grouped purchase amount above the available balance", () => {
  const answer = routeStructuredQuestion("Puis-je acheter un ordinateur à 2 500 € ?", context(2000));
  assert.match(answer, /dépasse le disponible/);
});
