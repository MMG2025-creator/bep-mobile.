"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const server=()=>fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");

test("automatic BEP advice remains deterministic and does not call Gemini",()=>{
 const src=server(),start=src.indexOf('app.post("/api/ai/advice"'),end=src.indexOf('app.use("/api/ai/chat",coachTelemetry)');
 assert.ok(start>=0&&end>start);
 assert.match(src,/function structuredAdvice\\(zone,p\\)/);
 assert.doesNotMatch(src.slice(start,end),/invokeAi\\(/);
});

test("simple financial questions are routed to structured data before any Gemini call",()=>{
 const src=server(),start=src.indexOf('app.post("/api/ai/chat"'),end=src.indexOf('app.get("/api/coach/knowledge"');
 const route=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(route.indexOf("routeStructuredQuestion")<route.indexOf("userAi("));
});

test("user-facing Gemini remains gated by explicit zero-billing confirmation and monthly quotas",()=>{
 const src=server();
 assert.match(src,/BEP_AI_ZERO_BILLING_CONFIRMED!=="true"/);
 assert.match(src,/BEP_AI_FREE_MONTHLY_LIMIT[^\\n]*\\|\\|10/);
 assert.match(src,/BEP_AI_GLOBAL_MONTHLY_LIMIT[^\\n]*\\|\\|250/);
 assert.match(src,/bep_ai_global_usage/);
});

test("explicit Gemini test endpoint consumes and releases the guarded quota",()=>{
 const src=server(),start=src.indexOf('app.post("/api/ai/test"'),end=src.indexOf('app.get("/api/ai/status"',start);
 assert.ok(start>=0&&end>start);
 const route=src.slice(start,end);
 assert.match(route,/consumeBepAiQuota/);
 assert.match(route,/releaseBepAiQuota/);
});
