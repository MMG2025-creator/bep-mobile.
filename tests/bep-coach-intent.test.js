"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseExplicitAvailable, formatEuro } = require("../lib/bep-coach-intent");

test("parses an explicit hypothetical calculation with French thousands separators", () => {
 assert.deepEqual(parseExplicitAvailable("Si mes revenus sont de 3 000 € et mes charges de 2 200 €, quel est mon disponible ?"), { income: 3000, charges: 2200, available: 800 });
});
test("parses decimal amounts", () => {
 assert.deepEqual(parseExplicitAvailable("Avec revenus 999,50 € et charges 566,25 €, quel reste disponible ?"), { income: 999.5, charges: 566.25, available: 433.25 });
});
test("does not trigger without both explicit amounts and an available-balance intent", () => {
 assert.equal(parseExplicitAvailable("Analyse mes revenus de 3 000 € et mes charges de 2 200 €"), null);
 assert.equal(parseExplicitAvailable("Quel est mon disponible ?"), null);
});
test("formats euro values for a deterministic answer", () => {
 assert.equal(formatEuro(800), "800,00 €");
});
