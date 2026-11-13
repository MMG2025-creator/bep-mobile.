"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {Pool}=require("pg");
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
const guard=server.slice(server.indexOf('app.use("/api",async(req,res,next)=>{'),server.indexOf("\nfunction auth(",server.indexOf('app.use("/api",async(req,res,next)=>{')));

test("authenticated API requests create a bounded lease and release it only after response completion",()=>{
 assert.match(guard,/WITH active AS \(SELECT user_id FROM bep_active_sessions WHERE user_id=\$1 AND session_id=\$2 AND updated_at>NOW\(\)-INTERVAL '15 minutes' FOR UPDATE\) INSERT INTO bep_active_session_requests/);
 assert.match(guard,/res\.once\("finish",releaseLease\)/);
 assert.match(guard,/res\.once\("close",\(\)=>\{if\(res\.writableFinished\)releaseLease\(\)\}\)/);
 assert.match(guard,/DELETE FROM bep_active_session_requests WHERE request_id=\$1/);
 assert.match(server,/AND NOT EXISTS\(SELECT 1 FROM bep_active_session_requests r WHERE r\.user_id=bep_active_sessions\.user_id AND r\.expires_at>NOW\(\)\)/);
});

test("PostgreSQL serializes an in-flight request against a concurrent session takeover",{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:4});
 const suffix=crypto.randomUUID().replace(/-/g,"");
 const sessions="bep_test_sessions_"+suffix;
 const requests="bep_test_requests_"+suffix;
 const c1=await pool.connect(),c2=await pool.connect();
 try{
  await pool.query("CREATE TABLE "+sessions+"(user_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL)");
  await pool.query("CREATE TABLE "+requests+"(request_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)");
  await pool.query("INSERT INTO "+sessions+"(user_id,session_id,updated_at) VALUES('user-1','device-A',NOW()-INTERVAL '14 minutes')");
  await c1.query("BEGIN");
  const lease=await c1.query("WITH active AS (SELECT user_id FROM "+sessions+" WHERE user_id=$1 AND session_id=$2 AND updated_at>NOW()-INTERVAL '15 minutes' FOR UPDATE) INSERT INTO "+requests+"(request_id,user_id,session_id,expires_at) SELECT $3,user_id,$2,NOW()+INTERVAL '15 minutes' FROM active RETURNING request_id",["user-1","device-A","request-1"]);
  assert.equal(lease.rowCount,1);
  await c1.query("UPDATE "+sessions+" SET updated_at=NOW()-INTERVAL '16 minutes' WHERE user_id='user-1'");
  const takeoverPromise=c2.query("INSERT INTO "+sessions+"(user_id,session_id,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,updated_at=NOW() WHERE "+sessions+".updated_at<=NOW()-INTERVAL '15 minutes' AND NOT EXISTS(SELECT 1 FROM "+requests+" r WHERE r.user_id="+sessions+".user_id AND r.expires_at>NOW()) RETURNING session_id",["user-1","device-B"]);
  await c1.query("COMMIT");
  const blocked=await takeoverPromise;
  assert.equal(blocked.rowCount,0,"takeover must wait for the request lease and then be refused");
  await c2.query("DELETE FROM "+requests+" WHERE request_id='request-1'");
  const allowed=await c2.query("INSERT INTO "+sessions+"(user_id,session_id,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,updated_at=NOW() WHERE "+sessions+".updated_at<=NOW()-INTERVAL '15 minutes' AND NOT EXISTS(SELECT 1 FROM "+requests+" r WHERE r.user_id="+sessions+".user_id AND r.expires_at>NOW()) RETURNING session_id",["user-1","device-B"]);
  assert.equal(allowed.rowCount,1,"takeover is allowed once the in-flight request lease is released");
 }finally{
  await c1.query("ROLLBACK").catch(()=>{});
  c1.release();c2.release();
  await pool.query("DROP TABLE IF EXISTS "+requests).catch(()=>{});
  await pool.query("DROP TABLE IF EXISTS "+sessions).catch(()=>{});
  await pool.end();
 }
});
