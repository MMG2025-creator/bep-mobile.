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
 let callCount=0;
 const client={generateJson:async(args)=>{callCount++;if(callCount===2)return{value:{coverage_complete:true,overall_verdict:"supported",claims:[{claim:"Une épargne de précaution permet de faire face aux dépenses imprévues.",verdict:"supported",evidence:[{url:source.url,quote:"Constituer une épargne de précaution permet de faire face aux dépenses imprévues."}],explanation:"La source formule directement cette affirmation."}]}};schemaSeen=args.jsonSchema;return{value:{findings:[{kind:"coverage_gap",target_slug:"",summary:"L'épargne de précaution est peu couverte",reason:"La source apporte un point utile.",source_urls:[source.url],confidence:"high"}],proposals:[{proposal_type:"create",target_slug:"",category:"savings",title:"Constituer une épargne de précaution",content:"Une épargne de précaution permet de faire face aux dépenses imprévues sans recourir immédiatement au crédit. Elle doit être adaptée aux charges et à la stabilité des revenus. Le montant cible dépend de la situation et doit être réévalué régulièrement.",source_url:source.url,confidence:"high",rationale:"La source institutionnelle décrit les objectifs de cette réserve.",keywords:["épargne","précaution"],evidence_urls:[source.url]}]},usage:{total_tokens:90}}}};
 const result=await analyzeDocumentaryLibrary({pool,client,query:"épargne de précaution",searchResults:[source],model:"openai/gpt-oss-20b"});
 assert.equal(schemaSeen,ANALYSIS_SCHEMA);
 assert.equal(result.provider,"groq");
 assert.equal(callCount,2);
 assert.equal(result.proposals.length,1);
 assert.equal(result.proposals[0].status,"pending_review");
 assert.equal(inserts.filter(x=>x.sql.includes("INSERT INTO bep_knowledge_candidates")).length,1);
 const candidate=inserts.find(x=>x.sql.includes("INSERT INTO bep_knowledge_candidates"));
 assert.match(candidate.sql,/'create'/);
 assert.equal(candidate.params[5],"https://mesquestionsdargent.fr/epargne");
 assert.match(candidate.sql,/'pending'/);
 assert.equal(result.automaticPublication,false);
 assert.match(candidate.params[8],/semantic_evidence_audit/);
});

test("unsupported external evidence is rejected before a candidate can be stored",async()=>{
 let candidateWrites=0;
 const pool={query:async(sql)=>{if(sql.includes("FROM bep_financial_knowledge"))return{rows:[]};if(sql.includes("FROM bep_agent_approved_knowledge"))return{rows:[]};if(sql.includes("INSERT INTO bep_knowledge_candidates"))candidateWrites++;return{rowCount:1,rows:[]}}};
 const client={generateJson:async()=>({value:{findings:[],proposals:[{proposal_type:"create",target_slug:"",category:"budget",title:"Fiche non sourcée",content:"Contenu suffisamment long pour dépasser la limite minimale de validation et constituer une proposition documentaire candidate.",source_url:"https://example.org/fake",confidence:"high",rationale:"Aucune preuve.",keywords:[],evidence_urls:["https://example.org/fake"]}]}})};
 const result=await analyzeDocumentaryLibrary({pool,client,query:"budget",searchResults:[{title:"Un site",url:"https://mesquestionsdargent.fr/source",domain:"mesquestionsdargent.fr",highlights:["Extrait"]}]});
 assert.equal(candidateWrites,0);
 assert.equal(result.proposals.length,0);
});

