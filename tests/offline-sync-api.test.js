"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("data writes compare the submitted baseline while holding the user row lock",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.put("/api/data"');
 assert.ok(start>=0,"data PUT route exists");
 const route=server.slice(start,server.indexOf('app.use((req,res)=>',start));
 const begin=route.indexOf('await client.query("BEGIN")');
 const lock=route.indexOf('SELECT payload FROM bep_user_data WHERE user_id=$1 FOR UPDATE');
 const compare=route.indexOf('canonical(previous)!==canonical(base)');
 const conflict=route.indexOf('res.status(409).json({error:"OFFLINE_CONFLICT"})');
 const update=route.indexOf('INSERT INTO bep_user_data(user_id,payload)');
 assert.ok(begin>=0&&lock>begin&&compare>lock&&conflict>compare&&update>conflict,
  "the current snapshot must be locked and compared before any write");
 assert.match(route,/__bepOfflineSync===true/);
 assert.match(route,/req\.body\?\.base/);
 assert.match(route,/req\.body\?\.payload/);
});

test("legacy writes cannot replace an already populated financial snapshot",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.put("/api/data"');
 const route=server.slice(start,server.indexOf('app.use((req,res)=>',start));
 const legacyGuard=route.indexOf('if(hasFinancialData||hasOtherData||hasProfile)');
 const conflict=route.indexOf('OFFLINE_SYNC_REQUIRED');
 const update=route.indexOf('INSERT INTO bep_user_data(user_id,payload)');
 assert.ok(legacyGuard>=0&&conflict>legacyGuard&&update>conflict,
  "legacy clients may initialize an empty account but cannot overwrite populated data");
});

test("successful atomic sync returns the exact normalized snapshot committed",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.put("/api/data"');
 const route=server.slice(start,server.indexOf('app.use((req,res)=>',start));
 const commit=route.indexOf('await client.query("COMMIT")');
 const response=route.indexOf('res.json({ok:true,updatedAt:new Date().toISOString(),payload:safe})');
 assert.ok(commit>=0&&response>commit,"the client baseline must be the committed server snapshot");
});

test("client submits the baseline and preserves pending changes on a conflict",()=>{
 const offline=read("offline-storage.js");
 assert.match(offline,/__bepOfflineSync:true,base:pending\.base,payload:pending\.payload/);
 assert.match(offline,/savedData\.payload&&typeof savedData\.payload==="object"/);
 const conflict=offline.indexOf('if(saved.status===409)');
 const clear=offline.indexOf('await clear(queueKey())');
 assert.ok(conflict>=0&&clear>conflict,"a 409 conflict must leave the pending local snapshot intact");
 assert.match(offline,/bep:offline-conflict/);
});

test("published offline sync runtime is identical to the tested source",()=>{
 assert.equal(read("offline-storage.js"),read("dist/offline-storage.js"));
});
