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


const {runProbe}=require("../scripts/check-db-role");

function captureLogger(){
 const lines=[];
 return {lines,logger:{log:(line)=>lines.push(line)}};
}

test("CLI rejects unknown components without constructing a pool",async()=>{
 const {lines,logger}=captureLogger();let constructed=false;
 const code=await runProbe({component:"other",env:{},PoolCtor:class{constructor(){constructed=true}},logger});
 assert.equal(code,2);assert.equal(constructed,false);
 assert.match(lines[0],/"reason":"INVALID_COMPONENT"/);
});

test("CLI reports a missing variable without constructing a pool",async()=>{
 const {lines,logger}=captureLogger();let constructed=false;
 const code=await runProbe({component:"worker",env:{},PoolCtor:class{constructor(){constructed=true}},logger});
 assert.equal(code,3);assert.equal(constructed,false);
 assert.match(lines[0],/"variable_present":false/);
 assert.match(lines[0],/"reason":"VARIABLE_MISSING"/);
});

test("CLI queries only current_user and enforces certificate verification",async()=>{
 const {lines,logger}=captureLogger();let options,sql,ended=false;
 class FakePool{
  constructor(value){options=value}
  async query(value){sql=value;return {rows:[{postgres_role:"bep_runtime"}]}}
  async end(){ended=true}
 }
 const code=await runProbe({component:"api",env:{DATABASE_URL:"DO_NOT_PRINT"},PoolCtor:FakePool,logger});
 assert.equal(code,0);assert.equal(sql,"SELECT current_user AS postgres_role");
 assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(ended,true);
 assert.match(lines[0],/"postgres_role":"bep_runtime"/);
 assert.doesNotMatch(lines[0],/DO_NOT_PRINT/);
});

test("CLI suppresses database errors and closes the pool",async()=>{
 const {lines,logger}=captureLogger();let ended=false;
 class FakePool{
  constructor(){}
  async query(){throw new Error("PRIVATE_CONNECTION_STRING")}
  async end(){ended=true}
 }
 const code=await runProbe({component:"worker",env:{BEP_AGENT_DATABASE_URL:"DO_NOT_PRINT"},PoolCtor:FakePool,logger});
 assert.equal(code,5);assert.equal(ended,true);
 assert.match(lines[0],/"reason":"DATABASE_CONNECTION_FAILED"/);
 assert.doesNotMatch(lines[0],/PRIVATE_CONNECTION_STRING|DO_NOT_PRINT/);
});

test("CLI reports an empty role as unsuccessful",async()=>{
 const {lines,logger}=captureLogger();
 class FakePool{constructor(){} async query(){return {rows:[]}} async end(){}}
 const code=await runProbe({component:"api",env:{DATABASE_URL:"DO_NOT_PRINT"},PoolCtor:FakePool,logger});
 assert.equal(code,4);assert.match(lines[0],/"reason":"ROLE_NOT_RETURNED"/);
});
