"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isAccountOverviewQuestion, currentMonthExpenses, buildAccountOverview } = require("../lib/bep-coach-account-overview");

test("recognizes a direct request to review personal accounts", () => {
  assert.equal(isAccountOverviewQuestion("regarde mes comptes"), true);
  assert.equal(isAccountOverviewQuestion("Peux-tu analyser ma situation financière ?"), true);
  assert.equal(isAccountOverviewQuestion("Fais le point sur mon budget"), true);
  assert.equal(isAccountOverviewQuestion("Comment provisionner une dépense annuelle ?"), false);
});

test("limits actual expense totals to the current month", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const rows = currentMonthExpenses([
    { at: "2026-11-02", amount: 30 },
    { at: "2026-10-31", amount: 90 },
    { at: "invalid", amount: 10 }
  ], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 30);
});

test("builds an account-first summary and a single actionable priority", () => {
  const answer = buildAccountOverview({
    income: 3200, charges: 2750, available: 450,
    expenses: [{ at: "2026-11-03", amount: 48 }, { at: "2026-11-10", amount: 32 }],
    goals: [{ id: 1 }, { id: 2 }], dataWarnings: []
  }, new Date("2026-11-18T12:00:00Z"));
  assert.match(answer, /3\s?200/);
  assert.match(answer, /2\s?750/);
  assert.match(answer, /450/);
  assert.match(answer, /80/);
  assert.match(answer, /Objectifs d’épargne suivis : 2/);
  assert.match(answer, /Ma priorité :/);
  assert.doesNotMatch(answer, /Banque de France|source\(s\) récupérée/);
});

test("does not invent missing financial values", () => {
  const answer = buildAccountOverview({ income: 0, charges: null, available: null }, new Date("2026-11-18T12:00:00Z"));
  assert.match(answer, /Charges prévues : information manquante/);
  assert.match(answer, /compléter les revenus et les charges/);
});
