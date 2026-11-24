"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {purgeExpiredActivityRows,startActivityRetentionScheduler,RETENTION_DAYS,CLEANUP_INTERVAL_MS}=require("../lib/bep-activity-retention");

test("activity retention uses a 35-day timestamp cutoff under a PostgreSQL advisory lock",async()=>{
 let released=false;
 const calls=[];
 const client={
  async query(sql,args){calls.push({sql,args});if(sql.includes("pg_try_advisory_lock"))return{rows:[{acquired:true}]};if(sql.startsWith("DELETE FROM bep_user_activity_days"))return{rowCount:7};return{rows:[{pg_advisory_unlock:true}]};},
  release(){released=true;}
 };
 const result=await purgeExpiredActivityRows({connect:async()=>client});
 assert.deepEqual(result,{skipped:false,deleted:7});
 assert.equal(RETENTION_DAYS,35);
 assert.match(calls[1].sql,/last_activity_at < NOW\(\) - \(\$1::text \|\| ' days'\)::interval/);
 assert.deepEqual(calls[1].args,["35"]);
 assert.match(calls[0].sql,/pg_try_advisory_lock/);
 assert.match(calls[2].sql,/pg_advisory_unlock/);
 assert.equal(released,true);
});

test("a worker that cannot acquire the advisory lock skips cleanup and releases its connection",async()=>{
 let released=false,deleteCalled=false;
 const client={async query(sql){if(sql.includes("pg_try_advisory_lock"))return{rows:[{acquired:false}]};if(sql.startsWith("DELETE"))deleteCalled=true;return{rows:[]};},release(){released=true;}};
 const result=await purgeExpiredActivityRows({connect:async()=>client});
 assert.deepEqual(result,{skipped:true,deleted:0});
 assert.equal(deleteCalled,false);
 assert.equal(released,true);
});

test("scheduled cleanup runs immediately, repeats every six hours and does not keep Node alive",()=>{
 let callback,unrefCalled=false,interval;
 const timer={unref(){unrefCalled=true;}};
 const pool={connect:async()=>({query:async sql=>sql.includes("pg_try_advisory_lock")?{rows:[{acquired:false}]}:{rows:[]},release(){}})};
 const scheduled=startActivityRetentionScheduler(pool,{setIntervalFn(fn,ms){callback=fn;interval=ms;return timer;},logger:{info(){},warn(){}}});
 assert.equal(scheduled,timer);
 assert.equal(interval,CLEANUP_INTERVAL_MS);
 assert.equal(interval,6*60*60*1000);
 assert.equal(unrefCalled,true);
 assert.equal(typeof callback,"function");
});
