"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {canonicalJson,sha256,signExport,verifyExport,accountRef,sanitizePayload}=require("../admin/bep-admin");
const {normalizeEmail,hashCode,safeEqualHex,requireIndependentBepAdmin}=require("../admin/bep-admin-auth");
test("canonical JSON is stable regardless of key order",()=>{assert.equal(canonicalJson({z:1,a:{y:2,x:3}}),canonicalJson({a:{x:3,y:2},z:1}));assert.equal(sha256({z:1,a:2}),sha256({a:2,z:1}));});
test("signed exports verify and tampering is rejected",()=>{const secret="test-secret-with-enough-entropy",signed=signExport({schema:"bep-admin-export",schema_version:1,accounts:[]},secret);assert.equal(verifyExport(signed,secret),true);assert.equal(verifyExport({...signed,accounts:[{account_ref:"tampered"}]},secret),false);assert.equal(verifyExport(signed,"wrong-secret"),false);});
test("account references are pseudonymous and stable",()=>{const first=accountRef("customer-internal-id","test-secret");assert.match(first,/^bep_[a-f0-9]{24}$/);assert.equal(first,accountRef("customer-internal-id","test-secret"));assert.notEqual(first,accountRef("another-id","test-secret"));});
test("payload sanitizer removes direct identifiers and masks email and phone values",()=>{const safe=sanitizePayload({first_name:"Alice",email:"alice@example.com",monthly:{amount:1200,label:"Loyer",memo:"Contact alice@example.com"},phone:"+33 6 12 34 56 78",token:"secret-token"});assert.equal("first_name" in safe,false);assert.equal("email" in safe,false);assert.equal("phone" in safe,false);assert.equal("token" in safe,false);assert.equal(safe.monthly.amount,1200);assert.equal(safe.monthly.memo.includes("alice@example.com"),false);});
test("hashes are deterministic SHA-256 values",()=>{assert.match(sha256("bep"),/^[a-f0-9]{64}$/);});


test("admin JSON storage and import API are idempotent in isolated PostgreSQL", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const express = require("express");
  const { Pool } = require("pg");
  const { ensureBepAdminSchema, createBepAdminRouter } = require("../admin/bep-admin");
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let server;
  const exportId = require("node:crypto").randomUUID();
  try {
    await ensureBepAdminSchema(pool);
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use((req, res, next) => { req.session = { user: { id: "ci-admin-user" } }; next(); });
    app.use("/api/admin/console", createBepAdminRouter({ pool, requireAdmin: (req, res, next) => next() }));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const secret = process.env.BEP_ADMIN_EXCHANGE_SECRET || "ci-only-admin-exchange-secret-32-bytes-min";
    process.env.BEP_ADMIN_EXCHANGE_SECRET = secret;
    const document = signExport({
      schema: "bep-admin-export", schema_version: 1, export_id: exportId,
      generated_at: new Date().toISOString(), source_environment: "ci",
      page: 1, page_size: 50, has_more: false, accounts: []
    }, secret);
    const post = () => fetch("http://127.0.0.1:" + address.port + "/api/admin/console/import", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(document)
    });
    const first = await post();
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);
    const second = await post();
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.duplicate, true);
    assert.equal(secondBody.document_id, firstBody.document_id);
    const tampered = { ...document, page: 2 };
    const rejected = await fetch("http://127.0.0.1:" + address.port + "/api/admin/console/import", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tampered)
    });
    assert.equal(rejected.status, 400);
    const status = await fetch("http://127.0.0.1:" + address.port + "/api/admin/console/status");
    const statusBody = await status.json();
    assert.equal(statusBody.production_sync, "INACTIVE");
    assert.equal(statusBody.customer_mutations, "DISABLED");
    await pool.query("DELETE FROM bep_admin_json_documents WHERE source_export_id=$1", [exportId]);
    await pool.query("DELETE FROM bep_admin_audit_events WHERE target_ref=$1", [exportId]);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});


test("admin page inline script parses and contains no active production mutation controls", () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const html = fs.readFileSync(require("node:path").join(__dirname, "../dist/admin.html"), "utf8");
  const match = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(match, "inline admin script exists");
  assert.doesNotThrow(() => new vm.Script(match[1]));
  assert.match(html, /Synchronisation production : INACTIVE/);
  assert.match(html, /Corrections financières : DÉSACTIVÉES/);
  assert.match(html, /Suppression de compte : DÉSACTIVÉE/);
});


