"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const workflow=fs.readFileSync(path.join(__dirname,"..","render-workflows","main.mjs"),"utf8");

test("documentary Render task exposes the worker job status and sanitized diagnostic",()=>{
 assert.match(workflow,/SELECT status,last_error FROM bep_agent_jobs WHERE id::text=\$1/);
 assert.match(workflow,/DOCUMENTARY_JOB_NOT_CLAIMED:status=/);
 assert.match(workflow,/DOCUMENTARY_JOB_NOT_COMPLETED:status=/);
 assert.match(workflow,/no_worker_diagnostic/);
});
