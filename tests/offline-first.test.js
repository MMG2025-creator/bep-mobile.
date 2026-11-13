"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("offline persistence runtime is synchronized and included in the app shell",()=>{
 assert.equal(read("offline-storage.js"),read("dist/offline-storage.js"));
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/offline-storage\\.js\\?v=/);
});

test("offline sync is account-scoped and refuses to overwrite a changed remote snapshot",()=>{
 const js=read("offline-storage.js");
 assert.match(js,/hasKnownUser\\(\\)\\)return false/);
 assert.match(js,/stable\\(remote\\)!==stable\\(pending\\.base\\)/);
 assert.match(js,/bep:offline-conflict/);
 const conflict=js.indexOf('if(stable(remote)!==stable(pending.base))');
 assert.ok(conflict>=0&&js.indexOf('method:"PUT"',conflict)>conflict);
});

test("offline startup restores the local session and sets the remote baseline",()=>{
 const js=read("app.js");
 assert.match(js,/window\\.BEPOffline\\.hasKnownUser\\(\\)/);
 assert.match(js,/window\\.bepOfflineMode=true/);
 assert.match(js,/gate\\.hidden=true/);
 assert.match(js,/window\\.BEPOffline\\.setBaseline\\(d\\.payload\\|\\|\\{\\}\\)/);
});

test("source and published service workers use the same cache and include offline dependencies",()=>{
 const source=read("sw.js"),published=read("dist/sw.js");
 assert.equal(source,published);
 assert.match(source,/bep-shell-v8/);
 assert.match(source,/offline-storage\\.js/);
 assert.match(source,/cdn\\.jsdelivr\\.net/);
 assert.match(source,/tessdata\\.projectnaptha\\.com/);
 assert.match(source,/caches\\.open\\(RUNTIME_CACHE\\)/);
});

test("receipt OCR runs locally and does not upload the image file",()=>{
 const js=read("app.js");
 assert.match(js,/window\\.Tesseract\\.recognize\\(ocrImage,"fra\\+eng"/);
 assert.doesNotMatch(js,/fetch\\([^)]*receiptFile/);
});

test("monthly budget history cache is isolated by authenticated user",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/bep-monthly-history-cache-v1/);
 assert.match(js,/const key = "monthly-history:" \\+ user/);
 assert.match(js,/cached\\?\\.budgets\\?\\.\\[monthKey\\]/);
 assert.match(js,/cacheOnlyMode/);
 assert.match(js,/lecture seule/);
});
