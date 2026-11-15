"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("password recovery uses the configured API base and cannot call production from a preview build",()=>{
 const recovery=read("auth-recovery.js"),publishedRecovery=read("dist/auth-recovery.js");
 for(const source of [recovery,publishedRecovery]){
  assert.match(source,/window\.BEP_API_BASE/,"source and published recovery endpoints must follow the current environment API base");
  assert.doesNotMatch(source,/https:\/\/bep-v2-api\.onrender\.com/,"source and published preview recovery must never be hardwired to production");
 }
});

test("published home dashboard exposes and renders the planned savings amount",()=>{
 const html=read("dist/index.html"),app=read("dist/app.js");
 assert.match(html,/id="homeSavingsPlanned"/,"published home must expose a savings snapshot element");
 assert.match(app,/homeSavingsPlanned[^\n]{0,300}textContent/,"published home render must update the savings snapshot from current state");
});

test("monthly budget history invokes the monthly-to-savings bridge after a confirmed current-month save",()=>{
 const ui=read("monthly-budget-ui.js");
 assert.match(ui,/BEP_APPLY_MONTHLY_ITEMS/,"saving/loading current monthly lines must apply the savings and income bridge to the home state");
});
test("source and published runtime configuration isolate preview API traffic",()=>{
 const vm=require("node:vm");
 for(const file of ["runtime-config.js","dist/runtime-config.js"]){
  const runtime=read(file);
  const preview={window:{location:{hostname:"bep-preview.onrender.com",origin:"https://bep-preview.onrender.com"}}};
  vm.runInNewContext(runtime,preview);
  assert.equal(preview.window.BEP_API_BASE,"https://bep-preview.onrender.com",file+" must keep preview traffic off production");
  const production={window:{location:{hostname:"bep-mobile.onrender.com",origin:"https://bep-mobile.onrender.com"}}};
  vm.runInNewContext(runtime,production);
  assert.equal(production.window.BEP_API_BASE,"https://bep-v2-api.onrender.com",file+" must retain the production API on the production host");
 }
});
test("published home and entrypoint load the corrected savings and recovery assets",()=>{
 const html=read("dist/index.html");
 assert.match(html,/id="homeSavingsPlanned"/,"published home must expose the planned savings amount");
 assert.match(html,/offline-storage\.js\?v=7/,"published entrypoint must load the guarded offline runtime");
 assert.match(html,/app\.js\?v=118/,"published entrypoint must load the savings renderer");
 assert.match(html,/auth-recovery\.js\?v=3/,"published entrypoint must load environment-aware recovery");
 assert.match(html,/monthly-budget-ui\.js\?v=14/,"published entrypoint must load the current-month bridge");
});
