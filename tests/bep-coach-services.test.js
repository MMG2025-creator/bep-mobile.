"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {researchEnabled,safeHttpUrl,digestWebCandidate,RESEARCH_CONFIG,LIBRARY_CONFIG,researchWeb}=require("../lib/bep-coach-services");

test("Coach knowledge and research services are independent JSON contracts",()=>{
 assert.equal(LIBRARY_CONFIG.service,"bep-coach-library");
 assert.equal(LIBRARY_CONFIG.storage.create_tables,false);
 assert.equal(LIBRARY_CONFIG.api.path,"/api/coach/library");
 assert.equal(RESEARCH_CONFIG.service,"bep-coach-web-research");
 assert.equal(RESEARCH_CONFIG.api.path,"/api/admin/bep-coach/research");
 assert.equal(RESEARCH_CONFIG.research_policy.automatic_publication,false);
 assert.equal(RESEARCH_CONFIG.research_policy.human_approval_required,true);
});

test("web research requires separate feature and billing approvals",()=>{
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_COACH_RESEARCH_BILLING_APPROVED:"false",BEP_AGENT_GEMINI_API_KEY:"secret"}),false);
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"false",BEP_COACH_RESEARCH_BILLING_APPROVED:"true",BEP_AGENT_GEMINI_API_KEY:"secret"}),false);
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_COACH_RESEARCH_BILLING_APPROVED:"true",BEP_AGENT_GEMINI_API_KEY:"secret"}),true);
});

test("research URL validation rejects insecure and credential-bearing URLs",()=>{
 assert.equal(safeHttpUrl("https://www.service-public.fr/aide"),"https://www.service-public.fr/aide");
 assert.equal(safeHttpUrl("http://example.org"),"");
 assert.equal(safeHttpUrl("javascript:alert(1)"),"");
 assert.equal(safeHttpUrl("https://user:pass@example.org"),"");
});

test("disabled web research never makes an external request",async()=>{
 let calls=0;
 const result=await researchWeb({pool:{query:async()=>{throw new Error("database should not be touched")}},query:"aides logement",env:{},fetchImpl:async()=>{calls++;throw new Error("unexpected network")}});
 assert.equal(result.enabled,false);
 assert.equal(result.candidatesCreated,0);
 assert.equal(calls,0);
});

test("web candidate digest is stable and category-bound",()=>{
 const candidate={source_slug:"web-budget-0123456789abcdef01234567",title:"Budget",content:"Contenu",source_name:"Source",source_url:"https://example.org",evidence_level:"web_research_pending"};
 assert.equal(digestWebCandidate(candidate,"budget"),digestWebCandidate(candidate,"budget"));
 assert.notEqual(digestWebCandidate(candidate,"budget"),digestWebCandidate(candidate,"savings"));
});

test("grounded research stores only source-matched pending candidates",async()=>{
 const statements=[];
 const pool={query:async(sql,params)=>{statements.push({sql,params});return statements.length===1?{rowCount:1,rows:[{calls:1}]}:{rowCount:1,rows:[{id:42}]}}};
 const fetchImpl=async(url,options)=>{
  assert.match(url,/generativelanguage\.googleapis\.com/);
  const body=JSON.parse(options.body);assert.deepEqual(body.tools,[{google_search:{}}]);
  return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{title:"Aide au budget",content:"Repère pratique sourcé.",source_url:"https://www.service-public.fr/particuliers/vosdroits",source_name:"model name",confidence:"high",rationale:"Source officielle",keywords:["budget"]}]})}]},groundingMetadata:{webSearchQueries:["aide budget"],groundingChunks:[{web:{uri:"https://www.service-public.fr/particuliers/vosdroits",title:"Service Public"}}],searchEntryPoint:{renderedContent:"Google Search suggestions"}}}],usageMetadata:{totalTokenCount:50}})};
 };
 const result=await researchWeb({pool,query:"aides budget",category:"budget",env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_COACH_RESEARCH_BILLING_APPROVED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl});
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.candidates[0].id,42);
 assert.equal(result.candidates[0].source.name,"Service Public");
 assert.equal(result.searchEntryPoint,"Google Search suggestions");
 assert.equal(statements.length,2);
 assert.match(statements[1].sql,/bep_knowledge_candidates/);
 assert.equal(statements[1].params[6],"web_research_pending");
});
