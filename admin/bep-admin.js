"use strict";
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}
function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex"); }
function exchangeSecret() { const value = process.env.BEP_ADMIN_EXCHANGE_SECRET || process.env.SESSION_SECRET || ""; return value.length >= 32 ? value : ""; }
function signExport(document, secret) {
  const unsigned = { ...document }; delete unsigned.signature;
  return { ...unsigned, signature: crypto.createHmac("sha256", secret).update(canonicalJson(unsigned)).digest("hex") };
}
function verifyExport(document, secret) {
  if (!document || typeof document !== "object" || Array.isArray(document) || typeof document.signature !== "string") return false;
  const unsigned = { ...document }; const supplied = unsigned.signature; delete unsigned.signature;
  const expected = crypto.createHmac("sha256", secret).update(canonicalJson(unsigned)).digest("hex");
  const a = Buffer.from(supplied, "hex"), b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function accountRef(userId, secret) { return "bep_" + crypto.createHmac("sha256", secret).update("bep-admin-account:" + String(userId)).digest("hex").slice(0, 24); }
function sanitizePayload(value) {
  const privateKey = /^(email|phone|phone_number|first_name|last_name|name|user_name|username|user_id|userid|customer_id|owner_id|created_by|updated_by|full_name|display_name|avatar_url|avatar|address|password|password_hash|token|access_token|refresh_token|secret|credential|credentials|iban|bic|google_sub|oauth|bank_account|account_number)$/i;
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (privateKey.test(key) || /(^|_)(token|secret|password|credential)(_|$)/i.test(key)) continue;
      out[key] = sanitizePayload(child);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL REDACTED]").replace(/\b(?:\+?\d[\d .()/-]{7,}\d)\b/g, "[PHONE REDACTED]");
  return value;
}
async function ensureBepAdminSchema(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS bep_admin_json_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_type TEXT NOT NULL CHECK (document_type IN ('snapshot','annotation')), source_export_id TEXT, document JSONB NOT NULL, content_hash CHAR(64) NOT NULL, created_by_ref TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE INDEX IF NOT EXISTS bep_admin_json_documents_created_idx ON bep_admin_json_documents(created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS bep_admin_json_documents_type_idx ON bep_admin_json_documents(document_type, created_at DESC)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bep_admin_json_snapshot_export_unique ON bep_admin_json_documents(source_export_id) WHERE document_type='snapshot' AND source_export_id IS NOT NULL");
  await pool.query("CREATE TABLE IF NOT EXISTS bep_admin_audit_events (id BIGSERIAL PRIMARY KEY, actor_ref TEXT NOT NULL, action TEXT NOT NULL, target_ref TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, previous_hash CHAR(64), event_hash CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE INDEX IF NOT EXISTS bep_admin_audit_events_created_idx ON bep_admin_audit_events(id DESC)");
}
async function appendAudit(client, actorRef, action, targetRef, details) {
  await client.query("SELECT pg_advisory_xact_lock(72419031)");
  const previous = await client.query("SELECT event_hash FROM bep_admin_audit_events ORDER BY id DESC LIMIT 1");
  const previousHash = previous.rows[0]?.event_hash || null;
  const event = { actor_ref: actorRef, action, target_ref: targetRef || null, details: details || {}, previous_hash: previousHash };
  await client.query("INSERT INTO bep_admin_audit_events(actor_ref,action,target_ref,details,previous_hash,event_hash) VALUES($1,$2,$3,$4::jsonb,$5,$6)", [actorRef, action, targetRef || null, JSON.stringify(details || {}), previousHash, sha256(event)]);
}
function buildExportPage({ rows, budgetsByUser, secret, page, pageSize, hasMore }) {
  const accounts = rows.map((row) => {
    const budgetCount = Number(budgetsByUser.get(String(row.id)) || 0);
    const revisionMaterial = { account_updated_at: row.account_updated_at ? new Date(row.account_updated_at).toISOString() : null, data_updated_at: row.data_updated_at ? new Date(row.data_updated_at).toISOString() : null, payload: row.payload || {}, monthly_budget_count: budgetCount };
    return { account_ref: accountRef(row.id, secret), created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.data_updated_at ? new Date(row.data_updated_at).toISOString() : (row.account_updated_at ? new Date(row.account_updated_at).toISOString() : null),
      expected_hash: sha256(revisionMaterial), data: { data_available: !!row.payload && Object.keys(row.payload).length > 0 }, monthly_budgets: [] ,
      summary: { monthly_budget_count: budgetCount } };
  });
  const totals = accounts.reduce((out, account) => {
    out.accounts_with_data += account.data.data_available ? 1 : 0;
    out.monthly_budget_count += account.summary.monthly_budget_count;
    return out;
  }, { accounts_with_data: 0, monthly_budget_count: 0 });
  return signExport({ schema: "bep-admin-export", schema_version: 2, export_id: crypto.randomUUID(), generated_at: new Date().toISOString(),
    source_environment: process.env.BEP_ENVIRONMENT || "unconfigured", page, page_size: pageSize, has_more: hasMore,
    aggregate: { account_count: accounts.length, ...totals }, accounts }, secret);
}
function createBepAdminRouter({ pool, requireAdmin }) {
  const router = express.Router(), guard = [requireAdmin], getSecret = () => exchangeSecret();
  router.get("/status", ...guard, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, storage: "existing-primary-postgresql-json", separate_database: false, production_sync: "INACTIVE",
      customer_mutations: "DISABLED", financial_corrections: "DISABLED", account_deletion: "DISABLED" });
  });
  router.get("/export", ...guard, async (req, res) => {
    const secret = getSecret(); if (!secret) return res.status(503).json({ error: "ADMIN_EXCHANGE_SECRET_NOT_CONFIGURED" });
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(req.query.page_size, 10) || 50));
    try {
      const result = await pool.query("SELECT u.id, u.created_at, u.updated_at AS account_updated_at, d.payload, d.updated_at AS data_updated_at FROM bep_users u LEFT JOIN bep_user_data d ON d.user_id=u.id ORDER BY u.id LIMIT $1 OFFSET $2", [pageSize + 1, (page - 1) * pageSize]);
      const hasMore = result.rows.length > pageSize, rows = result.rows.slice(0, pageSize), ids = rows.map((row) => String(row.id)), budgetsByUser = new Map();
      if (ids.length) {
        const budgetResult = await pool.query("SELECT user_id, COUNT(*)::int AS budget_count FROM bep_monthly_budgets WHERE user_id=ANY($1::text[]) GROUP BY user_id", [ids]);
        for (const row of budgetResult.rows) budgetsByUser.set(String(row.user_id), Number(row.budget_count) || 0);
      }
      res.setHeader("Cache-Control", "no-store"); res.json(buildExportPage({ rows, budgetsByUser, secret, page, pageSize, hasMore }));
    } catch (error) { console.error("BEP admin export failed", String(error?.message || error).slice(0, 160)); res.status(503).json({ error: "ADMIN_EXPORT_UNAVAILABLE" }); }
  });
  router.post("/import", ...guard, async (req, res) => {
    const secret = getSecret(); if (!secret) return res.status(503).json({ error: "ADMIN_EXCHANGE_SECRET_NOT_CONFIGURED" });
    const document = req.body?.document && typeof req.body.document === "object" ? req.body.document : req.body;
    if (!document || typeof document !== "object" || Array.isArray(document) || JSON.stringify(document).length > 4500000 ||
        document.schema !== "bep-admin-export" || document.schema_version !== 2 || typeof document.export_id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(document.export_id) || !Array.isArray(document.accounts) || document.accounts.length > 100 ||
        !Number.isInteger(document.page) || document.page < 1 || !Number.isInteger(document.page_size) || document.page_size < 1 || document.page_size > 100 ||
        document.accounts.length > document.page_size || typeof document.has_more !== "boolean" ||
        typeof document.source_environment !== "string" || document.source_environment.length > 64 ||
        typeof document.generated_at !== "string" || Number.isNaN(Date.parse(document.generated_at)) || !verifyExport(document, secret))
      return res.status(400).json({ error: "ADMIN_IMPORT_INVALID_OR_UNTRUSTED" });
    for (const account of document.accounts) {
      if (!account || typeof account.account_ref !== "string" || !/^bep_[a-f0-9]{24}$/.test(account.account_ref) ||
          typeof account.expected_hash !== "string" || !/^[a-f0-9]{64}$/.test(account.expected_hash) ||
          !account.data || typeof account.data !== "object" || Array.isArray(account.data) || !Array.isArray(account.monthly_budgets) || canonicalJson(sanitizePayload(account.data)) !== canonicalJson(account.data) || canonicalJson(sanitizePayload(account.monthly_budgets)) !== canonicalJson(account.monthly_budgets))
        return res.status(400).json({ error: "ADMIN_IMPORT_SCHEMA_INVALID" });
    }
    const actor = accountRef(req.session.user.id, secret), client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT id FROM bep_admin_json_documents WHERE document_type='snapshot' AND source_export_id=$1", [document.export_id]);
      if (existing.rowCount) { await client.query("COMMIT"); return res.json({ ok: true, duplicate: true, document_id: existing.rows[0].id }); }
      const inserted = await client.query("INSERT INTO bep_admin_json_documents(document_type,source_export_id,document,content_hash,created_by_ref) VALUES('snapshot',$1,$2::jsonb,$3,$4) ON CONFLICT DO NOTHING RETURNING id", [document.export_id, JSON.stringify(document), sha256(document), actor]);
      if (!inserted.rowCount) {
        const duplicate = await client.query("SELECT id FROM bep_admin_json_documents WHERE document_type='snapshot' AND source_export_id=$1", [document.export_id]);
        await client.query("COMMIT");
        return res.json({ ok: true, duplicate: true, document_id: duplicate.rows[0]?.id || null });
      }
      await appendAudit(client, actor, "snapshot_imported", document.export_id, { document_id: inserted.rows[0].id, accounts: document.accounts.length });
      await client.query("COMMIT"); res.status(201).json({ ok: true, document_id: inserted.rows[0].id, accounts: document.accounts.length });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("BEP admin import failed", String(error?.message || error).slice(0, 160)); res.status(500).json({ error: "ADMIN_IMPORT_FAILED" }); }
    finally { client.release(); }
  });
  router.get("/documents", ...guard, async (req, res) => {
    try { const result = await pool.query("SELECT id,document_type,source_export_id,content_hash,created_at FROM bep_admin_json_documents ORDER BY created_at DESC LIMIT 100"); res.setHeader("Cache-Control", "no-store"); res.json({ documents: result.rows }); }
    catch { res.status(503).json({ error: "ADMIN_DOCUMENTS_UNAVAILABLE" }); }
  });
  router.get("/documents/:id", ...guard, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return res.status(400).json({ error: "INVALID_DOCUMENT_ID" });
    try { const result = await pool.query("SELECT document,content_hash FROM bep_admin_json_documents WHERE id=$1", [req.params.id]); if (!result.rowCount) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" }); res.setHeader("Cache-Control", "no-store"); res.json({ document: result.rows[0].document, content_hash: result.rows[0].content_hash }); }
    catch { res.status(503).json({ error: "ADMIN_DOCUMENT_UNAVAILABLE" }); }
  });
  router.post("/annotations", ...guard, async (req, res) => {
    const documentId = String(req.body?.document_id || ""), account = String(req.body?.account_ref || ""), note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(documentId) || !/^bep_[a-f0-9]{24}$/.test(account) || !note || note.length > 2000) return res.status(400).json({ error: "ADMIN_ANNOTATION_INVALID" });
    const secret = getSecret(); if (!secret) return res.status(503).json({ error: "ADMIN_EXCHANGE_SECRET_NOT_CONFIGURED" });
    const actor = accountRef(req.session.user.id, secret), client = await pool.connect();
    try {
      await client.query("BEGIN");
      const source = await client.query("SELECT document FROM bep_admin_json_documents WHERE id=$1 AND document_type='snapshot' FOR SHARE", [documentId]);
      if (!source.rowCount || !source.rows[0].document.accounts.some((item) => item.account_ref === account)) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ADMIN_ANNOTATION_TARGET_NOT_FOUND" }); }
      const annotation = { schema: "bep-admin-annotation", schema_version: 1, document_id: documentId, account_ref: account, note, created_at: new Date().toISOString() };
      const inserted = await client.query("INSERT INTO bep_admin_json_documents(document_type,document,content_hash,created_by_ref) VALUES('annotation',$1::jsonb,$2,$3) RETURNING id", [JSON.stringify(annotation), sha256(annotation), actor]);
      await appendAudit(client, actor, "annotation_created", account, { document_id: documentId, annotation_id: inserted.rows[0].id });
      await client.query("COMMIT"); res.status(201).json({ ok: true, annotation_id: inserted.rows[0].id });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("BEP admin annotation failed", String(error?.message || error).slice(0, 160)); res.status(500).json({ error: "ADMIN_ANNOTATION_FAILED" }); }
    finally { client.release(); }
  });
  router.get("/audit", ...guard, async (req, res) => {
    try { const result = await pool.query("SELECT id,actor_ref,action,target_ref,details,previous_hash,event_hash,created_at FROM bep_admin_audit_events ORDER BY id DESC LIMIT 100"); res.setHeader("Cache-Control", "no-store"); res.json({ events: result.rows }); }
    catch { res.status(503).json({ error: "ADMIN_AUDIT_UNAVAILABLE" }); }
  });
  return router;
}
const bepAdminPage = fs.readFileSync(path.join(__dirname, "..", "dist", "admin.html"), "utf8");
module.exports = { ensureBepAdminSchema, createBepAdminRouter, bepAdminPage, canonicalJson, sha256, signExport, verifyExport, accountRef, sanitizePayload, buildExportPage };
