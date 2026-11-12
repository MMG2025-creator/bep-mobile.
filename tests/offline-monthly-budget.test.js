"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
test("monthly budget history is cached per authenticated account",()=>{
 const source=read("monthly-budget-ui.js"),published=read("dist/monthly-budget-ui.js");
 assert.equal(source,published);
 assert.match(source,/bep-monthly-history-cache-v1:/);
 assert.match(source,/bep-last-authenticated-user/);
 assert.match(source,/function writeOfflineCache\(\)/);
 assert.match(source,/function loadCachedMonth\(monthKey\)/);
});
test("offline monthly history is explicitly read-only and does not call the API",()=>{
 const source=read("monthly-budget-ui.js");
 const offlineRead=source.indexOf('if (!navigator.onLine || !window.bepSignedIn) { loadCachedMonth(monthKey); return; }');
 assert.ok(offlineRead>=0);
 const saveHidden=source.indexOf('$("monthlyBudgetSave").hidden = current.status === "closed" || !window.bepSignedIn;');
 const formHidden=source.indexOf('$("monthlyBudgetItemForm").hidden = current.status === "closed" || !window.bepSignedIn;');
 assert.ok(saveHidden>=0&&formHidden>=0);
 assert.match(source,/Mode hors ligne : historique consultable en lecture seule/);
});
