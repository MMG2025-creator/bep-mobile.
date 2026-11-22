"use strict";

// Safe, one-shot PostgreSQL identity probe.
// Usage: node scripts/check-db-role.js api
//        node scripts/check-db-role.js worker
// Never prints connection strings, credentials, hosts, or database names.

const { Pool } = require("pg");

const TARGETS = Object.freeze({
  api: "DATABASE_URL",
  worker: "BEP_AGENT_DATABASE_URL",
});

async function runProbe({ component, env = process.env, PoolCtor = Pool, logger = console }) {
  const variable = TARGETS[component];

  if (!variable) {
    logger.log(JSON.stringify({
      component: component || null,
      checked: false,
      reason: "INVALID_COMPONENT",
      allowed_components: Object.keys(TARGETS),
    }));
    return 2;
  }

  const connectionString = env[variable];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    logger.log(JSON.stringify({
      component,
      variable,
      variable_present: false,
      database_connected: false,
      postgres_role: null,
      reason: "VARIABLE_MISSING",
    }));
    return 3;
  }

  let pool;
  try {
    pool = new PoolCtor({
      connectionString,
      // Require a trusted certificate; never disable TLS verification.
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      max: 1,
    });

    const result = await pool.query("SELECT current_user AS postgres_role");
    const role = result.rows && result.rows[0]
      ? result.rows[0].postgres_role
      : null;

    logger.log(JSON.stringify({
      component,
      variable,
      variable_present: true,
      database_connected: true,
      postgres_role: typeof role === "string" ? role : null,
      reason: typeof role === "string" && role.length > 0 ? "OK" : "ROLE_NOT_RETURNED",
    }));

    return typeof role === "string" && role.length > 0 ? 0 : 4;
  } catch (_error) {
    // Deliberately suppress driver errors: they may contain connection details.
    logger.log(JSON.stringify({
      component,
      variable,
      variable_present: true,
      database_connected: false,
      postgres_role: null,
      reason: "DATABASE_CONNECTION_FAILED",
    }));
    return 5;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

async function main() {
  try {
    process.exitCode = await runProbe({ component: process.argv[2] });
  } catch (_error) {
    console.log(JSON.stringify({ checked: false, reason: "PROBE_FAILED" }));
    process.exitCode = 6;
  }
}

if (require.main === module) main();

module.exports = { runProbe };
