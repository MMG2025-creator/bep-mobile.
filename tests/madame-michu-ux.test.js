"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Madame Michu readability pass is present in source and published styles", () => {
  for (const file of ["ui-polish.css", "dist/ui-polish.css"]) {
    const css = read(file);
    assert.match(css, /Madame Michu UX pass/);
    assert.match(css, /--bep-readable-text:\s*16px/);
    assert.match(css, /\.ai-advice[\s\S]*?font-size:\s*15px/);
    assert.match(css, /\.tabs \.tab span[\s\S]*?white-space:\s*normal/);
    assert.match(css, /\.savings-module-tab\.active/);
    assert.match(css, /\.toast[\s\S]*?font-size:\s*16px/);
  }
});

test("budget exposes a direct, labelled route to recording a new expense", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    assert.match(html, /class="budget-quick-actions"/);
    assert.match(html, /data-goto="purchases">Enregistrer une dépense/);
    assert.match(html, /aria-live="polite" aria-atomic="true"/);
    assert.match(html, /ui-polish\.css\?v=[23]/);
  }
});

test("expense entry explains its effect on the real-time available budget", () => {
  for (const file of ["spend-experience.js", "dist/spend-experience.js"]) {
    const js = read(file);
    assert.match(js, /Enregistre ici tes achats et dépenses/);
    assert.match(js, /budget disponible est recalculé après validation/);
  }
});

test("confirmation feedback is readable and remains visible long enough", () => {
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /setTimeout\(\(\)=>t\.classList\.remove\("show"\),4200\)/);
  }
});

test("source and published assets remain synchronized", () => {
  assert.equal(read("app.js"), read("dist/app.js"));
  assert.equal(read("spend-experience.js"), read("dist/spend-experience.js"));
});
