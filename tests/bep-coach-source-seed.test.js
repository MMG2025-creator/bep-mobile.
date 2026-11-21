"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {validateSources}=require("../lib/bep-coach-source-registry");
const seed=require("../src/coach/knowledge/financialCoachSources.mesquestionsdargent.fr.json");
test("institutional source seed contains 50 unique valid Banque de France references",()=>{
 assert.equal(seed.sourceCount,50);
 assert.equal(seed.sources.length,50);
 assert.equal(seed.sources.reduce((total,_item,index)=>total+(index%10===0?validateSources(seed.sources.slice(index,index+10)).length:0),0),50);
 assert.equal(new Set(seed.sources.map(item=>item.id)).size,50);
 assert.equal(new Set(seed.sources.map(item=>item.url)).size,50);
});
test("institutional source seed remains unpublished pending human validation",()=>{
 assert.equal(seed.status,"candidate");
 assert.equal(seed.publication,"manual_approval_required");
 assert.ok(seed.sources.every(item=>item.status==="pending_validation"));
});
test("production startup seed requires an explicit temporary flag and batches at ten",()=>{
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 assert.match(server,/BEP_COACH_SOURCE_REGISTRY_SEED==="true"/);
 assert.match(server,/offset\+=10/);
 assert.match(server,/financialCoachSources\.mesquestionsdargent\.fr\.json/);
});
