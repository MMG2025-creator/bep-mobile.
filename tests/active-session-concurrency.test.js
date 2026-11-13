"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
const guard=server.slice(server.indexOf('app.use("/api",async(req,res,next)=>{'),server.indexOf("\nfunction auth(",server.indexOf('app.use("/api",async(req,res,next)=>{')));

test("authenticated requests register an atomic lease only for the current, non-expired session",()=>{
 assert.match(guard,/WITH active AS \(SELECT user_id FROM bep_active_sessions WHERE user_id=\$1 AND session_id=\$2 AND updated_at>NOW\(\)-INTERVAL '15 minutes' FOR UPDATE\) INSERT INTO bep_active_session_requests/);
 assert.match(guard,/if\(!lease\.rowCount\)/);
 assert.match(guard,/res\.once\("finish",releaseLease\)/);
 assert.match(guard,/res\.once\("close",\(\)=>\{if\(res\.writableFinished\)releaseLease\(\)\}\)/);
 assert.match(guard,/DELETE FROM bep_active_session_requests WHERE request_id=\$1/);
 assert.doesNotMatch(guard,/SET updated_at=NOW\(\)/);
});

test("session takeover cannot replace a session while a live request lease exists",()=>{
 assert.match(server,/CREATE TABLE IF NOT EXISTS bep_active_session_requests\(request_id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bep_users\(id\) ON DELETE CASCADE,session_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL\)/);
 assert.match(server,/WHERE bep_active_sessions\.updated_at<=NOW\(\)-INTERVAL '15 minutes' AND NOT EXISTS\(SELECT 1 FROM bep_active_session_requests r WHERE r\.user_id=bep_active_sessions\.user_id AND r\.expires_at>NOW\(\)\) RETURNING session_id/);
});
