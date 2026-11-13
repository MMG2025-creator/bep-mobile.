"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {Pool}=require("pg");
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

test("PostgreSQL row locking serializes simultaneous stale writers",{
 skip:!process.env.TEST_DATABASE_URL
},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const id=crypto.randomUUID();
 const first=await pool.connect(),second=await pool.connect();
 const base={income:0,incomes:[],budgets:[],expenses:[],goals:[]};
 const newer={income:38686,incomes:[{id:"income-1",amount:38686}],budgets:[],expenses:[],goals:[]};
 try{
  await pool.query("CREATE TABLE IF NOT EXISTS bep_offline_sync_test_snapshots(id TEXT PRIMARY KEY,payload JSONB NOT NULL)");
  await pool.query("INSERT INTO bep_offline_sync_test_snapshots(id,payload) VALUES($1,$2::jsonb)",[id,JSON.stringify(base)]);
  await first.query("BEGIN");
  const firstRead=await first.query("SELECT payload FROM bep_offline_sync_test_snapshots WHERE id=$1 FOR UPDATE",[id]);
  assert.deepEqual(firstRead.rows[0].payload,base);
  await second.query("BEGIN");
  let secondResolved=false;
  const secondReadPromise=second.query("SELECT payload FROM bep_offline_sync_test_snapshots WHERE id=$1 FOR UPDATE",[id]).then(result=>{
   secondResolved=true;
   return result.rows[0].payload;
  });
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(secondResolved,false,"the second writer must wait for the first row lock");
  await first.query("UPDATE bep_offline_sync_test_snapshots SET payload=$2::jsonb WHERE id=$1",[id,JSON.stringify(newer)]);
  await first.query("COMMIT");
  const secondSnapshot=await secondReadPromise;
  assert.deepEqual(secondSnapshot,newer);
  assert.notDeepEqual(secondSnapshot,base,"the stale baseline must now be rejected");
  await second.query("ROLLBACK");
 }finally{
  await first.query("ROLLBACK").catch(()=>{});
  await second.query("ROLLBACK").catch(()=>{});
  await pool.query("DELETE FROM bep_offline_sync_test_snapshots WHERE id=$1",[id]).catch(()=>{});
  first.release();second.release();await pool.end();
 }
});

test("atomic API sync preserves validated treasury in the committed payload",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.put("/api/data"');
 const route=server.slice(start,server.indexOf('app.use((req,res)=>',start));
 const treasury=route.indexOf('const rawTreasury=');
 const validation=route.indexOf('error:"INVALID_TREASURY"');
 const safe=route.indexOf('coachProfile,treasury}');
 const commit=route.indexOf('await client.query("COMMIT")');
 assert.ok(treasury>=0&&validation>treasury&&safe>validation&&commit>safe,
  "the API must validate and include treasury before committing the CAS snapshot");
 assert.match(route,/previous\.treasury/);
 assert.match(route,/overdraftLimit,validUntil/);
});
