"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("readability styles are published in source and dist",()=>{
 for(const file of ["ui-polish.css","dist/ui-polish.css"]){
  const css=read(file);
  assert.match(css,/Madame Michu UX pass/);
  assert.match(css,/--bep-readable-text:\\s*16px/);
  assert.match(css,/\\.savings-module-tab\\.active/);
  assert.match(css,/\\.toast[\\s\\S]*?font-size:\\s*16px/);
 }
});

test("budget workspace hides the global quick expense shortcut",()=>{
 for(const file of ["spend-experience.css","dist/spend-experience.css"])assert.match(read(file),/body:has\\(#budget\\.active\\) #bepQuickExpense\\{display:none!important\\}/);
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/ui-polish\\.css\\?v=/);
});

test("expense module opens accessible dialogs and reuses the existing form",()=>{
 for(const file of ["spend-experience.js","dist/spend-experience.js"]){
  const js=read(file);
  assert.match(js,/function mountQuickExpenseModal\\(panel,entry,trigger\\)/);
  assert.match(js,/mountQuickExpenseModal\\(panel,entry,addButton\\)/);
  assert.match(js,/mountFinancialEntryDialogs\\(\\)/);
  assert.match(js,/dialog\\.showModal\\(\\)/);
  assert.match(js,/bepQuickExpenseDialog/);
 }
});

test("homepage mascot and expense form are present in the source interface",()=>{
 const html=read("index.html");
 assert.match(html,/class="bep-home-mascot"/);
 assert.match(html,/id="purchaseForm"/);
 assert.match(html,/id="receiptFile"[^>]*accept="image\\/\\*"/);
});

test("receipt recognition remains local to the browser and does not auto-save",()=>{
 const app=read("app.js");
 assert.match(app,/window\\.Tesseract\\.recognize\\(ocrImage,"fra\\+eng"/);
 assert.match(app,/await loadTesseract\\(\\)/);
 assert.doesNotMatch(app,/fetch\\([^)]*receiptFile/);
});

test("source and published expense assets stay synchronized",()=>{
 for(const file of ["app.js","spend-experience.js","spend-experience.css"])assert.equal(read(file),read("dist/"+file));
});
