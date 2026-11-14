"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {buildCorpus} = require("../scripts/generate-coach-simulation");
const {loadAndValidateCorpus,validateFindings,analyze,main} = require("../scripts/analyze-coach-simulation");

test("corpus is synthetic, complete and validated before analysis", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bep-sim-"));
  const file=path.join(dir,"corpus.json");
  fs.writeFileSync(file,JSON.stringify(buildCorpus()));
  const corpus=loadAndValidateCorpus(file);
  assert.equal(corpus.tables.conversations.records.length,120);
  fs.rmSync(dir,{recursive:true,force:true});
});
test("rejects any record not explicitly marked synthetic", () => {
  const corpus=buildCorpus();
  corpus.tables.profiles.records[0].synthetic=false;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"bep-sim-"));
  const file=path.join(dir,"corpus.json");
  fs.writeFileSync(file,JSON.stringify(corpus));
  assert.throws(()=>loadAndValidateCorpus(file),/Invalid synthetic profile/);
  fs.rmSync(dir,{recursive:true,force:true});
});
test("filters malformed findings and unknown conversation identifiers", () => {
  const corpus=buildCorpus();
  const id=corpus.tables.conversations.records[0].id;
  const result=validateFindings({findings:[
    {conversation_id:id,category:"financial_safety",severity:"high",explanation:"Risque"},
    {conversation_id:"unknown",category:"financial_safety",severity:"high",explanation:"No"},
    {conversation_id:id,category:"invented",severity:"high",explanation:"No"}
  ]},corpus);
  assert.equal(result.length,1);
  assert.equal(result[0].synthetic_evidence_only,true);
});
test("analysis uses the injected client and never requires database configuration", async () => {
  const corpus=buildCorpus();
  let called=0;
  const client={generateJson:async args=>{called++;assert.ok(args.prompt.includes("synthetic"));return {value:{findings:[]},usage:{totalTokenCount:10}}}};
  const report=await analyze({corpus,client});
  assert.equal(called,1);
  assert.equal(report.databaseAccessed,false);
  assert.equal(report.coachEndpointCalled,false);
  assert.equal(report.inputConversationCount,120);
});
test("Gemini call is gated by explicit opt-in before reading corpus or secrets", async () => {
  await assert.rejects(()=>main({}),/disabled/);
  await assert.rejects(()=>main({BEP_SIMULATION_GEMINI_ENABLED:"true"}),/API_KEY/);
});
