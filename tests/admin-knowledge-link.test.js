"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
test("Coach knowledge link is only rendered in the admin settings area",()=>{
 for(const file of ["index.html","dist/index.html"]){
  const html=fs.readFileSync(path.join(root,file),"utf8");
  assert.ok(!html.includes('style="margin:12px 0 0"><a href="./coach-research.html">'),file+" public Coach link removed");
  assert.ok(html.includes('id="adminKnowledgeAccess" hidden'),file+" admin-only card hidden by default");
 }
});
test("Coach knowledge link is revealed only after server-side admin authorization",()=>{
 for(const file of ["app.js","dist/app.js"]){
  const js=fs.readFileSync(path.join(root,file),"utf8");
  assert.ok(js.includes('fetch(API+"/api/admin/bep-agent/overview"'),file);
  assert.ok(js.includes('card.hidden=!response.ok'),file);
  assert.ok(js.includes('if(!card||!window.bepSignedIn||window.bepOfflineMode)return'),file);
 }
});
