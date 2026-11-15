"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {canonicalJson,sha256,signExport,verifyExport,accountRef,sanitizePayload}=require("../admin/bep-admin");
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
