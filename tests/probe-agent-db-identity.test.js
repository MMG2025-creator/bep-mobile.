"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runIdentityProbe } = require("../scripts/probe-agent-db-identity");

function loggerCapture() {
  const lines = [];
  return { lines, logger: { log: (line) => lines.push(line) } };
}

test("missing secret exits without creating a pool", async () => {
  const { lines, logger } = loggerCapture();
  let constructed = false;
  const code = await runIdentityProbe({
    env: {},
    PoolCtor: class { constructor() { constructed = true; } },
    logger,
  });
  assert.equal(code, 2);
  assert.equal(constructed, false);
  assert.match(lines[0], /"reason":"VARIABLE_MISSING"/);
});

test("successful probe executes exactly one read-only identity SELECT and closes pool", async () => {
  const { lines, logger } = loggerCapture();
  let options;
  let query;
  let ended = false;
  class FakePool {
    constructor(value) { options = value; }
    async query(sql) {
      query = sql;
      return { rows: [{ postgres_role: "bep_agent_runner", database_name: "bep_v2_db" }] };
    }
    async end() { ended = true; }
  }
  const code = await runIdentityProbe({
    env: { BEP_AGENT_DATABASE_URL: "NEVER_LOG_THIS_SECRET" },
    PoolCtor: FakePool,
    logger,
  });
  assert.equal(code, 0);
  assert.equal(query, "SELECT current_user AS postgres_role, current_database() AS database_name");
  assert.equal(options.ssl.rejectUnauthorized, false);
  assert.equal(options.max, 1);
  assert.equal(ended, true);
  assert.match(lines[0], /"expected_identity":true/);
  assert.doesNotMatch(lines[0], /NEVER_LOG_THIS_SECRET/);
});

test("identity mismatch is reported without leaking connection details", async () => {
  const { lines, logger } = loggerCapture();
  class FakePool {
    constructor() {}
    async query() { return { rows: [{ postgres_role: "other_role", database_name: "other_db" }] }; }
    async end() {}
  }
  const code = await runIdentityProbe({
    env: { BEP_AGENT_DATABASE_URL: "PRIVATE_DSN" },
    PoolCtor: FakePool,
    logger,
  });
  assert.equal(code, 4);
  assert.match(lines[0], /"reason":"IDENTITY_MISMATCH"/);
  assert.doesNotMatch(lines[0], /PRIVATE_DSN/);
});

test("connection errors are suppressed and pool is closed", async () => {
  const { lines, logger } = loggerCapture();
  let ended = false;
  class FakePool {
    constructor() {}
    async query() { throw new Error("postgres://user:password@host/db"); }
    async end() { ended = true; }
  }
  const code = await runIdentityProbe({
    env: { BEP_AGENT_DATABASE_URL: "PRIVATE_DSN" },
    PoolCtor: FakePool,
    logger,
  });
  assert.equal(code, 5);
  assert.equal(ended, true);
  assert.match(lines[0], /"reason":"DATABASE_CONNECTION_FAILED"/);
  assert.doesNotMatch(lines[0], /password|PRIVATE_DSN|postgres:\/\//);
});
