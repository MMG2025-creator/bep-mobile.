"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validMonth, validateItems, totals, monthKeyAt, monthKeyFromDate } = require("../monthly-budget-routes");

test("monthKeyFromDate normalizes PostgreSQL DATE values without locale-dependent strings", () => {
  assert.equal(monthKeyFromDate(new Date(2026, 10, 1)), "2026-11");
  assert.equal(monthKeyFromDate("2026-11-01"), "2026-11");
  assert.equal(monthKeyFromDate("invalid"), null);
  assert.equal(monthKeyFromDate(new Date("invalid")), null);
});

test("validMonth accepts only supported YYYY-MM civil months", () => {
  assert.equal(validMonth("2026-11"), true);
  assert.equal(validMonth("2000-01"), true);
  assert.equal(validMonth("2099-12"), true);
  for (const value of ["2026-00", "2026-13", "1999-12", "2100-01", "2026-1", "2026-02-01", null, 202611]) {
    assert.equal(validMonth(value), false, String(value));
  }
});

test("validateItems normalizes valid rows and rejects malformed or unsafe values", () => {
  const valid = validateItems([{ itemType: "charge", label: "Loyer", plannedAmount: 950, category: "Logement" }]);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].amount, "950.00");
  assert.equal(valid[0].itemType, "charge");
  for (const items of [
    null, {}, Array(201).fill({ itemType: "income", label: "Salaire", plannedAmount: 1 }),
    [{ itemType: "unknown", label: "x", plannedAmount: 1 }],
    [{ itemType: "income", label: " ", plannedAmount: 1 }],
    [{ itemType: "income", label: "Salaire", plannedAmount: -1 }],
    [{ itemType: "income", label: "Salaire", plannedAmount: "NaN" }],
    [{ itemType: "income", label: "Salaire", plannedAmount: null }],
    [{ itemType: "income", label: "Salaire", plannedAmount: "" }],
    [{ itemType: "income", label: "Salaire", plannedAmount: true }],
    [{ itemType: true, label: "Salaire", plannedAmount: 100 }],
    [{ itemType: "income", label: "Salaire", plannedAmount: 100, category: {} }],
    [{ itemType: "income", label: "Salaire", plannedAmount: 999999999999.99 }, { itemType: "income", label: "Prime", plannedAmount: 1 }],
    [{ itemType: "income", label: "Salaire", plannedAmount: 1, metadata: [] }]
  ]) assert.equal(validateItems(items), null);
});

test("totals remain separated by income, charges and savings", () => {
  const rows = [
    { itemType: "income", amount: "2500.00" },
    { itemType: "charge", amount: "900.00" },
    { itemType: "charge", amount: "150.50" },
    { itemType: "savings", amount: "200.00" }
  ];
  assert.deepEqual(totals(rows), { income: "2500.00", charge: "1050.50", savings: "200.00" });
});

test("monthKeyAt uses the user's local timezone at month boundaries", () => {
  assert.equal(monthKeyAt("2026-10-31T23:30:00.000Z", "Europe/Paris"), "2026-11");
  assert.equal(monthKeyAt("2026-11-01T00:30:00.000Z", "America/Los_Angeles"), "2026-10");
  assert.equal(monthKeyAt("not-a-date", "Europe/Paris"), null);
  assert.throws(() => monthKeyAt("2026-11-01T00:00:00.000Z", "Not/AZone"), RangeError);
});


test("savings ledger validation rolls back its PostgreSQL transaction on early rejection", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(server, /if\(!Array\.isArray\(suppliedOps\)\|\|suppliedOps\.length>5000\)\{await client\.query\("ROLLBACK"\);return res\.status\(400\)/);
  assert.match(server, /if\(incomingOps\.length>5000\)\{await client\.query\("ROLLBACK"\);return res\.status\(400\)/);
});
