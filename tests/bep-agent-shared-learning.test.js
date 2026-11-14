"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSharedKnowledge,runKnowledgeReview,sourceFingerprint}=require("../lib/bep-agent/worker");

const base={slug:"budget-baseline",category:"budget",title:"Budget de référence",content:"Distinguer les charges fixes et variables.",keywords:["budget"],source_name:"Banque de France",source_url:"https://www.mesquestionsdargent.fr/",evidence_level:"institutional_guidance",version:3};
function overlay(source,patch={}){
 return{slug:source.slug,category:source.category,title:"Budget approuvé",content:"Version approuvée : distinguer prévu et réalisé.",keywords:["budget","prévision"],source_name:source.source_name,source_url:source.source_url,evidence_level:source.evidence_level,source_version:source.version,source_digest:sourceFingerprint(source),version:2,active:true,...patch};
}
function poolFor(baseRows,overlayRows){
 const statements=[];
 return{statements,async query(sql,params){
  statements.push(sql);
  if(sql.includes("FROM bep_financial_knowledge"))return{rows:baseRows};
  if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:overlayRows};
  if(sql.includes("INSERT INTO bep_knowledge_candidates"))return{rows:[],rowCount:0};
  throw new Error("Unexpected SQL: "+sql);
 }};
}

test("Gemini knowledge review merges only approved overlays whose source version and digest still match",async()=>{
 const good=overlay(base);
 const staleVersion=overlay({...base,slug:"stale-version"},{slug:"stale-version",source_version:2});
 const staleDigest=overlay(base,{slug:"stale-digest",source_digest:"invalid"});
 const inactiveSource={...base,slug:"inactive"};\n const inactive=overlay(inactiveSource,{active:false});
 const pool=poolFor([base,{...base,slug:"stale-version"},{...base,slug:"stale-digest"},{...base,slug:"inactive"}],[good,staleVersion,staleDigest,inactive]);
 const result=await loadSharedKnowledge(pool);
 const bySlug=new Map(result.docs.map(x=>[x.slug,x]));
 assert.equal(bySlug.get("budget-baseline").content,good.content);
 assert.equal(bySlug.get("budget-baseline").approved_overlay,true);
 assert.equal(bySlug.get("stale-version").content,base.content);
 assert.equal(bySlug.get("stale-digest").content,base.content);
 assert.equal(bySlug.has("inactive"),false);
 assert.deepEqual(result.stats,{baseDocuments:4,acceptedOverlays:1,staleOverlays:2});
});

test("knowledge review sends only shared reference knowledge and approved overlays to Gemini",async()=>{
 const good=overlay(base);
 const pool=poolFor([base],[good]);
 let prompt="";
 const client={async generateJson(args){prompt=args.prompt;return{value:{proposals:[]},usage:null}}};
 const result=await runKnowledgeReview({pool,client,model:"test-model"});
 assert.match(prompt,/Version approuvée/);
 assert.doesNotMatch(prompt,/Données personnelles fictives|conversation privée|bep_user_coach_knowledge/);
 assert.match(prompt,/N'inclus aucune donnée personnelle/);
 assert.equal(result.summary.acceptedOverlays,1);
 assert.equal(result.summary.readOnlyKnowledgeSources,true);
 assert.equal(pool.statements.some(sql=>/bep_knowledge_candidates\s+WHERE/i.test(sql)),false);
 assert.equal(pool.statements.some(sql=>/bep_user_coach_knowledge|bep_user_data/i.test(sql)),false);
 assert.equal(pool.statements.some(sql=>/FROM bep_knowledge_candidates/i.test(sql)),false);
});

test("pending knowledge candidates and personal Coach knowledge are never queried",async()=>{
 const pool=poolFor([base],[]);
 const client={async generateJson(){return{value:{proposals:[]},usage:null}}};
 await runKnowledgeReview({pool,client});
 for(const sql of pool.statements){
  assert.doesNotMatch(sql,/bep_knowledge_candidates|bep_user_coach_knowledge|bep_user_data/);
 }
});

test("Gemini suggestions remain pending candidates and do not write to approved knowledge",async()=>{
 const pool=poolFor([base],[overlay(base)]);
 let prompt="";
 const client={async generateJson(args){prompt=args.prompt;return{value:{proposals:[{source_slug:base.slug,proposal_type:"clarify",title:"Clarifier",content:"Préciser la règle.",source_name:base.source_name,source_url:base.source_url,confidence:"high",rationale:"Formulation ambiguë."}]},usage:null}}};
 const result=await runKnowledgeReview({pool,client});
 const insert=pool.statements.find(sql=>sql.includes("INSERT INTO bep_knowledge_candidates"));
 assert.ok(insert);
 assert.doesNotMatch(pool.statements.join("\n"),/INSERT INTO bep_agent_approved_knowledge|UPDATE bep_agent_approved_knowledge/);
 assert.equal(result.candidatesCreated,0);
});
