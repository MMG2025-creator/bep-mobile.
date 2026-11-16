"use strict";
const express = require("express");
const crypto = require("crypto");

function normalizeEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 254); }
function hashCode(email, code, pepper) { return crypto.createHmac("sha256", pepper).update("bep-admin-code:" + email + ":" + code).digest("hex"); }
function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
async function ensureBepAdminAuthSchema(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS bep_admin_accounts (user_id TEXT PRIMARY KEY REFERENCES bep_users(id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, email_verified BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS bep_admin_auth_challenges (email TEXT PRIMARY KEY, code_hash CHAR(64) NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('enroll','reset')), expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE INDEX IF NOT EXISTS bep_admin_auth_challenges_expiry ON bep_admin_auth_challenges(expires_at)");
}
function createBepAdminAuthRouter({ pool, bcrypt, sendCode, allowedEmails, logger = console }) {
  const router = express.Router();
  const allowed = new Set((allowedEmails || []).map(normalizeEmail).filter(Boolean));
  const pepper = () => String(process.env.SESSION_SECRET || "");
  function validPassword(password) { return typeof password === "string" && password.length >= 12 && password.length <= 128; }
  function logEvent(event, details = {}) {
    const safeDetails = Object.fromEntries(Object.entries(details).filter(([key, value]) => /^[a-z_]+$/.test(key) && typeof value === "string" && value.length <= 64));
    const entry = { component: "bep_admin_auth", event, ...safeDetails };
    if (typeof logger.info === "function") logger.info(JSON.stringify(entry));
  }
  async function issueCode(email, purpose) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await pool.query("INSERT INTO bep_admin_auth_challenges(email,code_hash,purpose,expires_at,attempts) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes',0) ON CONFLICT(email) DO UPDATE SET code_hash=EXCLUDED.code_hash,purpose=EXCLUDED.purpose,expires_at=EXCLUDED.expires_at,attempts=0,created_at=NOW()", [email, hashCode(email, code, pepper()), purpose]);
    logEvent("challenge_created", { purpose });
    try {
      await sendCode(email, code, purpose);
      logEvent("mail_sent", { purpose });
    } catch (error) {
      await pool.query("DELETE FROM bep_admin_auth_challenges WHERE email=$1 AND purpose=$2", [email, purpose]).catch(() => {});
      logEvent("mail_send_failed", { purpose, reason: error?.message === "EMAIL_SERVICE_NOT_CONFIGURED" ? "service_not_configured" : "provider_rejected_or_unavailable" });
      throw error;
    }
  }
  router.post("/request-enrollment", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    if (!allowed.has(email)) logEvent("enrollment_skipped", { reason: "email_not_allowlisted" });
    else if (pepper().length < 32) logEvent("enrollment_skipped", { reason: "session_secret_too_short" });
    if (!allowed.has(email) || pepper().length < 32) return res.status(200).json({ ok: true, message: "Si l'adresse est autorisée et associée à un compte BEP vérifié, un code sera envoyé." });
    try {
      const user = await pool.query("SELECT id FROM bep_users WHERE LOWER(email)=LOWER($1) AND email_verified=TRUE", [email]);
      if (user.rowCount !== 1) {
        logEvent("enrollment_skipped", { reason: "base_account_missing_or_unverified" });
        return res.json({ ok: true, message: "Si l'adresse est autorisée et associée à un compte BEP vérifié, un code sera envoyé." });
      }
      const existing = await pool.query("SELECT user_id FROM bep_admin_accounts WHERE email=$1", [email]);
      if (existing.rowCount !== 0) {
        logEvent("enrollment_skipped", { reason: "admin_account_already_exists" });
        return res.json({ ok: true, message: "Si l'adresse est autorisée et associée à un compte BEP vérifié, un code sera envoyé." });
      }
      await issueCode(email, "enroll");
      return res.json({ ok: true, message: "Si l'adresse est autorisée et associée à un compte BEP vérifié, un code sera envoyé." });
    } catch (error) {
      logEvent("enrollment_request_failed", { reason: error?.message === "EMAIL_SERVICE_NOT_CONFIGURED" ? "mail_service_not_configured" : "database_or_mail_failure" });
      return res.status(200).json({ ok: true, message: "Si l'adresse est autorisée et associée à un compte BEP vérifié, un code sera envoyé." });
    }
  });
  router.post("/complete-enrollment", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email), code = String(req.body?.code || ""), password = req.body?.password;
    if (!allowed.has(email) || !/^\d{6}$/.test(code) || !validPassword(password) || pepper().length < 32) return res.status(400).json({ error: "ADMIN_ENROLLMENT_INVALID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query("SELECT code_hash,purpose,expires_at,attempts FROM bep_admin_auth_challenges WHERE email=$1 FOR UPDATE", [email]);
      if (!challenge.rowCount || challenge.rows[0].purpose !== "enroll" || new Date(challenge.rows[0].expires_at) <= new Date() || challenge.rows[0].attempts >= 5 || !safeEqualHex(challenge.rows[0].code_hash, hashCode(email, code, pepper()))) {
        if (challenge.rowCount) await client.query("UPDATE bep_admin_auth_challenges SET attempts=LEAST(5,attempts+1) WHERE email=$1", [email]);
        await client.query("COMMIT"); return res.status(400).json({ error: "ADMIN_CODE_INVALID_OR_EXPIRED" });
      }
      const user = await client.query("SELECT id FROM bep_users WHERE LOWER(email)=LOWER($1) AND email_verified=TRUE", [email]);
      if (user.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(400).json({ error: "ADMIN_BASE_ACCOUNT_NOT_VERIFIED" }); }
      const passwordHash = await bcrypt.hash(password, 12);
      await client.query("INSERT INTO bep_admin_accounts(user_id,email,password_hash,email_verified) VALUES($1,$2,$3,TRUE)", [user.rows[0].id, email, passwordHash]);
      await client.query("DELETE FROM bep_admin_auth_challenges WHERE email=$1", [email]);
      await client.query("COMMIT");
      return res.json({ ok: true, message: "Compte administrateur créé. Connecte-toi avec tes identifiants administrateur." });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("BEP admin enrollment failed", String(error?.message || error).slice(0, 120));
      return res.status(500).json({ error: "ADMIN_ENROLLMENT_FAILED" });
    } finally { client.release(); }
  });
  router.post("/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email), password = String(req.body?.password || "");
    if (!allowed.has(email) || !password || password.length > 128 || !req.session) return res.status(401).json({ error: "ADMIN_LOGIN_FAILED" });
    try {
      const result = await pool.query("SELECT user_id,email,password_hash,email_verified FROM bep_admin_accounts WHERE email=$1", [email]);
      if (result.rowCount !== 1 || result.rows[0].email_verified !== true || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({ error: "ADMIN_LOGIN_FAILED" });
      const admin = result.rows[0];
      return req.session.regenerate((error) => {
        if (error) return res.status(500).json({ error: "ADMIN_SESSION_FAILED" });
        req.session.user = { id: String(admin.user_id) };
        req.session.bepAdminAuth = { authenticated: true, userId: String(admin.user_id), email: admin.email, authenticatedAt: new Date().toISOString() };
        req.session.save((saveError) => saveError ? res.status(500).json({ error: "ADMIN_SESSION_FAILED" }) : res.json({ ok: true, email: admin.email }));
      });
    } catch (error) { console.error("BEP admin login failed", String(error?.message || error).slice(0, 120)); return res.status(503).json({ error: "ADMIN_LOGIN_UNAVAILABLE" }); }
  });
  router.post("/request-reset", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    try {
      if (allowed.has(email) && pepper().length >= 32) {
        const account = await pool.query("SELECT user_id FROM bep_admin_accounts WHERE email=$1", [email]);
        if (account.rowCount === 1) await issueCode(email, "reset");
      }
    } catch (error) { console.error("BEP admin reset request failed", String(error?.message || error).slice(0, 120)); }
    return res.json({ ok: true, message: "Si un compte administrateur correspond à cette adresse, un code sera envoyé." });
  });
  router.post("/complete-reset", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email), code = String(req.body?.code || ""), password = req.body?.password;
    if (!allowed.has(email) || !/^\d{6}$/.test(code) || !validPassword(password) || pepper().length < 32) return res.status(400).json({ error: "ADMIN_RESET_INVALID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query("SELECT code_hash,purpose,expires_at,attempts FROM bep_admin_auth_challenges WHERE email=$1 FOR UPDATE", [email]);
      if (!challenge.rowCount || challenge.rows[0].purpose !== "reset" || new Date(challenge.rows[0].expires_at) <= new Date() || challenge.rows[0].attempts >= 5 || !safeEqualHex(challenge.rows[0].code_hash, hashCode(email, code, pepper()))) {
        if (challenge.rowCount) await client.query("UPDATE bep_admin_auth_challenges SET attempts=LEAST(5,attempts+1) WHERE email=$1", [email]);
        await client.query("COMMIT"); return res.status(400).json({ error: "ADMIN_CODE_INVALID_OR_EXPIRED" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const updated = await client.query("UPDATE bep_admin_accounts SET password_hash=$1,updated_at=NOW() WHERE email=$2 RETURNING user_id", [passwordHash, email]);
      if (!updated.rowCount) { await client.query("ROLLBACK"); return res.status(400).json({ error: "ADMIN_ACCOUNT_NOT_FOUND" }); }
      await client.query("DELETE FROM bep_admin_auth_challenges WHERE email=$1", [email]);
      await client.query("DELETE FROM user_sessions WHERE sess->'bepAdminAuth'->>'email'=$1", [email]);
      await client.query("COMMIT");
      return res.json({ ok: true, message: "Mot de passe administrateur réinitialisé." });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("BEP admin reset failed", String(error?.message || error).slice(0, 120));
      return res.status(500).json({ error: "ADMIN_RESET_FAILED" });
    } finally { client.release(); }
  });
  router.get("/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = req.session?.bepAdminAuth;
    if (auth?.authenticated === true && auth.userId === String(req.session?.user?.id || "")) return res.json({ authenticated: true, email: auth.email });
    return res.json({ authenticated: false });
  });
  router.post("/logout", (req, res) => {
    if (req.session) delete req.session.bepAdminAuth;
    if (req.session) return req.session.save((error) => error ? res.status(500).json({ error: "ADMIN_LOGOUT_FAILED" }) : res.json({ ok: true }));
    return res.json({ ok: true });
  });
  return router;
}
function requireIndependentBepAdmin(req, res, next) {
  const auth = req.session?.bepAdminAuth;
  if (!req.session?.user?.id || auth?.authenticated !== true || auth.userId !== String(req.session.user.id)) return res.status(401).json({ error: "INDEPENDENT_ADMIN_AUTH_REQUIRED" });
  const allowed = String(process.env.BEP_AGENT_ADMIN_USER_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(String(req.session.user.id))) return res.status(403).json({ error: "ADMIN_NOT_ALLOWLISTED" });
  next();
}
module.exports = { ensureBepAdminAuthSchema, createBepAdminAuthRouter, requireIndependentBepAdmin, normalizeEmail, hashCode, safeEqualHex };
