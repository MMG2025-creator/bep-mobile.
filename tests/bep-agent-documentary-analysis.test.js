"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {analyzeDocumentaryLibrary,findDuplicateCandidates,similarity,ANALYSIS_SCHEMA}=require("../lib/bep-agent/documentary-analysis");

test("duplicate detector uses deterministic token overlap",()=>{
 assert.ok(similarity("Épargne de précaution et budget","budget épargne de précaution")>0.5);
 const matches=findDuplicateCandidates({title:"Constituer une épargne de précaution",content:"Mettre de côté une réserve"},[
  {slug:"emergency-savings",title:"Constituer une épargne de précaution",content:"Mettre de côté une réserve"}
 ]);
 assert.equal(matches[0].slug,"emergency-savings");
 assert.ok(matches[0].similarity>=0.82);
});

test("Groq documentary analysis stores only cited, validated proposals as pending",async()=>{
 const inserts=[];
 const base={slug:"budget-basics",category:"budget",title:"Construire un budget",content:"Une méthode de budget existante avec des principes généraux.".repeat(4),source_name:"Mes questions d'argent",source_url:"https://mesquestionsdargent.fr/budget",evidence_level:"institutional_reference",version:2};
 const pool={query:async(sql,params)=>{
  if(sql.includes("FROM bep_financial_knowledge"))return{rows:[base]};
  if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};
  inserts.push({sql,params});
  if(sql.includes("INSERT INTO bep_knowledge_candidates"))return{rowCount:1,rows:[{id:17}]};
  return{rowCount:1,rows:[]};
 }};
 const source={title:"Mes questions d'argent",url:"https://mesquestionsdargent.fr/epargne",domain:"mesquestionsdargent.fr",publishedAt:"2026-10-01T00:00:00.000Z",highlights:["Constituer une épargne de précaution permet de faire face aux dépenses imprévues."]};
 let schemaSeen;
 const client={generateJson:async(args)=>{schemaSeen=args.jsonSchema;return{value:{findings:[{kind:"coverage_gap",target_slug:"",summary:"L'épargne de précaution est peu couverte",reason:"La source apporte un point utile.",source_urls:[source.url],confidence:"high"}],proposals:[{proposal_type:"create",target_slug:"",category:"savings",title:"Constituer une épargne de précaution",content:"Une épargne de précaution permet de faire face aux dépenses imprévues sans recourir immédiatement au crédit. Elle doit être adaptée aux charges et à la stabilité des revenus. Le montant cible dépend de la situation et doit être réévalué régulièrement.",source_url:source.url,confidence:"high",rationale:"La source institutionnelle décrit les objectifs de cette réserve.",keywords:["épargne","précaution"],evidence_urls:[source.url]}]},usage:{total_tokens:90}}}};
 const result=await analyzeDocumentaryLibrary({pool,client,query:"épargne de précaution",searchResults:[source],model:"openai/gpt-oss-20b"});
 assert.equal(schemaSeen,ANALYSIS_SCHEMA);
 assert.equal(result.provider,"groq");
 assert.equal(result.proposals.length,1);
 assert.equal(result.proposals[0].status,"pending_review");
 assert.equal(inserts.filter(x=>x.sql.includes("INSERT INTO bep_knowledge_candidates")).length,1);
 const candidate=inserts.find(x=>x.sql.includes("INSERT INTO bep_knowledge_candidates"));
 assert.match(candidate.sql,/'create'/);
 assert.equal(candidate.params[5],"https://mesquestionsdargent.fr/epargne");
 assert.match(candidate.sql,/'pending'/);
 assert.equal(result.automaticPublication,false);
});

test("unsupported external evidence is rejected before a candidate can be stored",async()=>{
 let candidateWrites=0;
 const pool={query:async(sql)=>{if(sql.includes("FROM bep_financial_knowledge"))return{rows:[]};if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};if(sql.includes("INSERT INTO bep_knowledge_candidates"))candidateWrites++;return{rowCount:1,rows:[]}}};
 const client={generateJson:async()=>({value:{findings:[],proposals:[{proposal_type:"create",target_slug:"",category:"budget",title:"Fiche non sourcée",content:"Contenu suffisamment long pour dépasser la limite minimale de validation et constituer une proposition documentaire candidate.",source_url:"https://example.org/fake",confidence:"high",rationale:"Aucune preuve.",keywords:[],evidence_urls:["https://example.org/fake"]}]}})};
 const result=await analyzeDocumentaryLibrary({pool,client,query:"budget",searchResults:[{title:"Un site",url:"https://mesquestionsdargent.fr/source",domain:"mesquestionsdargent.fr",highlights:["Extrait"]}]});
 assert.equal(candidateWrites,0);
 assert.equal(result.proposals.length,0);
});
