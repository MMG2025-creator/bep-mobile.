"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"admin.html"),"utf8");
const dist=fs.readFileSync(path.join(root,"dist/admin.html"),"utf8");
const server=fs.readFileSync(path.join(root,"server.js"),"utf8");

test("admin source and deployed dist are synchronized and every inline script parses",()=>{
 assert.equal(dist,html);
 const scripts=[...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];
 assert.ok(scripts.length>=3);
 scripts.forEach((match,index)=>assert.doesNotThrow(()=>new vm.Script(match[1]),"inline script "+index));
});

test("source registry UI exposes registration, listing and guarded freshness checks",()=>{
 for(const id of ["bepSourceRegistryForm","bepRegistrySourceId","bepRegistryTitle","bepRegistryCategory","bepRegistryUrl","bepRegistryRegister","bepRegistryRefresh","bepRegistryCheckSelected","bepRegistryStatus","bepRegistryList"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/request\("\/api\/admin\/bep-coach\/source-registry"/);
 assert.match(html,/request\("\/api\/admin\/bep-coach\/source-registry\/refresh"/);
 assert.match(html,/ids\.length>10/);
 assert.match(html,/Aucun contenu ne sera publié/);
 assert.match(html,/automaticPublication/);
});

test("batch ingestion UI validates a maximum of ten HTTPS URLs and requires confirmation",()=>{
 for(const id of ["bepBatchUrls","bepBatchCategory","bepBatchIngestButton","bepBatchIngestStatus"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/urls\.length>10/);
 assert.match(html,/\^https:/);
 assert.match(html,/request\("\/api\/admin\/bep-coach\/ingest-batch"/);
 assert.match(html,/Les contenus seront proposés à validation et ne seront pas publiés/);
});

test("orphan recovery UI requires explicit confirmation and reports the replacement job",()=>{
 for(const id of ["bepRecoveryJobId","bepRecoveryConfirm","bepRecoveryButton","bepRecoveryStatus"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/confirmOrphaned:true/);
 assert.match(html,/DOCUMENTARY_RECOVERY_CONFIRMATION_REQUIRED/);
 assert.match(html,/replacementJobId/);
 assert.match(html,/workflowDispatched/);
});

test("benchmark reference cases are loaded from the read-only API and scope is disclosed",()=>{
 for(const id of ["bepBenchmarkCasesRefresh","bepBenchmarkCasesStatus","bepBenchmarkCasesList"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/request\("\/api\/admin\/bep-agent\/library-benchmark\/cases"/);
 assert.match(html,/answerQualityMeasured/);
 assert.match(html,/metricScope/);
});

test("all four backend routes are protected by the independent admin middleware",()=>{
 const routeBlocks=[
  'app.post("/api/admin/bep-coach/source-registry",auth,requireBepAgentAdmin',
  'app.get("/api/admin/bep-coach/source-registry",auth,requireBepAgentAdmin',
  'app.post("/api/admin/bep-coach/source-registry/refresh",auth,requireBepAgentAdmin',
  'app.post("/api/admin/bep-coach/ingest-batch",auth,requireBepAgentAdmin',
  'app.post("/api/admin/bep-agent/documentary-recover",auth,requireBepAgentAdmin',
  'app.get("/api/admin/bep-agent/library-benchmark/cases",auth,requireBepAgentAdmin'
 ];
 for(const route of routeBlocks)assert.ok(server.includes(route),"protected route exists: "+route);
 const start=server.indexOf('app.post("/api/admin/bep-agent/documentary-recover"');
 const end=server.indexOf('app.get("/api/admin/bep-agent/library-benchmark/cases"',start);
 const recovery=server.slice(start,end);
 for(const guard of ["confirmOrphaned!==true","DOCUMENTARY_RECOVERY_JOB_NOT_STALE","DOCUMENTARY_RECOVERY_JOB_HAS_RUN_HISTORY","automaticPublication:false"])assert.ok(recovery.includes(guard),"recovery guard: "+guard);
});

test("new controls are contained in the intelligence workspace",()=>{
 const start=html.indexOf('id="groqDocumentaryPanel"');
 const end=html.indexOf('id="geminiDiagnosticPanel"',start);
 const panel=html.slice(start,end);
 for(const id of ["bepSourceRegistryPanel","bepBatchIngestionPanel","bepRecoveryPanel","bepBenchmarkCasesPanel"])assert.ok(panel.includes('id="'+id+'"'));
});
