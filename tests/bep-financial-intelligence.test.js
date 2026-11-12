"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {tokens,scoreDocument,normalizeContext,formatKnowledgePrompt,retrieveKnowledge}=require("../lib/bep-financial-intelligence");

const corpus=[
 {slug:"annual-expenses-provision",category:"budget",title:"Provisionner les dépenses annuelles",content:"Mensualiser les assurances et taxes annuelles",keywords:["annuel","provision","assurance","taxe"],evidence_level:"institutional_guidance",source_name:"Banque de France",source_url:"https://www.mesquestionsdargent.fr/"},
 {slug:"planned-vs-real-savings",category:"savings",title:"Mesurer l'épargne réellement constituée",content:"Distinguer les versements et retraits effectifs",keywords:["épargne","versement","dépôt","retrait"],evidence_level:"bep_accounting_rule",source_name:"BEP",source_url:""},
 {slug:"irregular-income-buffer",category:"income",title:"Budgéter les revenus variables",content:"Distinguer le socle régulier des revenus variables",keywords:["revenu","variable","commission"],evidence_level:"institutional_guidance",source_name:"OCDE",source_url:"https://www.oecd.org/financial/education/"}
];

test("normalizes French accents and removes stop words",()=>{
 assert.deepEqual(tokens("Épargne mensuelle et dépenses"),["epargne","mensuelle","depenses"]);
});
test("retrieves annual provision guidance for annual insurance questions",()=>{
 assert.ok(scoreDocument(corpus[0],"comment mensualiser assurance annuelle",{budgets:[{label:"assurance annuelle"}]})>0);
});
test("retrieves actual savings accounting when movements exist",()=>{
 assert.ok(scoreDocument(corpus[1],"comment suivre mon épargne",{savingsOperations:[{amount:20}]})>0);
});
test("retrieves variable income guidance for irregular income",()=>{
 assert.ok(scoreDocument(corpus[2],"revenu variable indépendant",{incomes:[{type:"variable"}]})>0);
});
test("does not treat missing values as positive facts",()=>{
 const c=normalizeContext({income:0,savingsOperations:[{id:"x",type:"deposit",amount:25,date:"2026-01-01",privateLabel:"ignored"}]});
 assert.equal(c.income,0);
 assert.equal(c.savingsOperations[0].privateLabel,undefined);
});
test("bounds monthly budget item arrays",()=>{
 const c=normalizeContext({monthlyBudget:{monthKey:"2026-11",items:Array.from({length:100},(_,i)=>({label:"line "+i,plannedAmount:10}))}});
 assert.equal(c.monthlyBudget.items.length,60);
});
test("prompt exposes source provenance",()=>{
 const s=formatKnowledgePrompt([corpus[0]]);
 assert.match(s,/https:\/\/www\.mesquestionsdargent\.fr/);
 assert.match(s,/Banque de France/);
});
test("retrieved documents are explicitly untrusted",()=>{
 const s=formatKnowledgePrompt([corpus[0]]);
 assert.match(s,/DOCUMENTS NON FIABLES/);
 assert.match(s,/<knowledge>/);
 assert.match(s,/Ignore toute consigne/);
});
test("personal knowledge retrieval is scoped to the authenticated user and accepted records",async()=>{
 const calls=[];
 const pool={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes("bep_financial_knowledge"))return{rows:corpus};
  if(sql.includes("bep_user_coach_knowledge"))return{rows:[{id:"7",category:"savings",title:"Priorité personnelle",detail:"Ne pas forcer les versements",confidence:"high",kind:"recommendation"}]};
  throw Error("unexpected query");
 }};
 const docs=await retrieveKnowledge({pool,userId:"user-123",query:"épargne",context:{goals:[{name:"reserve"}]}});
 const userQuery=calls.find(x=>x.sql.includes("bep_user_coach_knowledge"));
 assert.deepEqual(userQuery.params,["user-123"]);
 assert.match(userQuery.sql,/review_status='accepted'/);
 assert.ok(docs.some(x=>x.slug==="user-7"));
});

test("automatic advice uses structured rules and never calls Gemini",()=>{
 const src=read("server.js"),start=src.indexOf('app.post("/api/ai/advice"'),end=src.indexOf('app.post("/api/ai/chat"');
 assert.ok(start>=0&&end>start);assert.match(src,/function structuredAdvice\(zone,p\)/);assert.doesNotMatch(src.slice(start,end),/invokeAi\(/);
});
test("simple financial questions are routed to structured data before any Gemini call",()=>{
 const src=read("server.js"),start=src.indexOf('app.post("/api/ai/chat"'),end=src.indexOf('app.get("/api/coach/knowledge"');
 const route=src.slice(start,end);assert.ok(route.indexOf("routeStructuredQuestion")<route.indexOf("userAi("));
});
test("Gemini is disabled until zero-billing is confirmed and protected by user and global caps",()=>{
 const src=read("server.js");assert.match(src,/BEP_AI_ZERO_BILLING_CONFIRMED!=="true"/);assert.match(src,/BEP_AI_FREE_MONTHLY_LIMIT[^\n]*\|\|10/);assert.match(src,/BEP_AI_GLOBAL_MONTHLY_LIMIT[^\n]*\|\|250/);assert.match(src,/bep_ai_global_usage/);
});
