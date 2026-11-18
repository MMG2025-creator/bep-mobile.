"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = app.indexOf("function coachQuestionIntent(question){");
const end = app.indexOf("\nfunction addCoachMessage", start);
assert.ok(start >= 0 && end > start, "Local Coach intent parser and reply must remain present");
const replySource = app.slice(start, end);

function makeCoachReply(pageContext = { page: "home", label: "Accueil", subPage: null }, financial = {}) {
  const sandbox = {
    state: { budgets: [], goals: [], expenses: [], ...financial.state },
    coachFirstName: "",
    totalIncome: () => Number(financial.income) || 0,
    charges: () => Number(financial.charges) || 0,
    available: () => Number(financial.available) || 0,
    money: value => Number(value || 0).toFixed(2) + " €",
    currentCoachPageContext: () => pageContext
  };
  return vm.runInNewContext(replySource + "\ncoachReply", sandbox);
}

test("local Coach overview is page-aware even when no income is recorded", () => {
  const reply = makeCoachReply({ page: "spending", label: "Dépenses et achats", subPage: null })(
    "Présente-moi les éléments utiles de cette page"
  );
  assert.match(reply, /Dépenses et achats/);
  assert.match(reply, /Aucun achat n'est enregistré/);
  assert.doesNotMatch(reply, /il me manque ton revenu mensuel/);
});

test("local Coach distinguishes savings steps without inventing a margin", () => {
  const reply = makeCoachReply({ page: "savings", label: "Épargne", subPage: null })(
    "Comment mettre de l'argent de côté sans déséquilibrer mon budget ?"
  );
  assert.match(reply, /enregistre tes revenus/);
  assert.match(reply, /calcule la marge/);
  assert.match(reply, /ne programme pas de versement fixe/);
});

test("local Coach explains impulsive purchases instead of repeating the missing-income fallback", () => {
  const reply = makeCoachReply({ page: "spending", label: "Dépenses", subPage: null })(
    "Pourquoi mes achats impulsifs reviennent-ils ?"
  );
  assert.match(reply, /déclencheur émotionnel/);
  assert.match(reply, /24 heures/);
  assert.doesNotMatch(reply, /il me manque ton revenu mensuel/);
});

test("local Coach handles end-of-month amount questions honestly without income data", () => {
  const reply = makeCoachReply({ page: "budget", label: "Budget", subPage: "monthly" })(
    "Peux-tu me dire combien il me reste à la fin du mois ?"
  );
  assert.match(reply, /ne peux pas calculer de façon fiable/);
  assert.match(reply, /revenu mensuel enregistré/);
});

test("local Coach asks for the two options when a comparison is requested", () => {
  const reply = makeCoachReply()("Compare ces deux solutions");
  assert.match(reply, /il me faut les deux options/);
  assert.match(reply, /coût total/);
  assert.match(reply, /risque/);
});

test("different natural-language intents do not collapse to one generic local answer", () => {
  const page = { page: "spending", label: "Dépenses", subPage: null };
  const reply = makeCoachReply(page);
  const answers = [
    reply("Comment mettre de l'argent de côté sans déséquilibrer mon budget ?"),
    reply("Pourquoi mes achats impulsifs reviennent-ils ?"),
    reply("Peux-tu me dire combien il me reste à la fin du mois ?"),
    reply("Compare ces deux solutions")
  ];
  assert.equal(new Set(answers).size, answers.length);
});

test("local Coach respects the selected Budget sub-module", () => {
  const reply = makeCoachReply({ page: "budget", label: "Budget", subPage: "charges" })(
    "Présente-moi les éléments utiles de cette page"
  );
  assert.match(reply, /sous-module Charges/);
});
