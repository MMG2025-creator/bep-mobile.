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
 assert.equal(RESEARCH_CONFIG.default_model,"gemini-2.5-flash");
 assert.equal(Object.hasOwn(RESEARCH_CONFIG.limits,"max_calls_per_day"),false);
 assert.equal(RESEARCH_CONFIG.provider_reference.free_tier_grounding_rpd_reference,500);
 assert.equal(RESEARCH_CONFIG.research_policy.automatic_publication,false);
 assert.equal(RESEARCH_CONFIG.research_policy.human_approval_required,true);
});

test("web research requires explicit feature activation and dedicated Gemini key",()=>{
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"secret"}),true);
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"false",BEP_AGENT_GEMINI_API_KEY:"secret"}),false);
 assert.equal(researchEnabled({BEP_COACH_WEB_RESEARCH_ENABLED:"true"}),false);
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
 const pool={query:async(sql,params)=>{statements.push({sql,params});return /bep_knowledge_candidates/.test(sql)?{rowCount:1,rows:[{id:42}]}:{rowCount:1,rows:[]}}};
 const fetchImpl=async(url,options)=>{
  assert.match(url,/generativelanguage\.googleapis\.com/);
  const body=JSON.parse(options.body);assert.deepEqual(body.tools,[{google_search:{}}]);
  return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{title:"Aide au budget",content:"Repère pratique sourcé.",source_url:"https://www.service-public.fr/particuliers/vosdroits",source_name:"model name",confidence:"high",rationale:"Source officielle",keywords:["budget"]}]})}]},groundingMetadata:{webSearchQueries:["aide budget"],groundingChunks:[{web:{uri:"https://www.service-public.fr/particuliers/vosdroits",title:"Service Public"}}],searchEntryPoint:{renderedContent:"Google Search suggestions"}}}],usageMetadata:{totalTokenCount:50}})};
 };
 const result=await researchWeb({pool,query:"aides budget",category:"budget",env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl});
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.candidates[0].id,42);
 assert.equal(result.candidates[0].source.name,"Service Public");
 assert.equal(result.searchEntryPoint,"Google Search suggestions");
 assert.ok(statements.some(x=>/bep_coach_provider_usage/.test(x.sql)));
 const candidateInsert=statements.find(x=>/bep_knowledge_candidates/.test(x.sql));
 assert.ok(candidateInsert);
 assert.equal(candidateInsert.params[6],"web_research_pending");
 assert.equal(statements.some(x=>/bep_agent_daily_usage/.test(x.sql)),false);
});
