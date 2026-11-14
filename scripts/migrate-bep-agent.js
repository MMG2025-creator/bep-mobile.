"use strict";

const { Pool } = require("pg");
const { ensureSchema } = require("../lib/bep-agent/repository");

async function main() {
  if (process.env.BEP_AGENT_SCHEMA_MIGRATE !== "true") {
    console.log("BEP agent schema migration skipped");
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for BEP agent schema migration");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    max: 1
  });
  try {
    await ensureSchema(pool);
    console.log("BEP agent schema migration completed");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("BEP agent schema migration failed:", error.message);
  process.exitCode = 1;
});
