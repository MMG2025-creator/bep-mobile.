"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { sourceFingerprint: canonicalFingerprint } = require("../lib/bep-agent/source-fingerprint");
const {
  sourceFingerprint, mergeApprovedKnowledge, buildSnapshots,
  validateSnapshots, publishSnapshotsAtomically
} = require("../lib/bep-coach-snapshot-exporter");

const repoRoot = path.resolve(__dirname, "..");

function source(overrides = {}) {
  return {
    slug: "doc-a", category: "budget", title: "Source title", content: "Source body",
    keywords: ["budget"], source_name: "Source", source_url: "https://example.test",
    evidence_level: "institutional_guidance", version: 2, active: true, ...overrides
  };
}
function overlay(overrides = {}) {
  const base = source();
  return {
    slug: base.slug, category: "budget", title: "Approved title", content: "Approved body",
    keywords: ["approved"], source_name: "Approved source", source_url: "https://approved.test",
    evidence_level: "approved", source_version: base.version, source_digest: canonicalFingerprint(base),
    version: 1, active: true, ...overrides
  };
}

test("uses the canonical BEP source fingerprint without reimplementing it", () => {
  assert.equal(sourceFingerprint, canonicalFingerprint);
  assert.equal(sourceFingerprint(source()).length, 64);
  assert.equal(sourceFingerprint(source()), sourceFingerprint(source({ keywords: ["changed"] })));
  assert.notEqual(sourceFingerprint(source()), sourceFingerprint(source({ content: "changed" })));
});
test("uses only a matching active approved overlay", () => {
  const result = mergeApprovedKnowledge([source()], [overlay()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Approved title");
});
test("a matching inactive overlay suppresses its source", () => {
  assert.deepEqual(mergeApprovedKnowledge([source()], [overlay({ active: false })]), []);
});
test("stale overlays are ignored", () => {
  const result = mergeApprovedKnowledge([source()], [overlay({ source_version: 1 })]);
  assert.equal(result[0].title, "Source title");
});
test("overlays without an active source are ignored", () => {
  assert.deepEqual(mergeApprovedKnowledge([], [overlay()]), []);
});
test("builds and validates snapshots from actual versioned Coach rules and regression cases", () => {
  const snapshots = buildSnapshots({
    sourceRows: [source()], overlayRows: [], repoRoot,
    sourceRevision: "synthetic-test-revision",
    generatedAt: "2026-11-14T12:00:00.000Z"
  });
  assert.equal(validateSnapshots(snapshots), true);
  assert.equal(snapshots.knowledge.documents.length, 1);
  assert.ok(snapshots.reasoning.scenarios.length > 0);
  assert.ok(snapshots.reasoning.regression_cases.cases.length > 0);
  assert.equal(snapshots.reasoning.provenance.database_connection_used, false);
  assert.equal(snapshots.knowledge.provenance.database_connection_used, true);
});
test("strict allowlist rejects unexpected exported fields", () => {
  const snapshots = buildSnapshots({ sourceRows: [source()], overlayRows: [], repoRoot });
  snapshots.knowledge.documents[0].approved_by = "must-not-export";
  assert.throws(() => validateSnapshots(snapshots), /Unexpected field/);
});
test("publication validates before replacing snapshots and preserves last good data on invalid input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bep-export-test-"));
  const data = path.join(dir, "data");
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "keep.txt"), "last-good");
  const invalid = { knowledge: { schema: "wrong" }, reasoning: {} };
  assert.throws(() => publishSnapshotsAtomically(invalid, data));
  assert.equal(fs.readFileSync(path.join(data, "keep.txt"), "utf8"), "last-good");
  fs.rmSync(dir, { recursive: true, force: true });
});
