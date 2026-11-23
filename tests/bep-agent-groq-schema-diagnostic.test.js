"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateProbeValue,runGroqSchemaDiagnostic}=require("../lib/bep-agent/groq-schema-diagnostic");
test("diagnostic accepts only the exact empty analysis payload",()=>{
 assert.equal(validateProbeValue({findings:[],proposals:[]}),true);
 assert.equal(validateProbeValue({findings:[],proposals:[],extra:true}),false);
 assert.equal(validateProbeValue({findings:[{}],proposals:[]}),false);
 assert.equal(validateProbeValue({findings:[],proposals:{}}),false);
});
test("diagnostic calls Groq with the actual strict analysis schema and performs no DB access",async()=>{
 let captured;
 const result=await runGroqSchemaDiagnostic({apiKey:"test-key",clientFactory:()=>({generateJson:async args=>{captured=args;return {value:{findings:[],proposals:[]},usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16}}}})});
 assert.equal(result.success,true);assert.equal(result.httpStatus,200);assert.equal(result.model,"openai/gpt-oss-20b");
 assert.equal(captured.jsonSchema.name,"bep_documentary_library_analysis");assert.equal(captured.jsonSchema.schema.additionalProperties,false);
 assert.equal(result.databaseAccess,false);assert.equal(result.libraryWrites,false);
});
test("missing key prevents provider invocation",async()=>{
 const result=await runGroqSchemaDiagnostic({apiKey:"",clientFactory:()=>{throw new Error("must not be called")}});
 assert.equal(result.success,false);assert.equal(result.code,"GROQ_KEY_NOT_CONFIGURED");assert.equal(result.databaseAccess,false);
});
