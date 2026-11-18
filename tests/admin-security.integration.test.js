"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { Pool } = require("pg");
const {
  PERMISSIONS,
  resolvePermission,
  requirePermission,
  validateReviewConfirmation
} = require("../admin/bep-admin-permissions");
const { appendAudit } = require("../admin/bep-admin");

const ADMIN_EMAIL = "security-test@example.test";
const ADMIN_SESSION = {
  user: { id: "security-test-admin" },
  bepAdminAuth: {
    authenticated: true,
    userId: "security-test-admin",
    email: ADMIN_EMAIL
  }
};

function makePermissionApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = ADMIN_SESSION;
    req.fullPath = req.baseUrl + req.path;
    const permission = resolvePermission(req);
    return requirePermission(req, res, () => res.status(200).json({ ok: true, permission }), permission);
  });
  return app;
}

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await callback("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("integration: every mapped admin route requires its exact permission grant", async () => {
  const previousEmails = process.env.BEP_ADMIN_EMAILS;
  const previousGrants = process.env.BEP_ADMIN_PERMISSION_GRANTS;
  process.env.BEP_ADMIN_EMAILS = ADMIN_EMAIL;
  const app = makePermissionApp();
  try {
    await withServer(app, async (base) => {
      for (const [routeKey, permission] of Object.entries(PERMISSIONS)) {
        const split = routeKey.indexOf(" ");
        const method = routeKey.slice(0, split);
        let path = routeKey.slice(split + 1).replace(/:(approve|reject)$/, "");
        if (path.endsWith("/documents/:id")) path = path.replace(":id", "123e4567-e89b-12d3-a456-426614174000");
        else path = path.replace(":id", "42");
        const body = path.endsWith("/review") ? { decision: routeKey.endsWith(":reject") ? "reject" : "approve" } : {};
        process.env.BEP_ADMIN_PERMISSION_GRANTS = "{}";
        const denied = await fetch(base + path, {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {})
        });
        assert.equal(denied.status, 403, routeKey + " must deny without a grant");
        assert.equal((await denied.json()).error, "ADMIN_PERMISSION_DENIED", routeKey);

        process.env.BEP_ADMIN_PERMISSION_GRANTS = JSON.stringify({ [ADMIN_EMAIL]: [permission] });
        const allowed = await fetch(base + path, {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {})
        });
        assert.equal(allowed.status, 200, routeKey + " must allow its exact grant");
        assert.equal((await allowed.json()).permission, permission, routeKey);
      }
    });
  } finally {
    if (previousEmails === undefined) delete process.env.BEP_ADMIN_EMAILS; else process.env.BEP_ADMIN_EMAILS = previousEmails;
    if (previousGrants === undefined) delete process.env.BEP_ADMIN_PERMISSION_GRANTS; else process.env.BEP_ADMIN_PERMISSION_GRANTS = previousGrants;
  }
});

test("integration: an unmapped admin endpoint is denied by the Express permission guard", async () => {
  const previousEmails = process.env.BEP_ADMIN_EMAILS;
  const previousGrants = process.env.BEP_ADMIN_PERMISSION_GRANTS;
  process.env.BEP_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.BEP_ADMIN_PERMISSION_GRANTS = JSON.stringify({ [ADMIN_EMAIL]: Object.values(PERMISSIONS) });
  try {
    await withServer(makePermissionApp(), async (base) => {
      const response = await fetch(base + "/api/admin/unmapped-sensitive-action");
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "ADMIN_PERMISSION_UNMAPPED");
    });
  } finally {
    if (previousEmails === undefined) delete process.env.BEP_ADMIN_EMAILS; else process.env.BEP_ADMIN_EMAILS = previousEmails;
    if (previousGrants === undefined) delete process.env.BEP_ADMIN_PERMISSION_GRANTS; else process.env.BEP_ADMIN_PERMISSION_GRANTS = previousGrants;
  }
});

test("integration: document review requires the matching decision confirmation and exact digest", async () => {
  const candidate = { source_digest: "a".repeat(64) };
  const app = express();
  app.use(express.json());
  app.post("/review", (req, res) => {
    return res.status(validateReviewConfirmation(candidate, req.body) ? 200 : 400).json({
      ok: validateReviewConfirmation(candidate, req.body)
    });
  });
  await withServer(app, async (base) => {
    const post = (body) => fetch(base + "/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal((await post({ decision: "approve", confirmation: "APPROVE_DOCUMENT", candidate_digest: candidate.source_digest })).status, 200);
    assert.equal((await post({ decision: "approve", confirmation: "REJECT_DOCUMENT", candidate_digest: candidate.source_digest })).status, 400);
    assert.equal((await post({ decision: "reject", confirmation: "REJECT_DOCUMENT", candidate_digest: "b".repeat(64) })).status, 400);
    assert.equal((await post({ decision: "reject", confirmation: "REJECT_DOCUMENT", candidate_digest: candidate.source_digest })).status, 200);
    assert.equal(validateReviewConfirmation(candidate, { decision: "approve", confirmation: "APPROVE_DOCUMENT", candidate_digest: "invalid" }), false);
  });
});

test("integration: an audit insert failure rolls back the protected database mutation", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("CREATE TEMP TABLE bep_knowledge_candidates_test (id INTEGER PRIMARY KEY, review_status TEXT NOT NULL) ON COMMIT PRESERVE ROWS");
    await client.query("CREATE TEMP TABLE bep_admin_audit_events (id BIGSERIAL PRIMARY KEY, actor_ref TEXT, action TEXT, target_ref TEXT, details JSONB, previous_hash TEXT, event_hash TEXT) ON COMMIT PRESERVE ROWS");
    await client.query("CREATE FUNCTION pg_temp.fail_admin_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated audit storage failure'; END $$");
    await client.query("CREATE TRIGGER fail_admin_audit BEFORE INSERT ON bep_admin_audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_admin_audit_insert()");
    await client.query("INSERT INTO bep_knowledge_candidates_test(id, review_status) VALUES(701, 'pending')");
    await client.query("BEGIN");
    await client.query("UPDATE bep_knowledge_candidates_test SET review_status='approved' WHERE id=701");
    await assert.rejects(
      appendAudit(client, "actor-test-ref", "document_proposal_approved", "candidate-701", { test: true }),
      /simulated audit storage failure/
    );
    await client.query("ROLLBACK");
    const result = await client.query("SELECT review_status FROM bep_knowledge_candidates_test WHERE id=701");
    assert.equal(result.rows[0].review_status, "pending");
  } finally {
    client.release();
    await pool.end();
  }
});
