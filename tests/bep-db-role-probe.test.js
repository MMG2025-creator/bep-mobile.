"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {reportPostgresRole}=require("../lib/bep-db-role-probe");

function withEnv(name,value,fn){
 const previous=process.env[name];
 if(value===undefined)delete process.env[name];else process.env[name]=value;
 return Promise.resolve().then(fn).finally(()=>{
  if(previous===undefined)delete process.env[name];else process.env[name]=previous;
 });
}

test("reports missing variable without querying the pool",async()=>{
 await withEnv("DATABASE_URL",undefined,async()=>{
  let queried=false;const logs=[];
  await reportPostgresRole({pool:{query:async()=>{queried=true}},component:"api",variable:"DATABASE_URL",logger:{info:(...args)=>logs.push(args)}});
  assert.equal(queried,false);
  assert.match(logs[0][1],/"variable_present":false/);
  assert.match(logs[0][1],/"reason":"VARIABLE_MISSING"/);
 });
});

test("reports only current_user for a successful connection",async()=>{
 await withEnv("DATABASE_URL","configured",async()=>{
  const logs=[];
  await reportPostgresRole({pool:{query:async sql=>{assert.equal(sql,"SELECT current_user AS postgres_role");return {rows:[{postgres_role:"bep_runtime"}]}}},component:"api",variable:"DATABASE_URL",sharedWith:["integrated-agent"],logger:{info:(...args)=>logs.push(args)}});
  assert.match(logs[0][1],/"postgres_role":"bep_runtime"/);
  assert.match(logs[0][1],/"shared_with":\["integrated-agent"\]/);
  assert.doesNotMatch(logs[0][1],/configured/);
 });
});

test("suppresses database driver errors",async()=>{
 await withEnv("BEP_AGENT_DATABASE_URL","configured",async()=>{
  const logs=[];
  await reportPostgresRole({pool:{query:async()=>{throw new Error("secret connection details")}},component:"worker",variable:"BEP_AGENT_DATABASE_URL",logger:{info:(...args)=>logs.push(args)}});
  assert.match(logs[0][1],/"reason":"DATABASE_CONNECTION_FAILED"/);
  assert.doesNotMatch(logs[0][1],/secret connection details|configured/);
 });
});
