"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("activity telemetry stores one pseudonymous user/day row and cascades on account deletion",()=>{
 const server=read("server.js");
 assert.match(server,/CREATE TABLE IF NOT EXISTS bep_user_activity_days\(user_id TEXT NOT NULL REFERENCES bep_users\(id\) ON DELETE CASCADE,activity_day DATE NOT NULL,last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\),PRIMARY KEY\(user_id,activity_day\)\)/);
 assert.match(server,/ON CONFLICT\(user_id,activity_day\) DO UPDATE SET last_activity_at=GREATEST/);
 assert.match(server,/activity_day < \(NOW\(\) AT TIME ZONE 'UTC'\)::date - 400/);
});

test("only successful authenticated product data reads and writes record activity",()=>{
 const server=read("server.js");
 const getStart=server.indexOf('app.get("/api/data",auth');
 const putStart=server.indexOf('app.put("/api/data",auth');
 const notFound=server.indexOf('app.use((req,res)=>res.status(404)',putStart);
 const getRoute=server.slice(getStart,putStart);
 const putRoute=server.slice(putStart,notFound);
 assert.match(getRoute,/await recordUserActivity\(req\.session\.user\.id\)/);
 assert.ok(getRoute.indexOf("await pool.query")<getRoute.indexOf("await recordUserActivity"));
 assert.match(putRoute,/await client\.query\("COMMIT"\);\s*await recordUserActivity/);
 assert.match(server,/function auth\(req,res,next\).*AUTH_REQUIRED/);
 assert.match(server,/async function recordUserActivity\(userId\)\{[\s\S]*?catch\(error\)\{console\.warn\("BEP activity telemetry write skipped"/);
 assert.doesNotMatch(server.slice(server.indexOf("async function recordUserActivity"),server.indexOf("const requireBepAgentAdmin")),/req\.ip|user-agent|email|payload/);
});

test("activity metrics are independently admin-protected, UTC-based, deduplicated and cache-disabled",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.get("/api/admin/dashboard/activity"');
 const end=server.indexOf('app.put("/api/data"',start);
 const route=server.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(route,/auth,requireBepAgentAdmin/);
 assert.match(route,/COUNT\(DISTINCT user_id\) FILTER \(WHERE activity_day=\(NOW\(\) AT TIME ZONE 'UTC'\)::date\)/);
 assert.match(route,/activity_day >= \(NOW\(\) AT TIME ZONE 'UTC'\)::date-6/);
 assert.match(route,/activity_day >= \(NOW\(\) AT TIME ZONE 'UTC'\)::date-29/);
 assert.match(route,/Cache-Control","no-store/);
 assert.match(route,/window:"UTC calendar days"/);
 assert.match(route,/ACTIVITY_METRICS_UNAVAILABLE/);
});

test("telemetry never exposes account identifiers or financial payloads in the metrics response",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.get("/api/admin/dashboard/activity"');
 const end=server.indexOf('app.put("/api/data"',start);
 const route=server.slice(start,end);
 const responseBody=route.slice(route.indexOf("res.json("),route.indexOf(");",route.indexOf("res.json(")));
 assert.match(responseBody,/res\\.json\\(\\{dau:result\\.rows\\[0\\]\\.dau,wau:result\\.rows\\[0\\]\\.wau,mau:result\\.rows\\[0\\]\\.mau/);
 assert.doesNotMatch(responseBody,/email|userId|user_id|payload|income|expenses|ip|userAgent/i);
});