test("independent admin auth normalizes email and compares one-time code hashes safely",()=>{const email=normalizeEmail("  MMSIGNENOIR@gmail.com ");assert.equal(email,"mmsignenoir@gmail.com");const hash=hashCode(email,"123456","a-session-pepper-that-is-long-enough");assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(safeEqualHex(hash,hash),true);assert.equal(safeEqualHex(hash,hashCode(email,"654321","a-session-pepper-that-is-long-enough")),false);assert.equal(safeEqualHex("not-a-hash",hash),false)});
test("admin API guard rejects regular BEP sessions without independent authentication",()=>{const previous=process.env.BEP_ADMIN_EMAILS;delete process.env.BEP_ADMIN_EMAILS;let status=0,body=null;const res={status(code){status=code;return this},json(value){body=value;return this}};requireIndependentBepAdmin({session:{user:{id:"admin-user"}}},res,()=>{throw Error("regular BEP session must not pass")});assert.equal(status,401);assert.equal(body.error,"INDEPENDENT_ADMIN_AUTH_REQUIRED");if(previous!==undefined)process.env.BEP_ADMIN_EMAILS=previous});
test("admin API guard authorizes an independently authenticated email on the admin allowlist",()=>{const previous=process.env.BEP_ADMIN_EMAILS,previousLegacy=process.env.BEP_AGENT_ADMIN_USER_IDS;process.env.BEP_ADMIN_EMAILS="mmsignenoir@gmail.com";delete process.env.BEP_AGENT_ADMIN_USER_IDS;let passed=false,status=0;const res={status(code){status=code;return this},json(){return this}};requireIndependentBepAdmin({session:{user:{id:"admin-user"},bepAdminAuth:{authenticated:true,userId:"admin-user",email:" MMSIGNENOIR@gmail.com "}}},res,()=>{passed=true});assert.equal(passed,true);assert.equal(status,0);if(previous===undefined)delete process.env.BEP_ADMIN_EMAILS;else process.env.BEP_ADMIN_EMAILS=previous;if(previousLegacy===undefined)delete process.env.BEP_AGENT_ADMIN_USER_IDS;else process.env.BEP_AGENT_ADMIN_USER_IDS=previousLegacy});
test("admin API guard rejects independently authenticated emails outside the admin allowlist",()=>{const previous=process.env.BEP_ADMIN_EMAILS;process.env.BEP_ADMIN_EMAILS="mmsignenoir@gmail.com";let status=0,body=null;const res={status(code){status=code;return this},json(value){body=value;return this}};requireIndependentBepAdmin({session:{user:{id:"admin-user"},bepAdminAuth:{authenticated:true,userId:"admin-user",email:"other@example.com"}}},res,()=>{throw Error("non-allowlisted admin must not pass")});assert.equal(status,403);assert.equal(body.error,"ADMIN_NOT_ALLOWLISTED");if(previous===undefined)delete process.env.BEP_ADMIN_EMAILS;else process.env.BEP_ADMIN_EMAILS=previous});

test("admin enrollment logs the internal skip reason without exposing the email", async () => {
  const express = require("express");
  const { createBepAdminAuthRouter } = require("../admin/bep-admin-auth");
  const events = [];
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "ci-only-session-secret-with-at-least-32-characters";
  const app = express(); app.use(express.json());
  app.use("/auth", createBepAdminAuthRouter({
    pool: { query: async (sql) => sql.includes("FROM bep_users") ? { rowCount: 1, rows: [{ id: "user-1" }] } : { rowCount: 1, rows: [{ user_id: "user-1" }] } },
    bcrypt: {}, sendCode: async () => {}, allowedEmails: ["admin@example.test"],
    logger: { info: (line) => events.push(JSON.parse(line)) }
  }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/auth/request-enrollment", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.test" })
    });
    assert.equal(response.status, 200);
    assert.equal(events.some(event => event.event === "enrollment_skipped" && event.reason === "admin_account_already_exists"), true);
    assert.equal(JSON.stringify(events).includes("admin@example.test"), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previousSecret;
  }
});

test("independent admin enrollment, login and password recovery use a separate credential", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const express = require("express");
  const { Pool } = require("pg");
  const bcrypt = require("bcryptjs");
  const crypto = require("node:crypto");
  const { ensureBepAdminAuthSchema, createBepAdminAuthRouter } = require("../admin/bep-admin-auth");
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const email = "admin-" + crypto.randomUUID() + "@example.test";
  const userId = "admin-ci-" + crypto.randomUUID();
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "ci-only-session-pepper-for-admin-auth-tests";
  let server, sentCode = "";
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS bep_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,email_verified BOOLEAN NOT NULL DEFAULT TRUE)");
    await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE");
    await pool.query("CREATE TABLE IF NOT EXISTS user_sessions(sid TEXT PRIMARY KEY,sess JSONB NOT NULL,expire TIMESTAMPTZ NOT NULL)");
    await pool.query("INSERT INTO bep_users(id,email,email_verified) VALUES($1,$2,TRUE)", [userId, email]);
    await ensureBepAdminAuthSchema(pool);
    const app = express();
    app.use(express.json());
    app.use((req,res,next)=>{req.session={regenerate:cb=>cb(),save:cb=>cb(null)};next()});
    app.use("/api/admin/auth", createBepAdminAuthRouter({pool,bcrypt,allowedEmails:[email],sendCode:async(_email,code)=>{sentCode=code}}));
    server=app.listen(0,"127.0.0.1");
    await new Promise(resolve=>server.once("listening",resolve));
    const base="http://127.0.0.1:"+server.address().port+"/api/admin/auth";
    const post=(path,body)=>fetch(base+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    let response=await post("/request-enrollment",{email});
    assert.equal(response.status,200);assert.match(sentCode,/^\d{6}$/);
    response=await post("/complete-enrollment",{email,code:sentCode,password:"Strong-Admin-Pass-2026"});
    assert.equal(response.status,200);
    response=await post("/login",{email,password:"Strong-Admin-Pass-2026"});
    assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
    response=await post("/request-reset",{email});
    assert.equal(response.status,200);assert.match(sentCode,/^\d{6}$/);
    response=await post("/complete-reset",{email,code:sentCode,password:"Another-Strong-Pass-2026"});
    assert.equal(response.status,200);
    response=await post("/login",{email,password:"Strong-Admin-Pass-2026"});
    assert.equal(response.status,401);
    response=await post("/login",{email,password:"Another-Strong-Pass-2026"});
    assert.equal(response.status,200);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await pool.query("DELETE FROM bep_admin_auth_challenges WHERE email=$1",[email]).catch(()=>{});
    await pool.query("DELETE FROM bep_admin_accounts WHERE email=$1",[email]).catch(()=>{});
    await pool.query("DELETE FROM bep_users WHERE id=$1",[userId]).catch(()=>{});
    await pool.end();
    if(previousSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previousSecret;
  }
});
