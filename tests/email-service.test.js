"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadMailBridge() {
  const source = fs.readFileSync(path.join(__dirname, "../email-service/Code.gs"), "utf8");
  const sent = [];
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === "BEP_MAIL_SECRET" ? "test-shared-secret" : null }) },
    GmailApp: { sendEmail: (...args) => sent.push(args) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: value => ({ value, setMimeType() { return this; } })
    },
    console: { error() {} }
  };
  vm.runInNewContext(source, sandbox, { filename: "Code.gs" });
  return { doPost: sandbox.doPost, sent };
}

function post(doPost, payload) {
  const result = doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(result.value);
}

test("admin_auth_code sends a six-digit one-time administrator code", () => {
  const { doPost, sent } = loadMailBridge();
  const result = post(doPost, { secret: "test-shared-secret", email: "admin@example.test", code: "004271", type: "admin_auth_code" });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], "Code de sécurité administrateur BEP");
  assert.match(sent[0][2], /004271/);
  assert.match(sent[0][2], /10 minutes/);
  assert.match(sent[0][3].htmlBody, /004271/);
});

test("admin_auth_code rejects malformed codes without sending mail", () => {
  const { doPost, sent } = loadMailBridge();
  const result = post(doPost, { secret: "test-shared-secret", email: "admin@example.test", code: "12345", type: "admin_auth_code" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "INVALID_CODE");
  assert.equal(sent.length, 0);
});

test("email_verification keeps its existing message contract", () => {
  const { doPost, sent } = loadMailBridge();
  const result = post(doPost, { secret: "test-shared-secret", email: "user@example.test", code: "123456", type: "email_verification" });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent[0][1], "Vérification de ton adresse e-mail BEP");
  assert.match(sent[0][2], /code de vérification BEP/);
});

test("password_reset remains a validated reset-link email", () => {
  const { doPost, sent } = loadMailBridge();
  const url = "https://bep-mobile.onrender.com/?reset=" + "a".repeat(64);
  const result = post(doPost, { secret: "test-shared-secret", email: "user@example.test", code: url, resetUrl: url, type: "password_reset" });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent[0][1], "Réinitialisation du mot de passe BEP");
  assert.match(sent[0][2], new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("mail bridge rejects a wrong shared secret", () => {
  const { doPost, sent } = loadMailBridge();
  const result = post(doPost, { secret: "wrong", email: "admin@example.test", code: "123456", type: "admin_auth_code" });
  assert.equal(result.error, "UNAUTHORIZED");
  assert.equal(sent.length, 0);
});
