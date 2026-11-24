"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const dist = fs.readFileSync(path.join(root, "dist/admin.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const adminRouter = fs.readFileSync(path.join(root, "admin/bep-admin.js"), "utf8");

test("historical admin page and deployed dist remain byte-identical", () => {
  assert.equal(dist, html);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2);
  for (const [index, script] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(script[1]), "inline admin script " + index + " parses");
  }
});

test("identified sites refresh control is connected to the existing refresh function", () => {
  assert.match(html, /id="crIdentifiedSitesRefresh"/);
  assert.match(html, /\$\("crIdentifiedSitesRefresh"\)\.addEventListener\("click",identifiedSites\)/);
  assert.match(html, /async function identifiedSites\(\)/);
});

test("snapshot export, save, import, pagination and audit controls remain wired", () => {
  for (const id of ["refresh", "save", "docs", "import", "previous", "next", "annotate"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(html, new RegExp('\\$\\("' + id + '"\\)\\.addEventListener'));
  }
  for (const route of ["/export?page=", "/import", "/documents", "/audit", "/annotations"]) {
    assert.ok(html.includes('api("' + route), "admin UI calls " + route);
    assert.ok(adminRouter.includes('router.'), "admin router exists");
  }
});

test("snapshot tools are hidden outside the system and security workspace", () => {
  assert.match(html, /id="dashboardPanel"/);
  for (const id of ["overviewPanel", "accountPanel", "annotationPanel", "snapshotsPanel", "auditPanel"]) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*data-admin-view-panel="system"'));
  }
});

test("structured institutional import count matches the source JSON and remains pending for review", () => {
  const source = JSON.parse(fs.readFileSync(path.join(root, "src/coach/knowledge/financialCoachSources.additional.fr.json"), "utf8"));
  assert.equal(source.documents.length, 62);
  assert.match(html, /Importer les 62 fiches institutionnelles/);
  assert.match(html, /Importer les 62 fiches documentaires comme propositions en attente/);
  assert.match(adminRouter, /importStructuredDocuments/);
});

test("legacy account export routes are mounted behind independent admin authentication", () => {
  assert.match(server, /app\.use\("\/api\/admin\/console",createBepAdminRouter\(\{pool,requireAdmin:requireIndependentBepAdmin\}\)\)/);
  for (const route of ["/export", "/import", "/documents", "/documents/:id", "/annotations", "/audit"]) {
    assert.ok(adminRouter.includes('router.get("' + route) || adminRouter.includes('router.post("' + route), "route exists: " + route);
  }
});
