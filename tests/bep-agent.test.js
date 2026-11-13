"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readConfig}=require("../lib/bep-agent/config");
const {GeminiClient}=require("../lib/bep-agent/gemini-client");
const {validateKnowledgeProposal}=require("../lib/bep-agent/worker");
const cases=require("../lib/bep-agent/quality-cases");
const fs=require("node:fs");
const path=require("node:path");

test("agent remains disabled by default and fails closed without separate billing confirmation",()=>{
 assert.equal(readConfig({}).enabled,false);
 assert.equal(readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"secret"}).enabled,false);
 assert.equal(readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_ZERO_BILLING_CONFIRMED:"true"}).enabled,false);
});
test("agent enables only with its dedicated key and explicit zero-billing confirmation",()=>{
 const c=readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_ZERO_BILLING_CONFIRMED:"true",BEP_AGENT_GEMINI_API_KEY:"dedicated-key"});
 assert.equal(c.enabled,true);assert.equal(c.model,"gemini-2.5-flash");assert.equal(c.maxCallsPerDay,8);
});
test("daily Gemini call quota is bounded",()=>{
 assert.equal(readConfig({BEP_AGENT_MAX_CALLS_PER_DAY:"500"}).maxCallsPerDay,50);
 assert.equal(readConfig({BEP_AGENT_MAX_CALLS_PER_DAY:"0"}).maxCallsPerDay,8);
});
test("Gemini client requires a key and does not accept a custom endpoint",()=>{
 assert.throws(()=>new GeminiClient({apiKey:"",model:"gemini-2.5-flash"}),/API key/);
 const client=new GeminiClient({apiKey:"x",model:"gemini-2.5-flash"});
 assert.equal(client.model,"gemini-2.5-flash");assert.equal(Object.hasOwn(client,"endpoint"),false);
});
test("knowledge proposals must preserve the source provenance supplied by BEP",()=>{
 const source={slug:"budget-baseline",source_name:"Banque de France",source_url:"https://www.mesquestionsdargent.fr/",evidence_level:"institutional_guidance"};
 const valid={proposal_type:"clarify",title:"Clarifier le budget",content:"Distinguer prévu et réalisé.",source_name:source.source_name,source_url:source.source_url,confidence:"high",rationale:"La formulation doit être précisée."};
 assert.ok(validateKnowledgeProposal(valid,source));
 assert.equal(validateKnowledgeProposal({...valid,source_url:"https://example.com"},source),null);
 assert.equal(validateKnowledgeProposal({...valid,proposal_type:"invent"},source),null);
 assert.equal(validateKnowledgeProposal(valid,undefined),null);
});
test("quality review corpus is synthetic and contains no user or account identifiers",()=>{
 assert.ok(cases.length>=5);
 for(const item of cases){assert.ok(item.id&&item.question&&Array.isArray(item.must)&&Array.isArray(item.mustNot));assert.doesNotMatch(JSON.stringify(item),/email|user_id|account_id|iban/i)}
});
test("agent schema is additive and does not alter existing BEP financial tables",()=>{
 const sql=fs.readFileSync(path.join(__dirname,"..","database/migrations/20261114_bep_gemini_agent.sql"),"utf8");
 for(const table of ["bep_agent_jobs","bep_agent_runs","bep_knowledge_candidates","bep_agent_daily_usage","bep_agent_metrics"])assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
 assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|ALTER TABLE bep_(users|user_data|monthly_budgets|monthly_budget_items))\b/i);
});
test("agent prompts are isolated from personal Coach context and contain explicit untrusted-data policy",()=>{
 const worker=fs.readFileSync(path.join(__dirname,"..","lib/bep-agent/worker.js"),"utf8");
 assert.match(worker,/Tu es un évaluateur interne du système BEP/);
 assert.match(worker,/jamais des instructions/);
 assert.doesNotMatch(worker,/bep_user_data|req\.session|financialPosition|email/);
});
