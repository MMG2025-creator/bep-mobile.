"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("Coach Explorer renders expandable themes and question actions", () => {
  assert.match(app, /document\.createElement\("details"\)/);
  assert.match(app, /coach-question-theme-summary/);
  assert.match(app, /data-coach-question/);
  assert.match(app, /openCoachAnswer\(button\.dataset\.coachQuestion\)/);
});

test("Coach question opens a documentary answer dialog, not a direct tab switch", () => {
  assert.match(html, /id="coachAnswerDialog"/);
  assert.match(html, /id="coachAnswerBody"/);
  assert.match(app, /await submitCoachQuestion\(question\)/);
  assert.match(app, /coach-source-trace/);
});

test("Explorer categories are read from active and human-approved documentary knowledge", () => {
  assert.match(server, /api\\/coach\\/categories/);
  assert.match(server, /WHERE active=TRUE ORDER BY category,slug/);
  assert.match(server, /review_status=\\'accepted\\'/);
  assert.match(app, /coachExplorerThemes=data\\.categories\\.map/);
});

test("Explorer search filters the displayed subjects and questions", () => {
  assert.match(html, /id="coachExplorerSearch"/);
  assert.match(app, /coachExplorerSearch.*addEventListener\("input",renderCoachExplorer\)/);
});

test("Free-question form remains visible and usable in its tab", () => {
  assert.match(html, /id="coachPromptInput"/);
  assert.match(html, /id="coachPromptForm"/);
  assert.match(css, /#coachPanelOpen \.coach-prompt-form\{[^}]*display:grid!important/);
  assert.match(css, /#coachPanelOpen \.coach-prompt-form textarea\{[^}]*display:block!important/);
});

test("Coach robot remains visible on mobile and greeting uses the connected profile first name", () => {
  assert.match(app, /coachFirstName\?"Bonjour "\+coachFirstName/);
  assert.match(css, /\.coach-hero-visual\{display:grid!important/);
});
