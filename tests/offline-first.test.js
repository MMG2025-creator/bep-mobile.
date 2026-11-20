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

test("offline sync delegates safe three-way reconciliation to the transactional API",()=>{
 const js=read("offline-storage.js"),server=read("server.js"),merge=read("lib/bep-offline-merge.js");
 assert.match(js,/hasKnownUser\(\)\)return false/);
 assert.match(js,/__bepOfflineSync:true,base:pending\.base,payload:pending\.payload/);
 assert.doesNotMatch(js,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(server,/mergeOfflinePayload\(base,p,previous\)/);
 assert.match(server,/FOR UPDATE/);
 assert.match(merge,/OFFLINE_CONFLICT/);
 assert.match(merge,/savingsOperations/);
});
test("offline startup restores the local session and sets the remote baseline",()=>{
 const js=read("app.js");
 assert.match(js,/window\.BEPOffline\.hasTrustedSnapshot\(\)/);
 assert.match(js,/window\.bepOfflineMode=true/);
 assert.match(js,/gate\.hidden=true/);
 assert.match(js,/window\.BEPOffline\.setBaseline\(remote\.payload\|\|\{\}\)/);
});

test("source and published service workers use the same cache and include offline dependencies",()=>{
 const source=read("sw.js"),published=read("dist/sw.js");
 assert.equal(source,published);
 assert.match(source,/bep-shell-v29/);
 assert.match(source,/await cache.addAll\(APP_SHELL\);[\s\S]*await self.skipWaiting\(\)/);
 assert.match(source,/key.startsWith\("bep-"\)/);
 assert.match(source,/\.\/settings\.css/);
 assert.match(source,/fetch\(request,\{cache:"no-store"\}\)/);
 assert.match(source,/caches\.match\(request,\{ignoreSearch:true\}\)/);
 assert.match(source,/offline-storage\.js/);
 assert.match(source,/monthly-budget-ui\.css/);
 assert.match(source,/cdn\.jsdelivr\.net/);
 assert.match(source,/tessdata\.projectnaptha\.com/);
 assert.match(source,/caches\.open\(RUNTIME_CACHE\)/);
});

test("PWA update checks refresh the service worker with serialized, throttled checks and a safe reload",()=>{
 const pwa=read("pwa.js");
 assert.equal(pwa,read("dist/pwa.js"));
 assert.match(pwa,/updateViaCache:"none"/);
 assert.match(pwa,/registration\.update\(\)/);
 assert.match(pwa,/5\*60\*1000/);
 assert.match(pwa,/let updateInFlight=null/);
 assert.match(pwa,/let lastUpdateAttempt=0/);
 assert.match(pwa,/now-lastUpdateAttempt<60000/);
 assert.match(pwa,/sw\.js\?v=29/);
 assert.match(pwa,/addEventListener\("focus"/);
 assert.match(pwa,/addEventListener\("visibilitychange"/);
 assert.match(pwa,/controllerchange/);
 assert.match(pwa,/window\.location\.reload\(\)/);
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/pwa\.js\?v=15/);
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
});


test("offline queue serializes snapshots and obtains an authoritative baseline before the first queue write",()=>{
 const js=read("offline-storage.js"),app=read("app.js");
 assert.match(js,/let enqueueChain=Promise\.resolve\(\)/);
 assert.match(js,/JSON\.parse\(JSON\.stringify\(payload\)\)/);
 assert.match(js,/fetchCurrentBaseline\(\)/);
 assert.match(js,/function deletionOnlySnapshot\(local,remote\)/);
 assert.match(js,/stable\(comparable\(local\)\)!==stable\(comparable\(remote\)\)/);
 assert.match(js,/missing-baseline-or-stale-local-snapshot/);
 assert.match(js,/function markTrustedSnapshot\(\)/);
 assert.match(js,/const safePayload=remote\?deletionOnlySnapshot\(pending\.payload,remote\):null/);
 assert.match(app,/Modification conservée sur cet appareil, mais synchronisation suspendue/);
});

test("explicit charge deletions are persisted as a server-side tombstone ledger",()=>{
 const app=read("app.js"),server=read("server.js"),merge=read("lib/bep-offline-merge.js");
 assert.match(app,/rememberDeletedRecords\("budgets",\[String\(id\)\]\)/);
 assert.match(app,/rememberDeletedRecords\("budgets",Array\.from\(ids,String\)\)/);
 assert.match(server,/INVALID_DELETION_LEDGER/);
 assert.match(server,/deletedRecords\};/);
 assert.match(server,/Array\.isArray\(previous\.deletedRecords\?\.\[key\]\)/);
 assert.match(merge,/normalizeDeletedRecords/);
 assert.match(merge,/merged\[key\]=merged\[key\]\.filter/);
});
