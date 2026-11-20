"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getPostgresSslConfig } = require("../lib/bep-postgres-ssl");

test("uses private-network mode for Render internal URLs without sslmode", () => {
  assert.equal(
    getPostgresSslConfig("postgresql://user:pass@host.internal/db"),
    false
  );
});

test("validates the certificate for Render external TLS URLs", () => {
  assert.deepEqual(
    getPostgresSslConfig("postgresql://user:pass@host.render.com/db?sslmode=require"),
    { rejectUnauthorized: true }
  );
});

test("keeps strict certificate validation for verify-ca and verify-full", () => {
  assert.deepEqual(
    getPostgresSslConfig("postgres://u:p@host/db?sslmode=verify-ca"),
    { rejectUnauthorized: true }
  );
  assert.deepEqual(
    getPostgresSslConfig("postgres://u:p@host/db?sslmode=verify-full"),
    { rejectUnauthorized: true }
  );
});

test("rejects explicit insecure or unsupported SSL modes", () => {
  assert.throws(
    () => getPostgresSslConfig("postgres://u:p@host/db?sslmode=disable"),
    /Unsupported or insecure/
  );
  assert.throws(
    () => getPostgresSslConfig("postgres://u:p@host/db?sslmode=prefer"),
    /Unsupported or insecure/
  );
});

test("rejects malformed and non-PostgreSQL connection URLs", () => {
  assert.throws(() => getPostgresSslConfig("not-a-url"), /valid PostgreSQL URL/);
  assert.throws(() => getPostgresSslConfig("https://example.com"), /PostgreSQL protocol/);
});
