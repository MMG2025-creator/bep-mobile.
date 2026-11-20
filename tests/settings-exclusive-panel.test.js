const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("opening settings hides every other main panel and keeps settings visible", () => {
  for (const file of ["settings.css", "dist/settings.css"]) {
    const css = read(file);
    assert.match(css, /\.app\.settings-open main>\.panel:not\(#settings\)\{display:none!important\}/);
    assert.match(css, /\.app\.settings-open main>#settings\{display:grid!important\}/);
  }
  assert.equal(read("settings.css"), read("dist/settings.css"));
});

test("published HTML loads the cache-busted settings stylesheet identically", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    assert.match(read(file), /settings\.css\?v=6&bep=exclusive-settings-view-20261120/);
  }
});
