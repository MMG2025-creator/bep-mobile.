"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  sourceFingerprint, mergeApprovedKnowledge, validateSnapshots, publishSnapshotsAtomically
} = require("../lib/bep-coach-snapshot-exporter");

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
    evidence_level: "approved", source_version: base.version, source_digest: sourceFingerprint(base),
    version: 1, active: true, ...overrides
  };
}

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
test("fingerprint matches the BEP source fingerprint contract", () => {
  assert.equal(sourceFingerprint(source()).length, 64);
  assert.notEqual(sourceFingerprint(source()), sourceFingerprint(source({ keywords: ["changed"] })));
});
test("publication validates before replacing snapshots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bep-export-test-"));
  const data = path.join(dir, "data");
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "keep.txt"), "last-good");
  const invalid = { knowledge: { schema: "wrong" }, reasoning: {} };
  assert.throws(() => publishSnapshotsAtomically(invalid, data));
  assert.equal(fs.readFileSync(path.join(data, "keep.txt"), "utf8"), "last-good");
  fs.rmSync(dir, { recursive: true, force: true });
});
