"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("offline persistence runtime is synchronized and included in the app shell",()=>{
 assert.equal(read("offline-storage.js"),read("dist/offline-storage.js"));
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/offline-storage\.js\?v=/);
});

test("offline sync is account-scoped and refuses to overwrite a changed remote snapshot",()=>{
 const js=read("offline-storage.js");
 assert.match(js,/hasKnownUser\(\)\)return false/);
 assert.match(js,/hasTrustedSnapshot\(\)/);
 assert.match(js,/SNAPSHOT_KEY/);
 assert.match(js,/if\(!base\|\|typeof base!=="object"/);
 assert.match(js,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(js,/__bepOfflineSync:true/);
 assert.match(js,/base:pending\.base,payload:pending\.payload/);
 assert.match(js,/savedData\.payload/);
 assert.match(js,/saved\.status===409/);
 assert.match(js,/bep:offline-conflict/);
 const conflict=js.indexOf('if(stable(remote)!==stable(pending.base))');
 assert.ok(conflict>=0&&js.indexOf('method:"PUT"',conflict)>conflict);
});

test("offline startup restores the local session and sets the remote baseline",()=>{
 const js=read("app.js");
 assert.match(js,/window\.BEPOffline\.hasKnownUser\(\)/);
 assert.match(js,/window\.bepOfflineMode=true/);
 assert.match(js,/gate\.hidden=true/);
 assert.match(js,/window\.BEPOffline\.setBaseline\(d\.payload\|\|\{\}\)/);
});

test("source and published service workers use the same cache and include offline dependencies",()=>{
 const source=read("sw.js"),published=read("dist/sw.js");
 assert.equal(source,published);
 assert.match(source,/bep-shell-v8/);
 assert.match(source,/offline-storage\.js/);
 assert.match(source,/cdn\.jsdelivr\.net/);
 assert.match(source,/tessdata\.projectnaptha\.com/);
 assert.match(source,/caches\.open\(RUNTIME_CACHE\)/);
});

test("receipt OCR runs locally and does not upload the image file",()=>{
 const js=read("app.js");
 assert.match(js,/window\.Tesseract\.recognize\(ocrImage,"fra\+eng"/);
 assert.doesNotMatch(js,/fetch\([^)]*receiptFile/);
});

test("monthly budget history cache is isolated by authenticated user",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/bep-monthly-history-cache-v1/);
 assert.match(js,/const key = "monthly-history:" \+ user/);
 assert.match(js,/cached\?\.budgets\?\.\[monthKey\]/);
 assert.match(js,/cacheOnlyMode/);
 assert.match(js,/lecture seule/);
});

test("monthly budget loading ignores stale responses from an earlier month selection",()=>{
 const js=read("monthly-budget-ui.js");
 assert.equal(js,read("dist/monthly-budget-ui.js"));
 assert.match(js,/let monthLoadSequence = 0/);
 assert.match(js,/const requestId = \+\+monthLoadSequence/);
 assert.match(js,/requestId !== monthLoadSequence/);
 assert.match(js,/if \(requestId === monthLoadSequence && epoch === authEpoch\)/);
});
test("monthly budget creation is idempotent and updates require the current version",()=>{
 const js=read("monthly-budget-routes.js");
 assert.match(js,/ON CONFLICT\(user_id,month_key\) DO NOTHING/);
 assert.match(js,/if \(!inserted\.rowCount\)/);
 assert.match(js,/expectedVersion/);
 assert.match(js,/VERSION_CONFLICT/);
});
