"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readAppShell(file) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const match = source.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, `${file} must declare APP_SHELL`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

test("service worker precache lists contain no duplicate requests", () => {
  for (const file of ["sw.js", "dist/sw.js"]) {
    const shell = readAppShell(file);
    assert.equal(new Set(shell).size, shell.length, `${file} contains duplicate APP_SHELL entries`);
    assert.ok(shell.includes("./receipt-ocr.js"), `${file} must precache receipt OCR`);
  }
});

test("source and production service worker precache lists stay synchronized", () => {
  assert.deepEqual(readAppShell("dist/sw.js"), readAppShell("sw.js"));
});
