"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourceFingerprint } = require("./bep-agent/source-fingerprint");

const KNOWLEDGE_SCHEMA = "bep-coach-knowledge";
const REASONING_SCHEMA = "bep-coach-reasoning";
const SCHEMA_VERSION = 2;

function mergeApprovedKnowledge(sourceRows, overlayRows) {
  const merged = new Map(sourceRows.filter(row => row.active === true).map(row => [row.slug, row]));
  for (const overlay of overlayRows) {
    const source = merged.get(overlay.slug);
    if (!source) continue;
    if (Number(source.version) !== Number(overlay.source_version)) continue;
    if (sourceFingerprint(source) !== overlay.source_digest) continue;
    if (overlay.active === true) merged.set(overlay.slug, overlay);
    else if (overlay.active === false) merged.delete(overlay.slug);
  }
  return [...merged.values()].sort((a, b) => a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug));
}

function safeDocument(row) {
  return {
    slug: row.slug,
    category: row.category,
    title: row.title,
    content: row.content,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    source_name: row.source_name,
    source_url: row.source_url || "",
    evidence_level: row.evidence_level,
    version: Number(row.version)
  };
}

function loadReasoning(repoRoot) {
  const knowledgePath = path.join(repoRoot, "src/coach/knowledge/financialCoachKnowledge.fr.js");
  const source = fs.readFileSync(knowledgePath, "utf8")
    .replace("export const FINANCIAL_COACH_KB =", "const FINANCIAL_COACH_KB =");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source + "\nmodule.exports = FINANCIAL_COACH_KB;", sandbox, {
    filename: "financialCoachKnowledge.fr.js",
    timeout: 1000
  });
  const rules = sandbox.module.exports;
  const regression = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "src/coach/knowledge/coachRegressionCases.fr.json"), "utf8"
  ));
  return {
    schema: REASONING_SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    provenance: {
      source_kind: "versioned_repository_rules",
      source_files: [
        "src/coach/knowledge/financialCoachKnowledge.fr.js",
        "src/coach/knowledge/coachRegressionCases.fr.json"
      ],
      database_connection_used: false,
      personal_data_included: false
    },
    meta: rules.meta,
    tokenizer: rules.tokenizer,
    profile_schema: rules.profileSchema,
    priorities: rules.priorities,
    scenarios: rules.scenarios,
    amount_bands: rules.amountBands,
    cross_signals: rules.crossSignals,
    calculations: rules.calculations,
    guardrails: rules.guardrails,
    response_blueprint: rules.responseBlueprint,
    regression_cases: regression
  };
}

function buildSnapshots({ sourceRows, overlayRows, repoRoot, sourceRevision, generatedAt = new Date().toISOString() }) {
  if (!Array.isArray(sourceRows) || !Array.isArray(overlayRows)) throw new TypeError("Database rows must be arrays");
  const documents = mergeApprovedKnowledge(sourceRows, overlayRows).map(safeDocument);
  const knowledge = {
    schema: KNOWLEDGE_SCHEMA,
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    provenance: {
      source_kind: "postgresql_approved_shared_knowledge",
      source_tables: ["bep_financial_knowledge", "bep_agent_approved_knowledge"],
      source_revision: sourceRevision || "unknown",
      source_digest: crypto.createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
      personal_data_included: false,
      database_connection_used: true,
      export_mode: "read_only"
    },
    meta: { locale: "fr-FR", jurisdiction: "FR", content_scope: "approved_shared_knowledge_only" },
    counts: { source_rows: sourceRows.length, overlay_rows: overlayRows.length, published_documents: documents.length },
    documents
  };
  const reasoning = loadReasoning(repoRoot);
  reasoning.generated_at = generatedAt;
  reasoning.provenance.source_revision = sourceRevision || "unknown";
  return { knowledge, reasoning };
}

function validateSnapshots({ knowledge, reasoning }) {
  if (!knowledge || knowledge.schema !== KNOWLEDGE_SCHEMA || knowledge.schema_version !== SCHEMA_VERSION) throw new Error("Invalid knowledge schema");
  if (!reasoning || reasoning.schema !== REASONING_SCHEMA || reasoning.schema_version !== SCHEMA_VERSION) throw new Error("Invalid reasoning schema");
  if (!Array.isArray(knowledge.documents) || !Array.isArray(reasoning.scenarios) || !Array.isArray(reasoning.regression_cases?.cases)) throw new Error("Snapshot arrays missing");
  if (!knowledge.provenance || !reasoning.provenance ||
      knowledge.provenance.personal_data_included !== false ||
      reasoning.provenance.personal_data_included !== false) throw new Error("Personal data boundary violated");
  if (knowledge.provenance.export_mode !== "read_only" ||
      knowledge.provenance.source_kind !== "postgresql_approved_shared_knowledge" ||
      knowledge.provenance.database_connection_used !== true ||
      reasoning.provenance.database_connection_used !== false) throw new Error("Snapshot provenance invalid");

  const allowedDocumentKeys = new Set([
    "slug", "category", "title", "content", "keywords", "source_name",
    "source_url", "evidence_level", "version"
  ]);
  for (const doc of knowledge.documents) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("Invalid knowledge document");
    for (const key of Object.keys(doc)) {
      if (!allowedDocumentKeys.has(key)) throw new Error("Unexpected field in exported document: " + key);
    }
    for (const key of allowedDocumentKeys) {
      if (!(key in doc)) throw new Error("Missing field in exported document: " + key);
    }
    if (!Array.isArray(doc.keywords)) throw new Error("Invalid document keywords");
  }
  return true;
}

// Staged directory replacement with rollback. The two directory renames are not a
// single filesystem-atomic exchange; consumers must tolerate a very short path gap.
function publishSnapshotsAtomically(snapshots, dataDir) {
  validateSnapshots(snapshots);
  const parent = path.dirname(dataDir);
  const base = path.basename(dataDir);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, "." + base + ".staging-" + process.pid);
  const backup = path.join(parent, "." + base + ".backup-" + process.pid);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, "knowledge-bep-coach.json"), JSON.stringify(snapshots.knowledge, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(path.join(staging, "reasoning-bep-coach.json"), JSON.stringify(snapshots.reasoning, null, 2) + "\n", { flag: "wx" });
  let backedUp = false;
  try {
    if (fs.existsSync(dataDir)) {
      fs.renameSync(dataDir, backup);
      backedUp = true;
    }
    fs.renameSync(staging, dataDir);
    if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(dataDir) && backedUp && fs.existsSync(backup)) fs.renameSync(backup, dataDir);
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { sourceFingerprint, mergeApprovedKnowledge, buildSnapshots, validateSnapshots, publishSnapshotsAtomically };
