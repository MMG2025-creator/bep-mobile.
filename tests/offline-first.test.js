"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
test("offline persistence runtime is published in source and dist",()=>{
 const source=read("offline-storage.js"),published=read("dist/offline-storage.js");
 assert.equal(source,published);
 for(const file of ["index.html","dist/index.html"])assert.match(read(file),/offline-storage\.js\?v=3/);
 for(const file of ["sw.js","dist/sw.js"])assert.match(read(file),/\.\/offline-storage\.js/);
});
test("offline sync is account-scoped and refuses to overwrite a changed remote snapshot",()=>{
 const js=read("offline-storage.js");
 assert.match(js,/hasKnownUser\(\)\)return false/);
 assert.match(js,/stable\(remote\)!==stable\(pending\.base\)/);
 assert.match(js,/bep:offline-conflict/);
 assert.match(js,/await clear\(key\)/);
 const conflict=js.indexOf('if(stable(remote)!==stable(pending.base))');
 const put=js.indexOf('method:"PUT"',conflict);
 assert.ok(conflict>=0&&put>conflict,"remote comparison must happen before any PUT");
});
test("offline startup preserves local data for a previously authenticated user",()=>{
 const js=read("app.js");
 assert.match(js,/window\.BEPOffline\.hasKnownUser\(\)/);
 assert.match(js,/window\.bepOfflineMode=true/);
 assert.match(js,/gate\.hidden=true/);
 assert.match(js,/window\.BEPOffline\.setBaseline\(payload\.payload\|\|\{\}\)/);
});
test("service worker caches app shell and approved local OCR dependencies",()=>{
 for(const file of ["sw.js","dist/sw.js"]){
  const js=read(file);
  assert.match(js,/bep-shell-v10/);
  assert.match(js,/offline-storage\.js/);
  assert.match(js,/cdn\.jsdelivr\.net/);
  assert.match(js,/tessdata\.projectnaptha\.com/);
  assert.match(js,/spend-clean-ui\.js/);
  assert.match(js,/spend-clean-ui\.css/);
  assert.match(js,/ignoreSearch:true/);
  assert.match(js,/caches\.open\(RUNTIME_CACHE\)/);
 }
});
test("receipt parsing uses the local helper and does not upload receipt images",()=>{
 const app=read("app.js"),parser=read("receipt-ocr.js");
 assert.match(parser,/root\.BEPReceiptOCR=api/);
 assert.doesNotMatch(parser,/fetch\(/);
 assert.doesNotMatch(app,/fetch\([^)]*receiptFile/);
});

test("cross-device conflicts offer explicit local or account resolution",()=>{
 const js=read("offline-storage.js"),app=read("app.js");
 for(const file of ["index.html","dist/index.html"]){
  const html=read(file);
  assert.match(html,/id="bepOfflineConflictDialog"/);
  assert.match(html,/id="bepOfflineKeepLocal"/);
  assert.match(html,/id="bepOfflineUseRemote"/);
 }
 assert.match(js,/async function resolveConflict\(choice\)/);
 assert.match(js,/bepOfflineConflictReopen/);
 assert.match(app,/bep:offline-use-remote/);
 assert.equal(app,read("dist/app.js"));
});