test("claim-level evidence audit rejects unsupported claims and fabricated quotations",async()=>{
 const {auditClaimEvidence}=require("../lib/bep-agent/documentary-analysis");
 const source={title:"Source institutionnelle",url:"https://mesquestionsdargent.fr/source",text:"Le versement initial minimum du livret est fixé à 10 euros.",highlights:["Le versement initial minimum du livret est fixé à 10 euros."]};
 const sourceMap=new Map([[source.url,source]]);
 const unsupportedClient={generateJson:async()=>({value:{coverage_complete:true,overall_verdict:"partial",claims:[{claim:"Le plafond est de 100 000 euros.",verdict:"unsupported",evidence:[],explanation:"Aucune preuve."}]}})};
 const unsupported=await auditClaimEvidence({client:unsupportedClient,title:"Plafond",content:"Le plafond est de 100 000 euros.",evidenceUrls:[source.url],sourceMap});
 assert.equal(unsupported.accepted,false);
 const fabricatedClient={generateJson:async()=>({value:{coverage_complete:true,overall_verdict:"supported",claims:[{claim:"Le versement initial minimum est de 10 euros.",verdict:"supported",evidence:[{url:source.url,quote:"Le versement initial minimum est de 10 euros."}],explanation:"Citation prétendue."}]}})};
 const fabricated=await auditClaimEvidence({client:fabricatedClient,title:"Versement minimum",content:"Le versement initial minimum est de 10 euros.",evidenceUrls:[source.url],sourceMap});
 assert.equal(fabricated.accepted,false);
});
test("claim-level evidence audit fails closed when claim coverage is incomplete",async()=>{
 const {auditClaimEvidence}=require("../lib/bep-agent/documentary-analysis");
 const url="https://mesquestionsdargent.fr/source";
 const client={generateJson:async()=>({value:{coverage_complete:false,overall_verdict:"supported",claims:[{claim:"Une affirmation",verdict:"supported",evidence:[{url,quote:"Le versement initial minimum du livret est fixé à 10 euros."}],explanation:"Preuve."}]}})};
 const result=await auditClaimEvidence({client,title:"Test",content:"Une affirmation",evidenceUrls:[url],sourceMap:new Map([[url,{url,text:"Le versement initial minimum du livret est fixé à 10 euros."}]])});
 assert.equal(result.accepted,false);
});

test("contradiction requires matching product, institution, holder, operation and period",()=>{
 const {compareFindingContext}=require("../lib/bep-agent/documentary-analysis");
 const left={product:"Livret A",institution:"La Banque Postale",holder:"particulier",operation:"versement minimum",period:"2026"};
 const same={...left};
 const differentBank={...left,institution:"Banque X"};
 const missingPeriod={...left,period:""};
 assert.equal(compareFindingContext(left,same).comparable,true);
 assert.equal(compareFindingContext(left,differentBank).reason,"context_mismatch");
 assert.equal(compareFindingContext(left,missingPeriod).reason,"context_incomplete");
});

test("Coach content quality rejects links, publication dates and oversized text",()=>{
 const {contentQuality,MAX_COACH_CONTENT_CHARS}=require("../lib/bep-agent/documentary-analysis");
 const base={title:"Taux du Livret A",query:"taux Livret A",evidenceSources:[{url:"https://mesquestionsdargent.fr/livret-a"}]};
 assert.ok(contentQuality({...base,content:"Le taux du Livret A est de 1,7 % depuis le 1er août 2026."}).accepted);
 assert.equal(contentQuality({...base,content:"Publié le 14 juillet 2026. Le taux du Livret A est de 1,7 %."}).issues.includes("publication_date_in_content"),true);
 assert.equal(contentQuality({...base,content:"Actualisée le 14 juillet 2026. Le taux du Livret A est de 1,7 %."}).issues.includes("publication_date_in_content"),true);
 assert.equal(contentQuality({...base,content:"Le taux de 1,7 % s'applique depuis le 1er août 2026."}).issues.includes("publication_date_in_content"),false);
 assert.ok(contentQuality({...base,content:"Consultez <a href='https://example.org'>la source officielle</a>."}).issues.includes("html_or_link_in_content"));
 assert.ok(contentQuality({...base,content:"Voir [la source](https://example.org) pour le taux."}).issues.includes("html_or_link_in_content"));
 assert.ok(contentQuality({...base,content:"Consultez la source officielle pour les détails."}).issues.includes("html_or_link_in_content"));
 assert.ok(contentQuality({...base,content:"Livret A ".repeat(MAX_COACH_CONTENT_CHARS)}).issues.includes("content_too_long"));
 const scored=contentQuality({...base,content:"Le taux du Livret A est de 1,7 % depuis le 1er août 2026."});
 assert.equal(typeof scored.documentation,"number");
 assert.ok(scored.documentation>=70);
 assert.ok(scored.overall>=75);
 assert.equal(contentQuality({title:"Taux du Livret A",query:"taux Livret A",content:"Le taux du Livret A est de 1,7 % depuis le 1er août 2026."}).issues.includes("insufficient_documentary_evidence"),true);
 assert.equal(contentQuality({...base,content:"Livret A ".repeat(135)}).chars>1200,true);
 assert.equal(contentQuality({...base,content:"Livret A ".repeat(135)}).issues.includes("content_too_long"),false);
});
