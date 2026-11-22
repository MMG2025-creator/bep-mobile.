"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("documentary pipeline stays behind independent admin routes and a dedicated worker",()=>{
 const server=read("server.js"),entry=read("agent-documentary-worker.js"),worker=read("lib/bep-agent/documentary-worker.js");
 assert.match(server,/app\.post\("\/api\/admin\/bep-agent\/source-search",auth,requireBepAgentAdmin/);
 assert.match(server,/app\.post\("\/api\/admin\/bep-agent\/documentary-analyze",auth,requireBepAgentAdmin/);
 assert.match(server,/BEP_AGENT_DOCUMENTARY_WORKER_ENABLED!==\"true\"/);
 assert.match(entry,/BEP_AGENT_DATABASE_URL is required/);
 assert.match(entry,/DATABASE_URL is deliberately not accepted/);
 assert.match(worker,/new GroqClient/);
 assert.doesNotMatch(server,/app\.post\("\/api\/ai\/chat"[^]*?new GroqClient/);
});

test("approved new knowledge gets an immutable initial version and corrections are versioned",()=>{
 const server=read("server.js"),admin=read("lib/bep-coach-knowledge-admin.js");
 assert.match(server,/change_type,actor_ref\) VALUES\(\$1,1,\$2::jsonb,'created'/);
 assert.match(server,/ON CONFLICT\(slug,version\) DO NOTHING/);
 assert.match(server,/currentVersion=Number\(currentDocument\.version\)/);
 assert.match(admin,/change_type IN \('created','edited','restored','archived'\)/);
 assert.match(server,/restore\/\:version/);
});
