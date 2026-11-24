"use strict";

// One-shot, read-only identity check for the documentary DB credential.
// Invoked only by the manually dispatched GitHub Actions workflow.
// Never logs the connection string, host, port, credentials, or driver errors.

const { Pool } = require("pg");

const EXPECTED_ROLE = "bep_agent_runner";
const EXPECTED_DATABASE = "bep_v2_db";

async function runIdentityProbe({
  env = process.env,
  PoolCtor = Pool,
  logger = console,
} = {}) {
  const connectionString = env.BEP_AGENT_DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    logger.log(JSON.stringify({
      checked: false,
      variable_present: false,
      connected: false,
      reason: "VARIABLE_MISSING",
    }));
    return 2;
  }

  let pool;
  try {
    pool = new PoolCtor({
      connectionString,
      // Match the TLS mode used by the existing Render documentary worker.
      // Traffic remains encrypted; certificate verification is not enabled.
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      max: 1,
    });

    const result = await pool.query(
      "SELECT current_user AS postgres_role, current_database() AS database_name"
    );
    const row = result.rows && result.rows[0] ? result.rows[0] : {};
    const role = typeof row.postgres_role === "string" ? row.postgres_role : null;
    const database = typeof row.database_name === "string" ? row.database_name : null;
    const identityMatches = role === EXPECTED_ROLE && database === EXPECTED_DATABASE;

    logger.log(JSON.stringify({
      checked: true,
      variable_present: true,
      connected: true,
      postgres_role: role,
      database_name: database,
      expected_identity: identityMatches,
      reason: identityMatches ? "OK" : "IDENTITY_MISMATCH",
    }));
    return identityMatches ? 0 : 4;
  } catch (_error) {
    logger.log(JSON.stringify({
      checked: true,
      variable_present: true,
      connected: false,
      postgres_role: null,
      database_name: null,
      expected_identity: false,
      reason: "DATABASE_CONNECTION_FAILED",
    }));
    return 5;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  runIdentityProbe().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    console.log(JSON.stringify({ checked: false, reason: "PROBE_FAILED" }));
    process.exitCode = 6;
  });
}

module.exports = { runIdentityProbe };
