"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const dist = fs.readFileSync(path.join(root, "dist/admin.html"), "utf8");

test("admin source and served page stay synchronized", () => {
  assert.equal(dist, admin);
});

test("Groq documentary candidates expose explicit human review actions", () => {
  assert.match(admin, /id="groqDocumentaryCandidates"/);
  assert.match(admin, /\[\["approve","Approuver et intégrer"\],\["reject","Rejeter la proposition"\]\]/);
  assert.match(admin, /window\.confirm\(question\)/);
  assert.match(admin, /\/api\/admin\/bep-agent\/candidates\/\+encodeURIComponent\(item\.id\)\+"\/review"/);
  assert.match(admin, /body:JSON\.stringify\(\{decision\}\)/);
  assert.match(admin, /await loadRuns\(\)/);
});

test("documentary review never runs without an explicit button action", () => {
  const start = admin.indexOf('const candidates=Array.isArray(data.pendingCandidates)');
  const end = admin.indexOf('const runs=(data.runs||[])', start);
  assert.ok(start >= 0 && end > start);
  const renderer = admin.slice(start, end);
  assert.match(renderer, /button\.addEventListener\("click"/);
  assert.match(renderer, /if\(!window\.confirm\(question\)\)return/);
  assert.doesNotMatch(renderer, /fetch\([^)]*\/review/);
});

test("admin navigation exposes the content review and collection workspaces", () => {
  assert.match(admin, /Articles, propositions & bibliothèque/);
  assert.match(admin, /Recherche, collecte & IA documentaire/);
});
