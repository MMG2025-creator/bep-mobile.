"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
const start=server.indexOf("function routeStructuredQuestion(question,p){");
const end=server.indexOf("\n}\n",start);
assert.ok(start>=0&&end>start,"Coach structured parser must remain present");
const parserSource=server.slice(start,end+2);
const structuredMoney=value=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value)||0);
const {classifyCoachIntent}=require("../lib/bep-financial-intelligence");
const answerCoach=vm.runInNewContext("("+parserSource+")",{structuredMoney,classifyCoachIntent});
const synthetic={
  available:{income:3200,charges:2100,available:1100,incomes:[{amount:3200}],expenses:[],goals:[]},
  missingIncome:{income:0,charges:0,available:0,incomes:[],expenses:[],goals:[]},
  spending:{income:2800,charges:1800,available:1000,incomes:[{amount:2800}],expenses:[{amount:42,category:"Alimentation"},{amount:58,category:"Transport"}],goals:[]},
  debtUnknown:{income:3000,charges:1900,available:1100,expenses:[],goals:[],debts:[],pageContext:{page:"debt"}},
  savings:{income:2800,charges:1900,available:900,expenses:[],goals:[{name:"Fonds d'urgence"},{name:"Voyage"}]},
  purchaseWithin:{income:3000,charges:1900,available:1100,expenses:[],goals:[]},
  purchaseOver:{income:3000,charges:1900,available:250,expenses:[],goals:[]}
};
test("synthetic scenario: Coach reports available balance only when income data exists",()=>{
 const answer=answerCoach("Combien me reste-t-il de disponible ?",synthetic.available);
 assert.match(answer,/1\s?100/);
 assert.match(answer,/vérifie que les dernières dépenses/i);
});
test("synthetic scenario: Coach refuses to invent an end-of-month balance without income",()=>{
 const answer=answerCoach("Combien me reste-t-il à la fin du mois ?",synthetic.missingIncome);
 assert.match(answer,/aucun revenu mensuel n'est enregistré/i);
 assert.doesNotMatch(answer,/0,00/);
});
test("synthetic scenario: Coach totals recorded expenses, not planned expenses",()=>{
 const answer=answerCoach("Quel est le total de mes dépenses ?",synthetic.spending);
 assert.match(answer,/100,00/);
 assert.match(answer,/2 opération/);
});
test("synthetic scenario: Coach does not infer that no debt exists from an empty data set",()=>{
 const answer=answerCoach("Présente cette page",synthetic.debtUnknown);
 assert.match(answer,/Aucune donnée de dette exploitable/i);
 assert.match(answer,/ne vais pas supposer qu'une dette est absente/i);
});
test("synthetic scenario: Coach lists only saved goals",()=>{
 const answer=answerCoach("Quels sont mes objectifs d'épargne ?",synthetic.savings);
 assert.match(answer,/2 objectif/);
 assert.match(answer,/Fonds d'urgence, Voyage/);
});
test("synthetic scenario: purchase below available balance is qualified by a margin warning",()=>{
 const answer=answerCoach("Puis-je acheter un ordinateur à 500 € ?",synthetic.purchaseWithin);
 assert.match(answer,/inférieur au disponible/);
 assert.match(answer,/Garde toutefois une marge/);
});
test("synthetic scenario: purchase above available balance is explicitly rejected",()=>{
 const answer=answerCoach("Puis-je acheter un ordinateur à 500 € ?",synthetic.purchaseOver);
 assert.match(answer,/dépasse le disponible/);
});
test("all scenario fixtures are synthetic and contain no identifying or account data",()=>{
 const serialized=JSON.stringify(synthetic);
 assert.doesNotMatch(serialized,/email|user_id|account_id|iban|\b\d{10,}\b/i);
});
