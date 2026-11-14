"use strict";
const { Client } = require("pg");
const { verifyReadOnlyExporterRole } = require("../lib/bep-exporter-role-check");
const connectionString = process.env.BEP_KNOWLEDGE_READONLY_DATABASE_URL;
if (!connectionString) { process.stderr.write("BEP_KNOWLEDGE_READONLY_DATABASE_URL is required\n"); process.exit(2); }
async function main() {
  const client = new Client({ connectionString, application_name: "bep-exporter-role-preflight", statement_timeout: 15000, query_timeout: 20000, connectionTimeoutMillis: 10000, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true } });
  try {
    await client.connect();
    const result = await verifyReadOnlyExporterRole(client);
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stderr.write("Read-only role preflight failed: " + error.message + "\n"); process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
main();
