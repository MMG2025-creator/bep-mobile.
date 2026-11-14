"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertReadOnlyExporterRole } = require("../lib/bep-exporter-role-check");
function goodResult(overrides = {}) {
 return { rows: [{ role_name:"bep_knowledge_exporter", database_name:"bep", elevated_role:false, database_create:false, database_temp:false,
 relations:[
 {relation_name:"public.bep_financial_knowledge",can_select:true,can_insert:false,can_update:false,can_delete:false,can_truncate:false,can_reference:false,can_trigger:false,relation_kind:'r'},
 {relation_name:"public.bep_agent_approved_knowledge",can_select:true,can_insert:false,can_update:false,can_delete:false,can_truncate:false,can_reference:false,can_trigger:false,relation_kind:'r'}
 ], accessible_sequences:[], writable_schemas:[], ...overrides }] };
}
test("accepts SELECT-only access to exactly the two approved tables",()=>{const r=assertReadOnlyExporterRole(goodResult());assert.equal(r.role_name,"bep_knowledge_exporter");assert.equal(r.allowed_tables.length,2);});
test("rejects elevated role attributes and database CREATE/TEMP privileges",()=>{for(const k of ["elevated_role","database_create"])assert.throws(()=>assertReadOnlyExporterRole(goodResult({[k]:true})));});
test("rejects write privileges on an approved table",()=>{assert.throws(()=>assertReadOnlyExporterRole(goodResult({relations:[{...goodResult().rows[0].relations[0],can_insert:true},goodResult().rows[0].relations[1]]})),/unexpected relation privilege/);});
test("rejects unapproved relations, sequence access, and schema creation",()=>{assert.throws(()=>assertReadOnlyExporterRole(goodResult({relations:[...goodResult().rows[0].relations,{relation_name:"public.bep_knowledge_candidates",can_select:true}]})),/unexpected relation privilege/);assert.throws(()=>assertReadOnlyExporterRole(goodResult({accessible_sequences:[{sequence_name:"public.any_seq"}]})),/sequence privileges/);assert.throws(()=>assertReadOnlyExporterRole(goodResult({writable_schemas:[{nspname:"public"}]})),/create objects/);});
test("rejects a missing approved table SELECT grant",()=>{assert.throws(()=>assertReadOnlyExporterRole(goodResult({relations:[goodResult().rows[0].relations[0]]})),/missing SELECT/);});
