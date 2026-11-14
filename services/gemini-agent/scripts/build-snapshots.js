"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");
const dataDir = path.join(serviceDir, "data");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function loadKnowledgeRules() {
  const file = path.join(repoRoot, "src/coach/knowledge/financialCoachKnowledge.fr.js");
  const source = fs.readFileSync(file, "utf8")
    .replace("export const FINANCIAL_COACH_KB =", "const FINANCIAL_COACH_KB =");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source + "\nmodule.exports = FINANCIAL_COACH_KB;", sandbox, {
    filename: "financialCoachKnowledge.fr.js",
    timeout: 1000
  });
  return sandbox.module.exports;
}

function writeJson(filename, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(value, null, 2) + "\n", "utf8");
}

const rules = loadKnowledgeRules();
const seed = require(path.join(repoRoot, "lib/bep-financial-knowledge-seed.js"));
const sources = readJson("src/coach/knowledge/financialCoachSources.fr.json");
const additionalSources = readJson("src/coach/knowledge/financialCoachSources.additional.fr.json");
const regression = readJson("src/coach/knowledge/coachRegressionCases.fr.json");

const knowledge = {
  schema: "bep-coach-knowledge",
  schema_version: 1,
  generated_at: new Date().toISOString(),
  provenance: {
    repository: "MMG2025-creator/bep-mobile.",
    source_branch: process.env.GIT_BRANCH || "build-time-checkout",
    source_files: [
      "lib/bep-financial-knowledge-seed.js",
      "src/coach/knowledge/financialCoachSources.fr.json",
      "src/coach/knowledge/financialCoachSources.additional.fr.json",
      "src/coach/knowledge/financialCoachKnowledge.fr.js"
    ],
    personal_data_included: false,
    database_connection_used: false
  },
  meta: rules.meta,
  documents: seed,
  sources: {
    schema_version: sources.schemaVersion,
    jurisdiction: sources.jurisdiction,
    checked_at: sources.checkedAt,
    records: [...sources.records, ...additionalSources.records],
    maintenance: sources.maintenance
  },
  source_policy: rules.meta.sourcePolicy
};

const reasoning = {
  schema: "bep-coach-reasoning",
  schema_version: 1,
  generated_at: new Date().toISOString(),
  provenance: {
    repository: "MMG2025-creator/bep-mobile.",
    source_branch: process.env.GIT_BRANCH || "build-time-checkout",
    source_files: [
      "src/coach/knowledge/financialCoachKnowledge.fr.js",
      "src/coach/knowledge/coachRegressionCases.fr.json"
    ],
    personal_data_included: false,
    database_connection_used: false
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

writeJson("knowledge-bep-coach.json", knowledge);
writeJson("reasoning-bep-coach.json", reasoning);
process.stdout.write(JSON.stringify({
  ok: true,
  knowledge_documents: knowledge.documents.length,
  knowledge_sources: knowledge.sources.records.length,
  reasoning_scenarios: reasoning.scenarios.length,
  regression_cases: reasoning.regression_cases.cases.length
}) + "\n");
