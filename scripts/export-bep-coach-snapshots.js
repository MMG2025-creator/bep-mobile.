"use strict";
const path = require("node:path");
const { Client } = require("pg");
const { buildSnapshots, publishSnapshotsAtomically } = require("../lib/bep-coach-snapshot-exporter");
const { verifyReadOnlyExporterRole } = require("../lib/bep-exporter-role-check");
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "services/gemini-agent/data");
const connectionString = process.env.BEP_KNOWLEDGE_READONLY_DATABASE_URL;
if (!connectionString) { process.stderr.write("BEP_KNOWLEDGE_READONLY_DATABASE_URL is required\n"); process.exit(2); }
async function main() {
  const client = new Client({ connectionString, application_name: "bep-approved-knowledge-json-exporter", statement_timeout: 15000, query_timeout: 20000, connectionTimeoutMillis: 10000, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true } });
  let transactionOpen = false;
  try {
    await client.connect();
    const identity = await verifyReadOnlyExporterRole(client);
    await client.query("BEGIN READ ONLY"); transactionOpen = true;
    const sourceResult = await client.query(`SELECT slug, category, title, content, keywords, source_name, source_url, evidence_level, version, active FROM public.bep_financial_knowledge WHERE active = TRUE ORDER BY category, slug`);
    const overlayResult = await client.query(`SELECT slug, category, title, content, keywords, source_name, source_url, evidence_level, source_version, source_digest, version, active FROM public.bep_agent_approved_knowledge ORDER BY category, slug`);
    await client.query("COMMIT"); transactionOpen = false;
    const snapshots = buildSnapshots({ sourceRows: sourceResult.rows, overlayRows: overlayResult.rows, repoRoot, sourceRevision: process.env.GIT_SHA || process.env.SOURCE_REVISION || "unknown" });
    publishSnapshotsAtomically(snapshots, dataDir);
    process.stdout.write(JSON.stringify({ ok: true, export_mode: "read_only", database_identity: identity.role_name, database_name: identity.database_name, verified_allowed_tables: identity.allowed_tables, source_rows: sourceResult.rowCount, overlay_rows: overlayResult.rowCount, published_documents: snapshots.knowledge.documents.length, reasoning_scenarios: snapshots.reasoning.scenarios.length, data_dir: dataDir }) + "\n");
  } catch (error) {
    if (transactionOpen) { try { await client.query("ROLLBACK"); } catch {} }
    process.stderr.write("Snapshot export failed; previous snapshots retained: " + error.message + "\n"); process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
main();
