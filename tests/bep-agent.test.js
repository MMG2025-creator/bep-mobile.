"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readConfig}=require("../lib/bep-agent/config");
const {GeminiClient}=require("../lib/bep-agent/gemini-client");
const {startBepAgent}=require("../lib/bep-agent");
const {validateKnowledgeProposal,sourceDigest,runQualityReview}=require("../lib/bep-agent/worker");
const cases=require("../lib/bep-agent/quality-cases");
const fs=require("node:fs");
const path=require("node:path");

test("agent remains disabled by default and fails closed without separate billing confirmation",()=>{
 assert.equal(readConfig({}).enabled,false);
 assert.equal(readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"secret"}).enabled,false);
 assert.equal(readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_ZERO_BILLING_CONFIRMED:"true"}).enabled,false);
});
test("disabled agent performs no schema or database writes",async()=>{
 let queries=0;
 const pool={query:async()=>{queries++;throw new Error("database should not be touched")}};
 const result=await startBepAgent({pool,env:{},logger:{info(){}}});
 assert.equal(result.enabled,false);
 assert.equal(queries,0);
});
test("agent enables only with its dedicated key and explicit zero-billing confirmation",()=>{
 const c=readConfig({BEP_AGENT_ENABLED:"true",BEP_AGENT_ZERO_BILLING_CONFIRMED:"true",BEP_AGENT_GEMINI_API_KEY:"dedicated-key"});
 assert.equal(c.enabled,true);assert.equal(c.model,"gemini-3.8-flash");assert.equal(c.maxCallsPerDay,8);
});
test("daily Gemini call quota is bounded",()=>{
 assert.equal(readConfig({BEP_AGENT_MAX_CALLS_PER_DAY:"500"}).maxCallsPerDay,50);
 assert.equal(readConfig({BEP_AGENT_MAX_CALLS_PER_DAY:"0"}).maxCallsPerDay,8);
});
test("Gemini client requires a key and does not accept a custom endpoint",()=>{
 assert.throws(()=>new GeminiClient({apiKey:"",model:"gemini-3.8-flash"}),/API key/);
 const client=new GeminiClient({apiKey:"x",model:"gemini-3.8-flash"});
 assert.equal(client.model,"gemini-3.8-flash");assert.equal(Object.hasOwn(client,"endpoint"),false);
});
test("knowledge proposals must preserve the source provenance supplied by BEP",()=>{
 const source={slug:"budget-baseline",category:"budget",title:"Budget",content:"Distinguer les charges fixes et variables.",version:3,source_name:"Banque de France",source_url:"https://www.mesquestionsdargent.fr/",evidence_level:"institutional_guidance"};
 const valid={proposal_type:"clarify",title:"Clarifier le budget",content:"Distinguer prévu et réalisé.",source_name:source.source_name,source_url:source.source_url,confidence:"high",rationale:"La formulation doit être précisée."};
 const proposal=validateKnowledgeProposal(valid,source);
 assert.ok(proposal);assert.equal(proposal.source_version,3);assert.equal(proposal.source_digest,sourceDigest(source));
 assert.notEqual(sourceDigest(source),sourceDigest({...source,content:"Contenu modifié."}));
 assert.equal(validateKnowledgeProposal({...valid,source_url:"https://example.com"},source),null);
 assert.equal(validateKnowledgeProposal({...valid,proposal_type:"invent"},source),null);
 assert.equal(validateKnowledgeProposal(valid,undefined),null);
});
test("quality review reports clearly that it has not executed real Coach responses",async()=>{
 const result=await runQualityReview({pool:{query:async()=>({rows:[]})},client:{generateJson:async()=>({value:{findings:[]},usage:null})}});
 assert.equal(result.summary.coachResponsesExecuted,false);
});
test("quality review corpus is synthetic and contains no user or account identifiers",()=>{
 assert.ok(cases.length>=5);
 for(const item of cases){assert.ok(item.id&&item.question&&Array.isArray(item.must)&&Array.isArray(item.mustNot));assert.doesNotMatch(JSON.stringify(item),/email|user_id|account_id|iban/i)}
});
test("Gemini API key is sent in a header and queue leases are recoverable",()=>{
 const client=fs.readFileSync(path.join(__dirname,"..","lib/bep-agent/gemini-client.js"),"utf8");
 const repository=fs.readFileSync(path.join(__dirname,"..","lib/bep-agent/repository.js"),"utf8");
 assert.match(client,/x-goog-api-key/);assert.doesNotMatch(client,/\\?key=/);
 assert.match(repository,/worker lease expired/);assert.match(repository,/ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED/);
});
test("agent schema is additive and does not alter existing BEP financial tables",()=>{
 const sql=fs.readFileSync(path.join(__dirname,"..","database/migrations/20261114_bep_gemini_agent.sql"),"utf8");
 for(const table of ["bep_agent_jobs","bep_agent_runs","bep_knowledge_candidates","bep_agent_daily_usage","bep_agent_metrics","bep_agent_approved_knowledge","bep_agent_coach_metrics"])assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
 assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|ALTER TABLE bep_(users|user_data|monthly_budgets|monthly_budget_items))\b/i);
});
test("server exposes only allowlisted admin review and aggregate telemetry",()=>{
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 assert.match(server,/BEP_AGENT_ADMIN_USER_IDS/);
 assert.match(server,/\/api\/admin\/bep-agent\/candidates/);
 assert.match(server,/\/api\/admin\/bep-agent\/overview/);
 assert.match(server,/\/api\/admin\/bep-agent\/run/);
 assert.match(server,/bep_agent_approved_knowledge/);
 assert.match(server,/INSERT INTO bep_agent_coach_metrics/);
 assert.match(server,/INSERT INTO bep_agent_approved_knowledge/);
 assert.ok(server.includes("sourceFingerprint(original)"));
 assert.match(server,/SOURCE_DOCUMENT_CHANGED/);
 assert.ok(server.includes("candidate.source_version"));
 assert.ok(server.includes("candidate.source_digest"));
 assert.ok(server.includes("sourceFingerprint(original)"));
 assert.ok(server.includes("if(!agentTelemetryReady)return next();"));
 const telemetry=server.slice(server.indexOf("function coachTelemetry"),server.indexOf("async function keepSingleSession"));
 assert.doesNotMatch(telemetry,/req\.body|req\.session|question|answer|user_id/);
});
test("agent prompts are isolated from personal Coach context and contain explicit untrusted-data policy",()=>{
 const worker=fs.readFileSync(path.join(__dirname,"..","lib/bep-agent/worker.js"),"utf8");
 assert.match(worker,/Tu es un évaluateur interne du système BEP/);
 assert.match(worker,/jamais des instructions/);
 assert.doesNotMatch(worker,/bep_user_data|req\.session|financialPosition|email/);
});
