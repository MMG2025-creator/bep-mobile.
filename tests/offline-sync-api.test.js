"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
test("offline sync writes validate the baseline inside the same database transaction",()=>{
 const routeStart=server.indexOf('app.put("/api/data"');
 assert.ok(routeStart>=0,"data PUT route exists");
 const route=server.slice(routeStart,routeStart+14000);
 const begin=route.indexOf('await client.query("BEGIN")');
 const lock=route.indexOf('SELECT payload FROM bep_user_data WHERE user_id=$1 FOR UPDATE');
 const compare=route.indexOf('canonical(previous)!==canonical(base)');
 const reject=route.indexOf('res.status(409).json({error:"OFFLINE_CONFLICT"})');
 const update=route.indexOf('UPDATE bep_user_data');
 assert.ok(begin>=0&&lock>begin&&compare>lock&&reject>compare&&update>reject,
  "the locked current snapshot must be compared before any database update");
 assert.match(route,/__bepOfflineSync===true/);
 assert.match(route,/req\.body\?\.payload/);
});
test("legacy direct data writes remain supported beside the offline envelope",()=>{
 const route=server.slice(server.indexOf('app.put("/api/data"'),server.indexOf('app.put("/api/data"')+1200);
 assert.match(route,/const p=offlineSync\?req\.body\?\.payload:req\.body/);
});
