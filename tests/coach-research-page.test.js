"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
test("Coach research functionality is integrated into the existing admin console",()=>{const html=fs.readFileSync(path.join(root,"dist","admin.html"),"utf8");for(const marker of ["/api/admin/bep-coach/research/status","/api/admin/bep-coach/research","/api/admin/bep-agent/candidates","/review","credentials:\"include\"","Aucune publication automatique","/api/admin/bep-agent/run","crJsonAuditButton","Analyse de la base documentaire JSON","Bibliothèque documentaire validée","crUsageSummary","Consommation Gemini — mois en cours","averageDailyGroundingQueries","projectedMonthlyGroundingQueries","crLibraryQuery","crLibraryCategory","crLibraryList","crLibraryRefresh","/api/admin/bep-coach/library"])assert.ok(html.includes(marker),marker)});
test("Legacy Coach research page redirects to the admin console",()=>{const source=fs.readFileSync(path.join(root,"coach-research.html"),"utf8"),dist=fs.readFileSync(path.join(root,"dist","coach-research.html"),"utf8");assert.equal(dist,source);assert.ok(source.includes("/admin.html#coach-research"))});
test("Coach robot keeps its explicit click fallback independent of data-goto",()=>{for(const file of ["app.js","dist/app.js"]){const source=fs.readFileSync(path.join(root,file),"utf8");assert.ok(source.includes('document.querySelectorAll(".welcome-mascot").forEach(x=>x.addEventListener("click",()=>tab("coach")));'),file)}});

test("Admin library endpoint is protected and read-only",()=>{const server=fs.readFileSync(path.join(root,"server.js"),"utf8");assert.ok(server.includes('app.get("/api/admin/bep-coach/library",auth,requireBepAgentAdmin'));assert.ok(server.includes('readOnly:true'));assert.ok(server.includes('sourceFingerprint(source)!==item.source_digest'));assert.ok(!server.includes('app.post("/api/admin/bep-coach/library'))});

test("monthly Gemini budget is exposed only through the authenticated admin status endpoint",()=>{const server=fs.readFileSync(path.join(root,"server.js"),"utf8");assert.ok(server.includes('app.get("/api/admin/bep-coach/research/status",auth,requireBepAgentAdmin,async'));assert.ok(server.includes('model:RESEARCH_CONFIG.default_model'));assert.ok(server.includes('usage})'));});
