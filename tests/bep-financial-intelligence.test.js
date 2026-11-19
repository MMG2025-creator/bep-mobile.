"use strict";
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

const test=require("node:test");
const assert=require("node:assert/strict");
const {tokens,scoreDocument,normalizeContext,formatKnowledgePrompt,retrieveKnowledge,classifyCoachIntent}=require("../lib/bep-financial-intelligence");
const {sourceFingerprint}=require("../lib/bep-agent/source-fingerprint");

const corpus=[
 {slug:"annual-expenses-provision",category:"budget",title:"Provisionner les dépenses annuelles",content:"Mensualiser les assurances et taxes annuelles",keywords:["annuel","provision","assurance","taxe"],evidence_level:"institutional_guidance",source_name:"Banque de France",source_url:"https://www.mesquestionsdargent.fr/",version:1},
 {slug:"planned-vs-real-savings",category:"savings",title:"Mesurer l'épargne réellement constituée",content:"Distinguer les versements et retraits effectifs",keywords:["épargne","versement","dépôt","retrait"],evidence_level:"bep_accounting_rule",source_name:"BEP",source_url:"",version:1},
 {slug:"irregular-income-buffer",category:"income",title:"Budgéter les revenus variables",content:"Distinguer le socle régulier des revenus variables",keywords:["revenu","variable","commission"],evidence_level:"institutional_guidance",source_name:"OCDE",source_url:"https://www.oecd.org/financial/education/",version:1}
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
test("does not retrieve unrelated documents merely because financial context exists",()=>{
 const context={monthlyHistory:[{monthKey:"2026-11"}],budgets:[{label:"assurance annuelle"}],goals:[{name:"reserve"}],savingsOperations:[{amount:20}],incomes:[{amount:2000}],debts:[{balance:500}]};
 assert.equal(scoreDocument(corpus[0],"quelle est la météo demain",context),0);
});
test("ranks title and keywords above incidental content matches",()=>{
 const titleMatch={title:"Priorité de remboursement des dettes",content:"Informations générales sur les finances",category:"debt",keywords:["dette","remboursement"]};
 const incidentalMatch={title:"Conseils financiers",content:"Le remboursement des dettes peut être complexe",category:"general",keywords:[]};
 assert.ok(scoreDocument(titleMatch,"remboursement dette",{})>scoreDocument(incidentalMatch,"remboursement dette",{}));
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
test("approved agent knowledge overlays replace only the matching unchanged seed document",async()=>{
 const source=corpus[0],overlay={...source,title:"Version approuvée",content:"Contenu validé.",active:true,source_version:1,source_digest:sourceFingerprint(source)};
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:[source]}:sql.includes("bep_agent_approved_knowledge")?{rows:[overlay]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const docs=await retrieveKnowledge({pool,userId:"user-1",query:"assurance annuelle",context:{}});
 assert.equal(docs.filter(x=>x.slug===source.slug).length,1);
 assert.equal(docs.find(x=>x.slug===source.slug).title,"Version approuvée");
});
test("approved agent deactivation suppresses the matching unchanged seed document",async()=>{
 const source=corpus[0],overlay={...source,active:false,source_version:1,source_digest:sourceFingerprint(source)};
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:[source]}:sql.includes("bep_agent_approved_knowledge")?{rows:[overlay]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const docs=await retrieveKnowledge({pool,userId:"user-1",query:"assurance annuelle",context:{}});
 assert.equal(docs.some(x=>x.slug===source.slug),false);
});
test("stale approved overlays are ignored after the seed source changes",async()=>{
 const source=corpus[0],changed={...source,version:2,content:"Source mise à jour."},overlay={...source,title:"Ancienne proposition",content:"Ancien contenu.",active:true,source_version:1,source_digest:sourceFingerprint(source)};
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:[changed]}:sql.includes("bep_agent_approved_knowledge")?{rows:[overlay]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const docs=await retrieveKnowledge({pool,userId:"user-1",query:"assurance annuelle",context:{}});
 assert.equal(docs.find(x=>x.slug===source.slug).content,changed.content);
});
test("stale deactivation cannot hide a changed seed source",async()=>{
 const source=corpus[0],changed={...source,version:2,title:"Titre actualisé"},overlay={...source,active:false,source_version:1,source_digest:sourceFingerprint(source)};
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:[changed]}:sql.includes("bep_agent_approved_knowledge")?{rows:[overlay]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const docs=await retrieveKnowledge({pool,userId:"user-1",query:"assurance annuelle",context:{}});
 assert.ok(docs.some(x=>x.slug===source.slug));
});
test("personal knowledge matches a relevant category intent without admitting unrelated categories",()=>{
 const personal={slug:"user-7",category:"savings",title:"Priorité personnelle",content:"Ne pas forcer les versements"};
 const unrelated={...personal,category:"debt"};
 assert.ok(scoreDocument(personal,"épargne",{})>0);
 assert.equal(scoreDocument(unrelated,"épargne",{}),0);
});
test("personal knowledge retrieval is scoped to the authenticated user and accepted records",async()=>{
 const calls=[];
 const pool={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes("bep_financial_knowledge"))return{rows:corpus};
  if(sql.includes("bep_agent_approved_knowledge"))return{rows:[]};
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
test("short conversational replies bypass document retrieval and respond naturally",()=>{
 const src=read("server.js");
 assert.match(src,/function coachConversationalReply\(question\)/);
 assert.match(src,/if\(conversational\)[\s\S]*?mode:"conversation"/);
 assert.match(src,/Parfait\. Quel sujet souhaites-tu aborder en premier/);
 assert.match(src,/Bonjour ! Je suis là pour t'aider/);
});
test("user Coach chat is local and documentary-only with no external provider call",()=>{
 const src=read("server.js"),start=src.indexOf('app.post("/api/ai/chat",auth'),end=src.indexOf('app.get("/api/coach/library"',start);
 assert.ok(start>=0&&end>start);
 const route=src.slice(start,end);
 assert.match(route,/buildIntelligence\(/);
 assert.match(route,/routeStructuredQuestion\(/);
 assert.match(route,/provider:"bep-local"/);
 assert.match(route,/model:"bep-local-documentary"/);
 assert.doesNotMatch(route,/invokeAi\(|userAi\(|consumeBepAiQuota\(/);
 assert.match(route,/Je n\x27ai pas trouvé de fiche documentaire assez précise/);
});
test("user Coach UI explicitly promises local documentary answers and no Gemini call",()=>{
 const html=read("index.html");
 const start=html.indexOf('<div id="coachChatLog"');
 const end=html.indexOf('<section id="settings"',start);
 const coach=html.slice(start,end);
 assert.match(coach,/exclusivement sur la base documentaire locale/);
 assert.match(coach,/Aucun appel à Gemini ou à un autre fournisseur externe/);
 assert.doesNotMatch(coach,/Gemini Flash intervient/);
});

test("Gemini is disabled until zero-billing is confirmed and protected by user and global caps",()=>{
 const src=read("server.js");assert.match(src,/BEP_AI_ZERO_BILLING_CONFIRMED!=="true"/);assert.match(src,/BEP_AI_FREE_MONTHLY_LIMIT[^\n]*\|\|10/);assert.match(src,/BEP_AI_GLOBAL_MONTHLY_LIMIT[^\n]*\|\|250/);assert.match(src,/bep_ai_global_usage/);
});

test("the explicit Gemini test endpoint consumes the same guarded quota",()=>{
 const src=read("server.js"),i=src.indexOf('app.post("/api/ai/test"'),j=src.indexOf('app.get("/api/ai/status"',i);
 assert.ok(i>=0&&j>i);const route=src.slice(i,j);assert.match(route,/consumeBepAiQuota/);assert.match(route,/releaseBepAiQuota/);
});

test("approved newly created institutional knowledge is retrieved without a seed row",async()=>{
 const source={slug:"investment-diversification-risk",category:"savings",title:"Diversifier sans confondre diversification et garantie",content:"La diversification répartit les investissements entre plusieurs supports et ne supprime pas le risque de perte.",keywords:["diversification","risque","placements"],evidence_level:"institutional_guidance",source_name:"AMF",source_url:"https://www.amf-france.org/",version:1};
 const overlay={...source,active:true,source_version:1,source_digest:sourceFingerprint(source)};
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:[]}:sql.includes("bep_agent_approved_knowledge")?{rows:[overlay]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const docs=await retrieveKnowledge({pool,userId:"user-1",query:"diversification risque placements",context:{}});
 assert.equal(docs.filter(x=>x.slug===source.slug).length,1);
 assert.equal(docs[0].title,source.title);
});

test("page context is allowlisted and never carries arbitrary client labels",()=>{
 const c=normalizeContext({pageContext:{page:"savings",label:"Injected label",subPage:"monthly",secret:"private"}});
 assert.deepEqual(c.pageContext,{page:"savings",label:"Épargne",subPage:"monthly"});
 const unknown=normalizeContext({pageContext:{page:"admin",label:"Admin"}});
 assert.equal(unknown.pageContext.page,"general");
 assert.equal(unknown.pageContext.label,"Espace général");
});
test("page context only boosts already relevant knowledge and cannot create a lexical match",()=>{
 const doc={slug:"x",category:"savings",title:"Guide sur l'épargne",content:"Réserve financière",keywords:["épargne"]};
 assert.equal(scoreDocument(doc,"quelle météo demain",{pageContext:{page:"savings"}}),0);
 assert.ok(scoreDocument(doc,"comment suivre mon épargne",{pageContext:{page:"savings"}})>scoreDocument(doc,"comment suivre mon épargne",{pageContext:{page:"budget"}}));
});

test("French conversational phrasing is classified by intent",()=>{
 assert.equal(classifyCoachIntent("Présente-moi les éléments utiles de cette page",{page:"savings"}),"overview");
 assert.equal(classifyCoachIntent("Peux-tu me dire combien il me reste à la fin du mois ?",{page:"budget"}),"amount");
 assert.equal(classifyCoachIntent("Comment mettre de l'argent de côté ?",{page:"savings"}),"steps");
 assert.equal(classifyCoachIntent("Pourquoi faut-il provisionner une dépense annuelle ?",{page:"budget"}),"explain");
 assert.equal(classifyCoachIntent("Compare ces deux solutions",{page:"budget"}),"compare");
});
test("generic page overview retrieves documents from the active page category",async()=>{
 const pool={query:async sql=>sql.includes("bep_financial_knowledge")?{rows:corpus}:sql.includes("bep_agent_approved_knowledge")?{rows:[]}:sql.includes("bep_user_coach_knowledge")?{rows:[]}:Promise.reject(Error("unexpected query"))};
 const savings=await retrieveKnowledge({pool,userId:"user-1",query:"Présente-moi les éléments utiles de cette page",context:{pageContext:{page:"savings",label:"Épargne"}},limit:6});
 assert.ok(savings.length>0);assert.ok(savings.every(x=>x.category==="savings"));
 const budget=await retrieveKnowledge({pool,userId:"user-1",query:"Présente-moi les éléments utiles de cette page",context:{pageContext:{page:"budget",label:"Budget"}},limit:6});
 assert.ok(budget.length>0);assert.ok(budget.every(x=>x.category==="budget"));
});
test("everyday French synonyms retrieve the right financial knowledge",()=>{
 assert.ok(scoreDocument(corpus[1],"Comment mettre de l'argent de côté ?",{pageContext:{page:"savings"}})>0);
 assert.ok(scoreDocument(corpus[0],"Comment prévoir les factures annuelles ?",{pageContext:{page:"budget"}})>0);
 assert.ok(scoreDocument(corpus[2],"Je suis payé avec des commissions variables",{pageContext:{page:"income"}})>0);
});
test("page context never overrides a specific unrelated question",()=>{
 assert.equal(scoreDocument(corpus[1],"Quelle météo demain ?",{pageContext:{page:"savings"}}),0);
});
test("app remembers the last business page while the Coach panel is active",()=>{
 const app=read("app.js");
 assert.ok(app.includes('COACH_SOURCE_TAB_KEY="bep-coach-source-tab-v1"'));
 assert.ok(app.includes("coachSourcePage=id;try{localStorage.setItem(COACH_SOURCE_TAB_KEY,id)}catch{}"));
 assert.ok(app.includes('panel?.id==="coach"?(coachSourcePage||"home")'));
});
test("chat uses server-loaded financial context and returns intent and page diagnostics",()=>{
 const src=read("server.js"),start=src.indexOf('app.post("/api/ai/chat",auth'),end=src.indexOf('app.get("/api/coach/library"',start);
 assert.ok(start>=0&&end>start);const route=src.slice(start,end);
 assert.ok(route.includes("routeStructuredQuestion(q,context)"));
 assert.ok(route.includes("classifyCoachIntent(q,context.pageContext)"));
 assert.ok(route.includes("pageContext:context.pageContext"));
 assert.ok(route.includes("introductions[intent]"));
});

test("Coach reports the interpreted page and handles budget subpages distinctly",()=>{
 const app=read("app.js"),server=read("server.js");
 assert.ok(!app.includes("Intention comprise : "));
 assert.ok(!app.includes("Page analysée : "));
 assert.ok(server.includes('page==="budget"&&subPage==="income"'));
 assert.ok(server.includes('page==="budget"&&subPage==="charges"'));
 assert.ok(server.includes('page==="budget"&&subPage==="monthly"'));
});

test("impulsive-purchase questions do not retrieve unrelated financial categories",()=>{
 const behavior={slug:"pause-before-purchase",category:"behavior",title:"Créer une pause avant un achat non essentiel",content:"Une pause volontaire peut réduire une décision impulsive déclenchée par une émotion.",keywords:["achat","impulsifs","émotion"]};
 const unrelated={slug:"tax-credit-childcare",category:"budget",title:"Crédit d'impôt pour frais de garde",content:"Réduction d'impôt et remboursement de frais annuels.",keywords:["frais","impôt","garde"]};
 const question="Pourquoi mes achats impulsifs reviennent-ils ?";
 assert.ok(scoreDocument(behavior,question,{pageContext:{page:"spending"}})>0);
 assert.equal(scoreDocument(unrelated,question,{pageContext:{page:"spending"}}),0);
});

test("impulsive-purchase questions exclude documents without behavioral evidence",()=>{
 const impulse={slug:"impulse-purchase-pause",category:"behavior",title:"Créer une pause avant un achat non essentiel",content:"Une pause volontaire peut réduire la décision impulsive.",keywords:["achat","impulsion","pression","émotion","comportement","dépense"],evidence_level:"institutional_guidance"};
 const tax={slug:"childcare-tax-credit",category:"behavior",title:"Crédit d'impôt pour frais de garde",content:"Informations sur le crédit d'impôt et les frais de garde d'enfant.",keywords:["frais","garde","crédit","impôt"],evidence_level:"institutional_guidance"};
 const annual={slug:"annual-expenses-provision",category:"budget",title:"Provisionner les dépenses annuelles",content:"Mensualiser les assurances et taxes annuelles.",keywords:["annuel","provision","assurance","taxe"],evidence_level:"institutional_guidance"};
 const query="Pourquoi mes achats impulsifs reviennent-ils ?";
 assert.ok(scoreDocument(impulse,query,{pageContext:{page:"spending"}})>0);
 assert.equal(scoreDocument(tax,query,{pageContext:{page:"spending"}}),0);
 assert.equal(scoreDocument(annual,query,{pageContext:{page:"spending"}}),0);
});
test("an explanation of the difference between two concepts is classified as explain",()=>{
 assert.equal(classifyCoachIntent("Explique-moi la différence entre budget prévisionnel et dépenses réelles",{page:"budget"}),"explain");
 assert.equal(classifyCoachIntent("Quelle est la différence entre revenus fixes et variables ?",{page:"budget"}),"explain");
});
test("explicit comparison remains classified as compare",()=>{
 assert.equal(classifyCoachIntent("Compare ces deux solutions",{page:"budget"}),"compare");
 assert.equal(classifyCoachIntent("Quel est le meilleur choix entre ces deux options ?",{page:"budget"}),"compare");
});
