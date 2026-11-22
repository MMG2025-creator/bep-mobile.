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

async function main() {
  const component = process.argv[2];
  const variable = TARGETS[component];

  if (!variable) {
    console.log(JSON.stringify({
      component: component || null,
      checked: false,
      reason: "INVALID_COMPONENT",
      allowed_components: Object.keys(TARGETS),
    }));
    process.exitCode = 2;
    return;
  }

  const connectionString = process.env[variable];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    console.log(JSON.stringify({
      component,
      variable,
      variable_present: false,
      database_connected: false,
      postgres_role: null,
      reason: "VARIABLE_MISSING",
    }));
    process.exitCode = 3;
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
    max: 1,
  });

  try {
    const result = await pool.query("SELECT current_user AS postgres_role");
    const role = result.rows && result.rows[0]
      ? result.rows[0].postgres_role
      : null;

    console.log(JSON.stringify({
      component,
      variable,
      variable_present: true,
      database_connected: true,
      postgres_role: typeof role === "string" ? role : null,
      reason: typeof role === "string" ? "OK" : "ROLE_NOT_RETURNED",
    }));

    if (typeof role !== "string" || role.length === 0) {
      process.exitCode = 4;
    }
  } catch (_error) {
    // Deliberately suppress the driver error: it may contain connection details.
    console.log(JSON.stringify({
      component,
      variable,
      variable_present: true,
      database_connected: false,
      postgres_role: null,
      reason: "DATABASE_CONNECTION_FAILED",
    }));
    process.exitCode = 5;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(() => {
  // Never print exception objects or messages from the database driver.
  console.log(JSON.stringify({
    checked: false,
    reason: "PROBE_FAILED",
  }));
  process.exitCode = 6;
});
