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
 assert.match(route,/else\s*\{/);
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

test("settings UI explains external data sharing and requires an unchecked explicit opt-in",()=>{
 const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
 assert.match(html,/id="externalAiConsentCheckbox" type="checkbox" disabled required/);
 assert.match(html,/tes revenus et leurs sources, tes charges, budgets et dépenses/);
 assert.match(html,/objectifs d’épargne/);
 assert.match(html,/id="revokeExternalAiConsentBtn" hidden/);
});
test("frontend sends the current consent version only after explicit user action",()=>{
 const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
 assert.match(app,/BEP_EXTERNAL_AI_CONSENT_VERSION="bep-external-ai-financial-context-v1"/);
 assert.match(app,/body:JSON\.stringify\(\{enabled,consentVersion:enabled\?BEP_EXTERNAL_AI_CONSENT_VERSION:undefined\}\)/);
 assert.match(app,/externalAiConsentForm\.addEventListener\("submit"/);
 assert.match(app,/revokeExternalAiConsentBtn\.addEventListener\("click"/);
});

test("published source and dist Coach assets stay identical and both entrypoints expose the consent UI",()=>{
 const rootApp=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
 const distApp=fs.readFileSync(path.join(__dirname,"..","dist","app.js"),"utf8");
 const rootHtml=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
 const distHtml=fs.readFileSync(path.join(__dirname,"..","dist","index.html"),"utf8");
 const rootCss=fs.readFileSync(path.join(__dirname,"..","settings.css"),"utf8");
 const distCss=fs.readFileSync(path.join(__dirname,"..","dist","settings.css"),"utf8");
 assert.equal(rootApp,distApp);
 for(const html of [rootHtml,distHtml]){
  assert.match(html,/id="settingsExternalAiConsentCard"/);
  assert.match(html,/app\.js\?v=110&bep=external-ai-consent-20261113/);
 }
 for(const css of [rootCss,distCss])assert.match(css,/\.external-ai-consent-notice/);
});
