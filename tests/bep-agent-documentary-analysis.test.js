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
 const source={title:"Mes questions d'argent",url:"https://mesquestionsdargent.fr/epargne",domain:"mesquestionsdargent.fr",publishedAt:"2026-10-01T00:00:00.000Z",text:"Texte complet institutionnel sur l’épargne de précaution.",highlights:["Constituer une épargne de précaution permet de faire face aux dépenses imprévues."]};
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


test("large documentary research is split into bounded one-source Groq requests",async()=>{
 const pool={query:async(sql)=>{if(sql.includes("FROM bep_financial_knowledge"))return{rows:[]};if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};return{rowCount:0,rows:[]}}};
 const calls=[];
 const client={generateJson:async(args)=>{calls.push(args);return{value:{findings:[],proposals:[]},usage:{total_tokens:20}}}};
 const sources=Array.from({length:4},(_,i)=>({title:"Source "+i,url:"https://mesquestionsdargent.fr/source-"+i,domain:"mesquestionsdargent.fr",publishedAt:null,text:"Texte source ".repeat(1500),highlights:["Extrait ".repeat(150)]}));
 const result=await analyzeDocumentaryLibrary({pool,client,query:"budget",searchResults:sources,maxOutputTokens:2600});
 assert.equal(calls.length,4);
 assert.equal(result.summary.batches,4);
 assert.equal(result.usage.total_tokens,80);
 for(const call of calls){
  assert.ok(call.prompt.length<14000);
  assert.ok(call.maxOutputTokens<=1600);
  assert.equal(call.jsonSchema,ANALYSIS_SCHEMA);
 }
 assert.equal(result.automaticPublication,false);
});


test("documentary quota is reserved once per Groq batch and stops before an unreserved call",async()=>{
 const pool={query:async(sql)=>{if(sql.includes("FROM bep_financial_knowledge"))return{rows:[]};if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};return{rowCount:0,rows:[]}}};
 const calls=[];let reservations=0;
 const client={generateJson:async(args)=>{calls.push(args);return{value:{findings:[],proposals:[]},usage:{total_tokens:10}}}};
 const sources=Array.from({length:4},(_,i)=>({title:"Source "+i,url:"https://mesquestionsdargent.fr/quota-"+i,domain:"mesquestionsdargent.fr",text:"Contenu source",highlights:["Extrait"]}));
 await assert.rejects(()=>analyzeDocumentaryLibrary({pool,client,query:"budget",searchResults:sources,beforeGroqCall:async()=>++reservations<=2}),/DAILY_AGENT_QUOTA_REACHED/);
 assert.equal(reservations,3,"the third batch checks quota before sending a request");
 assert.equal(calls.length,2,"no Groq request is sent without a reserved call");
});


test("documentary analysis resumes after the last durably completed source batch",async()=>{
 const pool={query:async(sql)=>{if(sql.includes("FROM bep_financial_knowledge"))return{rows:[]};if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};return{rowCount:0,rows:[]}}};
 const sources=Array.from({length:4},(_,i)=>({title:"Resume source "+i,url:"https://mesquestionsdargent.fr/resume-"+i,domain:"mesquestionsdargent.fr",text:"Texte source "+i,highlights:["Extrait "+i]}));
 const sourcePayload=sources.map(x=>({title:x.title,url:x.url,domain:x.domain,publishedAt:x.publishedAt,text:String(x.text||"").slice(0,3500),highlights:x.highlights.slice(0,2).map(h=>String(h||"").slice(0,700))}));
 const hash=value=>require("node:crypto").createHash("sha256").update(value).digest("hex");
 const sourceDigest=hash(JSON.stringify(sourcePayload));
 const inputDigest=hash(JSON.stringify({query:"budget",sources:sourcePayload,library:[]}));
 const checkpoints=[];
 const calls=[];
 const client={generateJson:async()=>{calls.push(1);return{value:{findings:[],proposals:[]},usage:{total_tokens:10}}}};
 const result=await analyzeDocumentaryLibrary({pool,client,query:"budget",searchResults:sources,resumeState:{sourceDigest,inputDigest,nextBatchIndex:2,findingsRaw:[],proposalsRaw:[],usageParts:[{total_tokens:20}]},onBatchComplete:async state=>checkpoints.push(state)});
 assert.equal(calls.length,2,"only batches 3 and 4 should call Groq");
 assert.equal(checkpoints.length,2);
 assert.equal(checkpoints[0].nextBatchIndex,3);
 assert.equal(checkpoints[1].nextBatchIndex,4);
 assert.equal(result.usage.total_tokens,40,"usage from earlier batches is retained");
});
