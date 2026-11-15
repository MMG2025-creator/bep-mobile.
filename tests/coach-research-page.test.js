"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
test("Coach research page is published identically at source and dist",()=>{
 const source=fs.readFileSync(path.join(root,"coach-research.html"),"utf8");
 const dist=fs.readFileSync(path.join(root,"dist","coach-research.html"),"utf8");
 assert.equal(dist,source);
 for(const marker of ["/api/admin/bep-coach/research/status","/api/admin/bep-coach/research","/api/admin/bep-agent/candidates","/review","credentials:\"include\"","Aucune publication automatique","/api/admin/bep-agent/run","jsonAuditButton","Analyse de la base documentaire JSON"])assert.ok(source.includes(marker),marker);
});
test("Coach robot has an explicit click fallback independent of data-goto",()=>{
 for(const file of ["app.js","dist/app.js"]){const source=fs.readFileSync(path.join(root,file),"utf8");assert.ok(source.includes('document.querySelectorAll(".welcome-mascot").forEach(x=>x.addEventListener("click",()=>tab("coach")));'),file)}
});
