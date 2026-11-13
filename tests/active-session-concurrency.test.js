"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");

test("authenticated API requests atomically renew only the current, non-expired session",()=>{
 const guard=server.slice(server.indexOf('app.use("/api",async(req,res,next)=>{'),server.indexOf("\nfunction auth(",server.indexOf('app.use("/api",async(req,res,next)=>{')));
 assert.match(guard,/UPDATE bep_active_sessions SET updated_at=NOW\(\) WHERE user_id=\$1 AND session_id=\$2 AND updated_at>NOW\(\)-INTERVAL '15 minutes' RETURNING session_id/);
 assert.match(guard,/if\(!active\.rowCount\)/);
 assert.doesNotMatch(guard,/SELECT session_id,updated_at FROM bep_active_sessions/);
});

test("session takeover and request renewal are serialized by conditional PostgreSQL writes",()=>{
 assert.match(server,/INSERT INTO bep_active_sessions\(user_id,session_id,updated_at\) VALUES\(\$1,\$2,NOW\(\)\) ON CONFLICT\(user_id\) DO UPDATE SET session_id=EXCLUDED\.session_id,updated_at=NOW\(\) WHERE bep_active_sessions\.updated_at<=NOW\(\)-INTERVAL '15 minutes' RETURNING session_id/);
 assert.match(server,/UPDATE bep_active_sessions SET updated_at=NOW\(\) WHERE user_id=\$1 AND session_id=\$2 AND updated_at>NOW\(\)-INTERVAL '15 minutes' RETURNING session_id/);
});
