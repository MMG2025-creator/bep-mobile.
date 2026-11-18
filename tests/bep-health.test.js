"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHealthHandler } = require("../lib/bep-health");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("health returns 200 only when database initialization and SQL probe are ready", async () => {
  let probes = 0;
  const handler = createHealthHandler({
    pool: { query: async (sql) => { probes++; assert.equal(sql, "SELECT 1"); } },
    isDatabaseReady: () => true,
    isAuthConfigured: () => true
  });
  const res = responseRecorder();
  await handler({}, res);
  assert.equal(probes, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true, authConfigured: true, databaseConfigured: true, databaseReady: true
  });
});

test("health returns 503 when database initialization is incomplete", async () => {
  let probes = 0;
  const handler = createHealthHandler({
    pool: { query: async () => { probes++; } },
    isDatabaseReady: () => false,
    isAuthConfigured: () => true
  });
  const res = responseRecorder();
  await handler({}, res);
  assert.equal(probes, 0);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.databaseReady, false);
  assert.equal(res.body.databaseError, "DATABASE_NOT_READY");
});

test("health returns 503 when SQL probe fails", async () => {
  const handler = createHealthHandler({
    pool: { query: async () => { throw new Error("private database detail"); } },
    isDatabaseReady: () => true,
    isAuthConfigured: () => false
  });
  const res = responseRecorder();
  await handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.databaseError, "DATABASE_NOT_READY");
  assert.equal(JSON.stringify(res.body).includes("private database detail"), false);
});

test("health returns 503 when database is not configured", async () => {
  const handler = createHealthHandler({
    pool: null,
    isDatabaseReady: () => false,
    isAuthConfigured: () => false
  });
  const res = responseRecorder();
  await handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.databaseConfigured, false);
  assert.equal(res.body.databaseReady, false);
});
