"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {tokens,scoreDocument,normalizeContext,formatKnowledgePrompt}=require("../lib/bep-financial-intelligence");
test("normalizes multilingual query tokens",()=>assert.deepEqual(tokens("Épargne mensuelle et dépenses"),["epargne","mensuelle","depenses"]));
test("ranks savings ledger knowledge when actual movements exist",()=>{const d={slug:"planned-vs-real-savings",category:"savings",title:"Epargne",content:"versements réels",keywords:[]};assert.ok(scoreDocument(d,"comment suivre mon épargne",{savingsOperations:[{amount:20} ]})>0)});
test("does not treat missing values as positive facts",()=>{const c=normalizeContext({income:0,savingsOperations:[{id:"x",type:"deposit",amount:25,date:"2026-01-01",privateLabel:"ignored"}]});assert.equal(c.income,0);assert.equal(c.savingsOperations[0].privateLabel,undefined)});
test("prompt exposes source provenance",()=>{const s=formatKnowledgePrompt([{title:"Test",category:"budget",evidence_level:"institutional",source_name:"Source",source_url:"https://example.org",content:"Contenu"}]);assert.match(s,/https:\/\/example.org/);assert.match(s,/Source/)});
