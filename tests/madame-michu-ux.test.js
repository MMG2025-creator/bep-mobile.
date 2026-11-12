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

test("budget modules do not expose an expense shortcut", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    assert.doesNotMatch(html, /class="budget-quick-actions"/);
    assert.doesNotMatch(html, /data-goto="purchases">Enregistrer une dépense/);
    assert.match(html, /aria-live="polite" aria-atomic="true"/);
    assert.match(html, /ui-polish\\.css\\?v=[23]/);
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


test("daily expense capture opens in an accessible dialog and reuses the existing form", () => {
  for (const file of ["spend-experience.js", "dist/spend-experience.js"]) {
    const js = read(file);
    assert.match(js, /bepQuickExpenseDialog/);
    assert.match(js, /dialog\.showModal\(\)/);
    assert.match(js, /bep:expense-saved/);
    assert.match(js, /appendChild\(entry\)/);
  }
  for (const file of ["spend-experience.css", "dist/spend-experience.css"]) {
    const css = read(file);
    assert.match(css, /\.bep-quick-expense-dialog::backdrop/);
    assert.match(css, /\.bep-quick-expense-body/);
  }
});

test("coach mascot is visible and heavy OCR libraries no longer block initial load", () => {
  for (const file of ["index.html", "dist/index.html"]) {
    const html = read(file);
    assert.match(html, /id="bepCoachMascot"/);
    assert.match(html, /id="bepQuickExpense"/);
    assert.doesNotMatch(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js/);
    assert.doesNotMatch(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js/);
    assert.match(html, /\[BEP performance\]/);
    assert.match(html, /spend-experience\.css\?v=6/);
    assert.match(html, /spend-experience\.js\?v=7/);
  }
  for (const file of ["app.js", "dist/app.js"]) {
    const js = read(file);
    assert.match(js, /async function loadPdfJs/);
    assert.match(js, /async function loadTesseract/);
    assert.match(js, /bep:expense-saved/);
    assert.equal(js, read(file === "app.js" ? "dist/app.js" : "app.js"));
  }
});


test("financial entry forms open in accessible dialogs", () => {
  const spend=read("spend-experience.js");assert.equal(spend,read("dist/spend-experience.js"));
  for(const id of ["income","income-checkup","charge","charge-checkup","savings-goal","savings-movement","monthly-create","monthly-item","profile"])assert.ok(spend.includes('"'+id+'"'));
  assert.match(spend,/mountQuickExpenseModal\(panel,entry\)/);assert.match(spend,/mountFinancialEntryDialogs\(\)/);assert.match(spend,/dialog\.showModal\(\)/);assert.match(spend,/dialog\.addEventListener\("close",\(\)=>trigger\.focus\(\)\)/);
  for(const file of ["app.js","dist/app.js"]){const js=read(file);assert.match(js,/BEP_OPEN_ENTRY_DIALOG\("income"\)/);assert.match(js,/BEP_OPEN_ENTRY_DIALOG\("charge"\)/);assert.match(js,/BEP_OPEN_ENTRY_DIALOG\("savings-goal"\)/);assert.match(js,/bep:entry-saved/)}
});
test("receipt photo capture suggests expense fields locally without automatic saving", () => {
  for(const file of ["index.html","dist/index.html"]){const html=read(file);assert.match(html,/id="receiptFile"[^>]*capture="environment"/);assert.match(html,/id="receiptStatus"/)}
  for(const file of ["app.js","dist/app.js"]){const js=read(file);assert.match(js,/await loadTesseract\(\)/);assert.match(js,/window\.Tesseract\.recognize\(file,"fra\+eng"/);assert.match(js,/receiptCaptureText="Ticket photographié/);assert.match(js,/Vérifie et corrige les champs avant d’enregistrer/);assert.match(js,/captureMode:editingPurchaseId\?\(previous\.captureMode\|\|"manual"\):\(receiptCaptureText\?"receipt":"manual"\)/)}
  for(const file of ["spend-experience.css","dist/spend-experience.css"])assert.match(read(file),/\.bep-receipt-capture/);
});
test("monthly budget dialogs close only after successful form updates",()=>{const js=read("monthly-budget-ui.js");assert.match(js,/id:"monthly-create"/);assert.match(js,/id:"monthly-item"/)});
