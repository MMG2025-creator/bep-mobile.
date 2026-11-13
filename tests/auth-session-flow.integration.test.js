"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");

const root = path.join(__dirname, "..");
const databaseUrl = process.env.TEST_DATABASE_URL;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url, child, output) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("BEP server exited early: " + output());
    try {
      const response = await fetch(url + "/api/health");
      const health = await response.json();
      if (health.databaseReady) return;
      lastError = new Error(JSON.stringify(health));
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("BEP server did not become healthy: " + String(lastError) + "\n" + output());
}

test("real HTTP authentication journeys enforce one active session and preserve user data", {
  skip: !databaseUrl && "TEST_DATABASE_URL is required for isolated PostgreSQL authentication tests"
}, async t => {
  const admin = new Pool({ connectionString: databaseUrl, max: 2 });
  const schema = "bep_auth_flow_" + process.pid + "_" + Date.now();
  let scoped, child, baseUrl, emailServer;
  const emailMessages = [];
  let stdout = "", stderr = "";
  const output = () => stdout + "\n" + stderr;

  try {
    await admin.query('CREATE SCHEMA "' + schema + '"');
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set("options", "-c search_path=" + schema);
    scoped = new Pool({ connectionString: scopedUrl.toString(), max: 5 });

    emailServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", chunk => { raw += chunk.toString(); });
      req.on("end", () => {
        try {
          const message = JSON.parse(raw);
          emailMessages.push(message);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: message.secret === "isolated-mail-secret" }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
        }
      });
    });
    await new Promise(resolve => emailServer.listen(0, "127.0.0.1", resolve));
    const emailUrl = "http://127.0.0.1:" + emailServer.address().port;

    const port = await freePort();
    baseUrl = "http://127.0.0.1:" + port;
    child = spawn(process.execPath, [path.join(root, "server.js")], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: scopedUrl.toString(),
        FRONTEND_ORIGIN: baseUrl,
        SESSION_SECRET: "isolated-auth-flow-test-secret",
        GMAIL_APPS_SCRIPT_URL: emailUrl,
        BEP_MAIL_SECRET: "isolated-mail-secret",
        PORT: String(port),
        NODE_ENV: "test",
        NODE_OPTIONS: "--require=" + path.join(__dirname, "disable-pg-ssl.cjs")
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    await waitForHealth(baseUrl, child, output);

    const password = "Test-Password-2026!";
    const passwordHash = await bcrypt.hash(password, 4);
    await scoped.query(
      "INSERT INTO bep_users(id,email,display_name,password_hash,email_verified) VALUES($1,$2,$3,$4,TRUE),($5,$6,$7,$8,FALSE)",
      ["email:auth-flow-user", "auth-flow@example.test", "Test User", passwordHash,
       "email:unverified-user", "unverified@example.test", "Unverified User", passwordHash]
    );
    await scoped.query(
      "INSERT INTO bep_user_data(user_id,payload) VALUES($1,$2::jsonb)",
      ["email:auth-flow-user", JSON.stringify({ income: 4200, budgets: [{ id: "budget-1", label: "Test" }], expenses: [], goals: [] })]
    );

    const call = async (route, method = "GET", body, cookie) => {
      const response = await fetch(baseUrl + route, {
        method,
        headers: {
          Origin: baseUrl,
          "X-Forwarded-Proto": "https",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual"
      });
      const data = await response.json().catch(() => null);
      return { status: response.status, data, setCookie: response.headers.get("set-cookie") || "" };
    };
    const login = async (email, pass) => {
      const result = await call("/api/auth/login", "POST", { email, password: pass });
      return { ...result, cookie: result.setCookie.split(";")[0] };
    };

    await t.test("registers a new account and verifies its email through a local mail stub", async () => {
      const email = "signup-flow@example.test";
      const registered = await call("/api/auth/register", "POST", {
        email, password: "Signup-Password-2026!", name: "Signup Test"
      });
      assert.equal(registered.status, 201, JSON.stringify(registered.data));
      assert.equal(registered.data.verificationRequired, true);
      const mail = emailMessages.findLast(message => message.email === email && message.type === "email_verification");
      assert.ok(mail && /^\d{6}$/.test(mail.code), "verification code must be sent to the isolated mail stub");
      const wrongCode = mail.code === "000000" ? "000001" : "000000";
      const rejected = await call("/api/auth/verify-email", "POST", { email, code: wrongCode });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.data.error, "INVALID_CODE");
      const verified = await call("/api/auth/verify-email", "POST", { email, code: mail.code });
      assert.equal(verified.status, 200, JSON.stringify(verified.data));
      const cookie = verified.setCookie.split(";")[0];
      assert.ok(cookie.startsWith("connect.sid="), "email verification must establish a session");
      const profile = await call("/api/me", "GET", undefined, cookie);
      assert.equal(profile.status, 200);
      assert.equal(profile.data.user.email, email);
      const logout = await call("/api/auth/logout", "POST", {}, cookie);
      assert.equal(logout.status, 200);
    });

    await t.test("rejects invalid credentials and unverified email", async () => {
      const invalid = await login("auth-flow@example.test", "wrong-password-123");
      assert.equal(invalid.status, 401);
      assert.equal(invalid.data.error, "LOGIN_INVALID");
      const unverified = await login("unverified@example.test", password);
      assert.equal(unverified.status, 403);
      assert.equal(unverified.data.error, "EMAIL_NOT_VERIFIED");
    });

    const deviceA = await login("auth-flow@example.test", password);
    assert.equal(deviceA.status, 200, JSON.stringify(deviceA.data));
    assert.ok(deviceA.cookie.startsWith("connect.sid="), "login must issue a session cookie");

    await t.test("loads authenticated profile and keeps financial data intact", async () => {
      const status = await call("/api/auth/status", "GET", undefined, deviceA.cookie);
      assert.equal(status.status, 200);
      assert.equal(status.data.user.email, "auth-flow@example.test");
      const me = await call("/api/me", "GET", undefined, deviceA.cookie);
      assert.equal(me.status, 200);
      const data = await call("/api/data", "GET", undefined, deviceA.cookie);
      assert.equal(data.status, 200);
      assert.equal(data.data.payload.income, 4200);
      assert.equal(data.data.payload.budgets[0].id, "budget-1");
    });

    await t.test("passive API requests do not refresh the 15-minute inactivity timer", async () => {
      const before = await scoped.query("SELECT updated_at FROM bep_active_sessions WHERE user_id=$1", ["email:auth-flow-user"]);
      const passive = await call("/api/me", "GET", undefined, deviceA.cookie);
      assert.equal(passive.status, 200);
      const after = await scoped.query("SELECT updated_at FROM bep_active_sessions WHERE user_id=$1", ["email:auth-flow-user"]);
      assert.equal(after.rows[0].updated_at.toISOString(), before.rows[0].updated_at.toISOString());
    });

    await t.test("blocks a second device while the first session is active", async () => {
      const deviceB = await login("auth-flow@example.test", password);
      assert.equal(deviceB.status, 409);
      assert.equal(deviceB.data.error, "SESSION_ALREADY_ACTIVE");
      const stillActive = await call("/api/me", "GET", undefined, deviceA.cookie);
      assert.equal(stillActive.status, 200);
    });

    await t.test("explicit user activity refreshes the inactivity timer", async () => {
      await scoped.query("UPDATE bep_active_sessions SET updated_at=NOW()-INTERVAL '14 minutes' WHERE user_id=$1", ["email:auth-flow-user"]);
      const activity = await call("/api/session/activity", "POST", {}, deviceA.cookie);
      assert.equal(activity.status, 200);
      const active = await scoped.query("SELECT updated_at > NOW()-INTERVAL '1 minute' AS fresh FROM bep_active_sessions WHERE user_id=$1", ["email:auth-flow-user"]);
      assert.equal(active.rows[0].fresh, true);
    });

    await t.test("does not allow takeover while an in-flight request lease remains", async () => {
      await scoped.query("UPDATE bep_active_sessions SET updated_at=NOW()-INTERVAL '16 minutes' WHERE user_id=$1", ["email:auth-flow-user"]);
      await scoped.query(
        "INSERT INTO bep_active_session_requests(request_id,user_id,session_id,expires_at) SELECT 'held-request',$1,session_id,NOW()+INTERVAL '2 minutes' FROM bep_active_sessions WHERE user_id=$1",
        ["email:auth-flow-user"]
      );
      const blocked = await login("auth-flow@example.test", password);
      assert.equal(blocked.status, 409);
      assert.equal(blocked.data.error, "SESSION_ALREADY_ACTIVE");
      await scoped.query("DELETE FROM bep_active_session_requests WHERE request_id='held-request'");
    });

    const deviceB = await login("auth-flow@example.test", password);
    assert.equal(deviceB.status, 200, JSON.stringify(deviceB.data));

    await t.test("allows a new device after 15 minutes of inactivity and expires the old device", async () => {
      const oldDevice = await call("/api/me", "GET", undefined, deviceA.cookie);
      assert.equal(oldDevice.status, 401);
      assert.equal(oldDevice.data.error, "SESSION_EXPIRED");
      const newDevice = await call("/api/data", "GET", undefined, deviceB.cookie);
      assert.equal(newDevice.status, 200);
      assert.equal(newDevice.data.payload.income, 4200);
    });

    await t.test("logout releases the active-session lock immediately", async () => {
      const logout = await call("/api/auth/logout", "POST", {}, deviceB.cookie);
      assert.equal(logout.status, 200);
      assert.equal(logout.data.ok, true);
      const active = await scoped.query("SELECT 1 FROM bep_active_sessions WHERE user_id=$1", ["email:auth-flow-user"]);
      assert.equal(active.rowCount, 0);
    });

    const deviceC = await login("auth-flow@example.test", password);
    assert.equal(deviceC.status, 200, JSON.stringify(deviceC.data));

    await t.test("password reset invalidates every previous session and permits the new password", async () => {
      const token = "a".repeat(64);
      const tokenHash = require("node:crypto").createHash("sha256").update(token).digest("hex");
      await scoped.query(
        "INSERT INTO bep_password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",
        [tokenHash, "email:auth-flow-user"]
      );
      const reset = await call("/api/auth/reset-password", "POST", { token, password: "New-Test-Password-2026!" });
      assert.equal(reset.status, 200, JSON.stringify(reset.data));
      const stale = await call("/api/me", "GET", undefined, deviceC.cookie);
      assert.equal(stale.status, 401);
      const newLogin = await login("auth-flow@example.test", "New-Test-Password-2026!");
      assert.equal(newLogin.status, 200, JSON.stringify(newLogin.data));
      const invalidOldPassword = await login("auth-flow@example.test", password);
      assert.equal(invalidOldPassword.status, 401);
    });

    await t.test("rejects expired reset tokens and weak passwords", async () => {
      const weak = await call("/api/auth/reset-password", "POST", { token: "b".repeat(64), password: "short" });
      assert.equal(weak.status, 400);
      assert.equal(weak.data.error, "RESET_INVALID");
      const expiredToken = "c".repeat(64);
      const expiredHash = require("node:crypto").createHash("sha256").update(expiredToken).digest("hex");
      await scoped.query(
        "INSERT INTO bep_password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,NOW()-INTERVAL '1 minute')",
        [expiredHash, "email:auth-flow-user"]
      );
      const expired = await call("/api/auth/reset-password", "POST", { token: expiredToken, password: "Another-Password-2026!" });
      assert.equal(expired.status, 400);
      assert.equal(expired.data.error, "RESET_EXPIRED");
    });
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    if (scoped) await scoped.end();
    if (emailServer) await new Promise(resolve => emailServer.close(resolve));
    await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {});
    await admin.end();
  }
});
