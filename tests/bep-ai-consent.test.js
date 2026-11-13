"use strict";
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");

const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");

test("external Coach AI requires current per-account consent before reading provider configuration",()=>{
 const start=server.indexOf("async function userAi(userId)");
 const end=server.indexOf("const BEP_AI_FREE_MONTHLY_LIMIT",start);
 assert.ok(start>=0&&end>start);
 const fn=server.slice(start,end);
 assert.match(fn,/SELECT enabled,consent_version FROM bep_user_external_ai_consent WHERE user_id=\$1/);
 assert.ok(fn.indexOf("consent.rowCount")<fn.indexOf("BEP_AI_API_KEY"));
 assert.match(fn,/consent_version!==BEP_EXTERNAL_AI_CONSENT_VERSION/);
});

test("external AI consent is stored per authenticated account and defaults to disabled",()=>{
 assert.match(server,/CREATE TABLE IF NOT EXISTS bep_user_external_ai_consent\(user_id TEXT PRIMARY KEY REFERENCES bep_users\(id\) ON DELETE CASCADE,enabled BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(server,/app.get\("\/api\/ai\/consent",auth/);
 assert.match(server,/app.put\("\/api\/ai\/consent",auth/);
 assert.match(server,/CONSENT_VERSION_MISMATCH/);
});

test("revoking external AI consent disables it server-side",()=>{
 const start=server.indexOf('app.put("/api/ai/consent"');
 const end=server.indexOf('app.get("/api/ai/status"',start);
 assert.ok(start>=0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/if\(!enabled\)/);
 assert.match(route,/enabled=FALSE,revoked_at=NOW\(\)/);
});

test("AI status cannot report external availability without current consent",()=>{
 const start=server.indexOf('app.get("/api/ai/status"');
 const end=server.indexOf('app.post("/api/ai/advice"',start);
 assert.ok(start>=0&&end>start);
 const route=server.slice(start,end);
 assert.match(route,/consent_version/);
 assert.match(route,/const configured=consented&&/);
});

test("both external AI entry points pass the authenticated account ID into the consent guard",()=>{
 assert.match(server,/app\.post\("\/api\/ai\/test",auth,async\(req,res\)=>\{let quota=null;try\{const \{cfg,key\}=await userAi\(req\.session\.user\.id\)/);
 assert.match(server,/\(\{cfg,key\}=await userAi\(req\.session\.user\.id\)\)/);
});
