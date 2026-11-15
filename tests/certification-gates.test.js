"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("password recovery uses the configured API base and cannot call production from a preview build",()=>{
 const recovery=read("auth-recovery.js");
 assert.match(recovery,/window\.BEP_API_BASE/,"recovery endpoints must follow the current environment API base");
 assert.doesNotMatch(recovery,/https:\/\/bep-v2-api\.onrender\.com/,"preview password recovery must never be hardwired to production");
});

test("home dashboard exposes and renders the planned savings amount",()=>{
 const html=read("index.html"),app=read("app.js");
 assert.match(html,/id="homeSavingsPlanned"/,"home must expose a savings snapshot element");
 assert.match(app,/homeSavingsPlanned[^\n]{0,300}textContent/,"home render must update the savings snapshot from current state");
});

test("monthly budget history invokes the monthly-to-savings bridge after a confirmed current-month save",()=>{
 const ui=read("monthly-budget-ui.js");
 assert.match(ui,/BEP_APPLY_MONTHLY_ITEMS/,"saving/loading current monthly lines must apply the savings and income bridge to the home state");
});
