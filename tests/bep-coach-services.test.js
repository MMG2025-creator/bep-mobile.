"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {researchEnabled,safeHttpUrl,digestWebCandidate,RESEARCH_CONFIG,LIBRARY_CONFIG,PROPOSALS_CONFIG,researchWeb,getCoachUsage,createCoachResearchStatusHandler,readCoachProposalsDocument,createCoachProposalsDocumentHandler}=require("../lib/bep-coach-services");

test("Coach knowledge and research services are independent JSON contracts",()=>{
 assert.equal(LIBRARY_CONFIG.service,"bep-coach-library");
 assert.equal(LIBRARY_CONFIG.storage.create_tables,false);
 assert.equal(LIBRARY_CONFIG.api.path,"/api/coach/library");
 assert.equal(RESEARCH_CONFIG.service,"bep-coach-web-research");
 assert.equal(RESEARCH_CONFIG.api.path,"/api/admin/bep-coach/research");
 assert.equal(RESEARCH_CONFIG.default_model,"gemini-3.8-flash");
 assert.equal(Object.hasOwn(RESEARCH_CONFIG,"model_env"),false);
 assert.equal(Object.hasOwn(RESEARCH_CONFIG.limits,"max_calls_per_day"),false);
 assert.equal(RESEARCH_CONFIG.provider_reference.free_tier_grounding_rpd_reference,500);
 assert.equal(RESEARCH_CONFIG.research_policy.automatic_publication,false);
 assert.equal(RESEARCH_CONFIG.research_policy.human_approval_required,true);
 assert.equal(RESEARCH_CONFIG.proposal_document.contract,"services/coach-proposals.json");
 assert.equal(RESEARCH_CONFIG.proposal_document.endpoint,"/api/admin/bep-coach/proposals.json");
 assert.equal(RESEARCH_CONFIG.proposal_document.storage_table,"bep_knowledge_candidates");
});


test("monthly provider usage separates grounding searches from Gemini API calls and projects the current pace",async()=>{
 const pool={query:async(sql)=>/SELECT request_type/.test(sql)?{rows:[{request_type:"google_search_grounding",api_calls:4,grounding_queries:9,prompt_tokens:100,output_tokens:40,total_tokens:140,failed_calls:1,last_call_at:null},{request_type:"json_library_consultation",api_calls:0,grounding_queries:0,prompt_tokens:0,output_tokens:0,total_tokens:0,failed_calls:0,last_call_at:null}]}:{rows:[],rowCount:0}};
 const usage=await getCoachUsage(pool);
 assert.equal(usage.groundingQueries,9);
 assert.equal(usage.geminiApiCalls,4);
 assert.equal(usage.byType.google_search_grounding.failedCalls,1);
 assert.equal(usage.byType.json_library_consultation.apiCalls,0);
 assert.equal(usage.estimatedMonthlyCapacity,15000);
 assert.ok(Number.isFinite(usage.averageDailyGroundingQueries));
 assert.ok(Number.isFinite(usage.projectedMonthlyGroundingQueries));
 assert.equal(usage.monthlyEstimateGuaranteed,false);
});

test("admin research status handler returns protected monthly budget data and pinned model",async()=>{
 const pool={query:async(sql)=>/SELECT request_type/.test(sql)?{rows:[{request_type:"google_search_grounding",api_calls:3,grounding_queries:8,prompt_tokens:20,output_tokens:10,total_tokens:30,failed_calls:0,last_call_at:null}]}:{rows:[],rowCount:0}};
 let payload=null,header=null,statusCode=200;
 const res={setHeader:(name,value)=>{header=[name,value]},json:value=>{payload=value;return res},status:value=>{statusCode=value;return res}};
 const handler=createCoachResearchStatusHandler({pool,env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},logger:{error:()=>{}}});
 await handler({},res);
 assert.equal(statusCode,200);
 assert.deepEqual(header,["Cache-Control","no-store"]);
 assert.equal(payload.model,"gemini-3.8-flash");
 assert.equal(payload.enabled,true);
 assert.equal(payload.manualIngestionEnabled,false);
 assert.equal(payload.usage.groundingQueries,8);
 assert.equal(payload.usage.geminiApiCalls,3);
 assert.equal(payload.usage.estimatedMonthlyCapacity,15000);
 assert.ok(Number.isFinite(payload.usage.averageDailyGroundingQueries));
 assert.ok(Number.isFinite(payload.usage.projectedMonthlyGroundingQueries));
});
test("admin research status handler returns a controlled error when usage storage is unavailable",async()=>{
 let statusCode=200,payload=null;
 const res={setHeader:()=>{},json:value=>{payload=value;return res},status:value=>{statusCode=value;return res}};
 const handler=createCoachResearchStatusHandler({pool:{query:async()=>{throw new Error("db unavailable")}},logger:{error:()=>{}}});
 await handler({},res);
 assert.equal(statusCode,503);
 assert.equal(payload.error,"COACH_RESEARCH_USAGE_UNAVAILABLE");
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

test("grounded research uses Gemini Interactions API and stores only citation-matched pending candidates",async()=>{
 const statements=[];
 const pool={query:async(sql,params)=>{statements.push({sql,params});return /bep_knowledge_candidates/.test(sql)?{rowCount:1,rows:[{id:42}]}:{rowCount:1,rows:[]}}};
 const fetchImpl=async(url,options)=>{
  assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(options.headers["x-goog-api-key"],"test-key");
  const body=JSON.parse(options.body);
  assert.equal(body.model,"gemini-3.8-flash");
  assert.equal(body.store,false);
  assert.deepEqual(body.tools,[{type:"google_search"}]);
  assert.equal(body.response_format.mime_type,"application/json");
  return{ok:true,status:200,json:async()=>({steps:[
   {type:"google_search_call",arguments:{queries:["aide budget"]}},
   {type:"google_search_result",result:[{search_suggestions:"Google Search suggestions"}]},
   {type:"model_output",content:[{type:"text",text:JSON.stringify({proposals:[{title:"Aide au budget",content:"Repère pratique sourcé.",source_url:"https://www.service-public.fr/particuliers/vosdroits",source_name:"model name",confidence:"high",rationale:"Source officielle",keywords:["budget"]}]}),annotations:[{type:"url_citation",url:"https://www.service-public.fr/particuliers/vosdroits",title:"Service Public"}]}]}
  ],status:"completed",usage:{total_input_tokens:31,total_output_tokens:19,total_tokens:50}})};
 };
 const result=await researchWeb({pool,query:"aides budget",category:"budget",env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key",BEP_COACH_RESEARCH_MODEL:"legacy-override"},fetchImpl});
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.candidates[0].id,42);
 assert.equal(result.candidates[0].source.name,"Service Public");
 const usageInsert=statements.find(x=>/INSERT INTO bep_coach_provider_usage/.test(x.sql));
 assert.equal(usageInsert.params[4],31);
 assert.equal(usageInsert.params[5],19);
 assert.equal(usageInsert.params[6],50);
 assert.deepEqual(result.groundingQueries,["aide budget"]);
 assert.equal(result.searchEntryPoint,"Google Search suggestions");
 assert.ok(statements.some(x=>/bep_coach_provider_usage/.test(x.sql)));
 const candidateInsert=statements.find(x=>/bep_knowledge_candidates/.test(x.sql));
 assert.ok(candidateInsert);
 assert.equal(candidateInsert.params[6],"web_research_pending");
 assert.equal(statements.some(x=>/bep_agent_daily_usage/.test(x.sql)),false);
});

test("successful Interactions responses with invalid Gemini output are counted as failed provider usage",async()=>{
 const inserts=[];
 const pool={query:async(sql,params)=>{if(/INSERT INTO bep_coach_provider_usage/.test(sql))inserts.push({sql,params});return{rowCount:1,rows:[]}}};
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:"not-json"}]}],usage:{total_input_tokens:12,total_output_tokens:7,total_tokens:19}})});
 await assert.rejects(()=>researchWeb({pool,query:"test",category:"general",env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl}),/JSON valide/);
 assert.equal(inserts.length,1);
 assert.equal(inserts[0].params[2],"failed");
 assert.equal(inserts[0].params[4],12);
 assert.equal(inserts[0].params[5],7);
 assert.equal(inserts[0].params[6],19);
 assert.equal(inserts[0].params[8],"INVALID_MODEL_JSON");
});
test("non-completed Interactions responses are rejected and never create knowledge candidates",async()=>{
 const inserts=[];
 const pool={query:async(sql,params)=>{if(/INSERT INTO bep_coach_provider_usage/.test(sql))inserts.push({sql,params});if(/INSERT INTO bep_knowledge_candidates/.test(sql))throw new Error("candidate must not be inserted");return{rowCount:1,rows:[]}}};
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({status:"incomplete",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify({proposals:[{title:"x",content:"y",source_url:"https://example.org"}]})}]}],usage:{total_input_tokens:5,total_output_tokens:4,total_tokens:9}})});
 await assert.rejects(()=>researchWeb({pool,query:"test",category:"general",env:{BEP_COACH_WEB_RESEARCH_ENABLED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl}),/INTERACTION_INCOMPLETE/);
 assert.equal(inserts.length,1);
 assert.equal(inserts[0].params[2],"failed");
 assert.equal(inserts[0].params[4],5);
 assert.equal(inserts[0].params[5],4);
 assert.equal(inserts[0].params[6],9);
 assert.equal(inserts[0].params[8],"INTERACTION_INCOMPLETE");
});
test("pending and reviewed proposals are exposed as a durable JSON document without user data",async()=>{
 const statements=[];
 const pool={query:async(sql,params)=>{statements.push({sql,params});return{rows:[{id:"42",source_slug:"web-budget-0123456789abcdef01234567",source_version:1,source_digest:"a".repeat(64),proposal_type:"update",title:"Aide au budget",content:"Contenu sourcé",source_name:"Service Public",source_url:"https://www.service-public.fr/aide",evidence_level:"web_research_pending",confidence:"high",rationale:"Source institutionnelle",review_status:"pending",created_at:new Date("2026-11-16T10:00:00Z"),reviewed_at:null}]}}};
 const document=await readCoachProposalsDocument({pool,status:"pending",limit:25});
 assert.equal(PROPOSALS_CONFIG.schema,"bep-coach-proposals");
 assert.equal(document.schema,"bep-coach-proposals");
 assert.equal(document.status,"pending");
 assert.equal(document.count,1);
 assert.equal(document.storage.provider,"postgresql");
 assert.equal(document.storage.table,"bep_knowledge_candidates");
 assert.equal(document.publication.human_approval_required,true);
 assert.equal(document.publication.automatic_publication,false);
 assert.equal(document.proposals[0].id,"42");
 assert.equal(document.proposals[0].source.url,"https://www.service-public.fr/aide");
 assert.equal(document.proposals[0].review_status,"pending");
 assert.equal(Object.hasOwn(document.proposals[0],"user_id"),false);
 assert.match(statements[0].sql,/FROM bep_knowledge_candidates/);
 assert.deepEqual(statements[0].params,["pending",25]);
});

test("proposal JSON export handler is no-store, downloadable and rejects invalid status",async()=>{
 let headers={},statusCode=200,payload=null;
 const res={setHeader:(name,value)=>{headers[name]=value},json:value=>{payload=value;return res},status:value=>{statusCode=value;return res}};
 const handler=createCoachProposalsDocumentHandler({pool:{query:async()=>({rows:[]})},logger:{error:()=>{}}});
 await handler({query:{status:"pending"}},res);
 assert.equal(statusCode,200);
 assert.equal(headers["Cache-Control"],"no-store");
 assert.ok(headers["Content-Disposition"].includes("bep-coach-proposals.json"));
 assert.equal(payload.schema,"bep-coach-proposals");
 statusCode=200;payload=null;
 await handler({query:{status:"unknown"}},res);
 assert.equal(statusCode,400);
 assert.equal(payload.error,"INVALID_PROPOSAL_STATUS");
});

test("manual source ingestion rejects unsafe URLs and private network addresses",()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 assert.equal(ingestion.normaliseUrl("https://www.service-public.fr/particuliers").href,new URL("https://www.service-public.fr/particuliers").href);
 assert.equal(ingestion.normaliseUrl("http://example.org"),null);
 assert.equal(ingestion.normaliseUrl("https://user:pass@example.org"),null);
 assert.equal(ingestion.normaliseUrl("https://127.0.0.1/admin"),null);
 assert.equal(ingestion.normaliseUrl("https://metadata.google.internal/"),null);
 assert.equal(ingestion.publicAddress("8.8.8.8"),true);
 assert.equal(ingestion.publicAddress("10.0.0.1"),false);
 assert.equal(ingestion.publicAddress("169.254.169.254"),false);
 assert.equal(ingestion.publicAddress("127.0.0.1"),false);
});
test("manual source pinned DNS lookup supports Node all-address callback mode",()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const resolved={address:"203.0.113.10",family:4};
 const lookup=ingestion.createPinnedLookup(resolved);
 let allResult=null,standardResult=null;
 lookup("example.org",{all:true},(error,addresses)=>{allResult={error,addresses}});
 lookup("example.org",{all:false},(error,address,family)=>{standardResult={error,address,family}});
 assert.equal(allResult.error,null);
 assert.deepEqual(allResult.addresses,[resolved]);
 assert.equal(standardResult.error,null);
 assert.equal(standardResult.address,resolved.address);
 assert.equal(standardResult.family,resolved.family);
});

test("manual source extraction removes active markup and only follows same-host HTTPS links",()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const html="<title>Guide budget</title><script>steal()</script><nav>Menu</nav><main><p>Contenu pédagogique fiable &amp; utile.</p><a href='/aide'>Aide</a><a href='https://evil.example/'>Externe</a></main>";
 assert.match(ingestion.htmlToText(html),/Contenu pédagogique fiable & utile/);
 assert.doesNotMatch(ingestion.htmlToText(html),/steal|Menu/);
 const links=ingestion.extractLinks(html,new URL("https://example.org/guide"));
 assert.deepEqual(links,["https://example.org/aide"]);
});
test("manual Gemini ingestion sends collected text without Google Search and stores only pending candidates",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const statements=[];let requestBody=null;
 const pool={query:async(sql,params)=>{statements.push({sql,params});if(/INSERT INTO bep_knowledge_candidates/.test(sql))return{rowCount:1,rows:[{id:73}]};return{rowCount:1,rows:[]}}};
 const proposal={title:"Comprendre le budget",content:"Une fiche pédagogique qui explique comment distinguer les dépenses fixes, variables et occasionnelles, puis construire un suivi mensuel adapté.",source_url:"https://example.org/guide",source_name:"Guide budget",confidence:"high",rationale:"Le contenu expose une méthode structurée.",keywords:["budget"]};
 const fetchImpl=async(_url,options)=>{requestBody=JSON.parse(options.body);return{ok:true,status:200,json:async()=>({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify({proposals:[proposal]})}]}],usage:{total_input_tokens:12,total_output_tokens:8,total_tokens:20}})}};
 const result=await ingestion.analyseCollectedSources({pool,collection:{pages:[{url:"https://example.org/guide",title:"Guide budget",text:"Contenu documentaire suffisamment long."}],pagesDiscovered:1,pagesAnalysed:1,warnings:[]},category:"budget",env:{BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl});
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.provider,"gemini-interactions-no-search");
 assert.equal(requestBody.store,false);
 assert.equal(Object.hasOwn(requestBody,"tools"),false);
 assert.match(requestBody.input,/Contenu documentaire suffisamment long/);
 const insert=statements.find(x=>/INSERT INTO bep_knowledge_candidates/.test(x.sql));
 assert.ok(insert);
 assert.equal(insert.params[6],"web_research_pending");
 assert.equal(insert.params[5],"https://example.org/guide");
 assert.ok(statements.some(x=>/INSERT INTO bep_coach_provider_usage/.test(x.sql)));
});
test("manual Gemini ingestion remains disabled without explicit free-tier admin gates",()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 assert.equal(ingestion.ingestionEnabled({BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"key"}),true);
 assert.equal(ingestion.ingestionEnabled({BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"false",BEP_AGENT_GEMINI_API_KEY:"key"}),false);
});

test("manual ingestion checks Gemini free-tier gates before making any external request",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const result=await ingestion.ingestManualSource({pool:{query:async()=>{throw new Error("database should not be called")}},url:"https://example.org",env:{}});
 assert.equal(result.enabled,false);
 assert.equal(result.candidatesCreated,0);
});


test("manual Gemini ingestion retries one transient 503 then succeeds without Google Search",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 let calls=0,requestBody=null;
 const statements=[];
 const pool={query:async(sql,params)=>{statements.push({sql,params});if(/INSERT INTO bep_knowledge_candidates/.test(sql))return{rowCount:1,rows:[{id:91}]};return{rowCount:1,rows:[]}}};
 const proposal={title:"Comprendre le budget",content:"Une fiche pédagogique qui explique comment distinguer les dépenses fixes, variables et occasionnelles, puis construire un suivi mensuel adapté.",source_url:"https://example.org/guide",source_name:"Guide budget",confidence:"high",rationale:"Le contenu expose une méthode structurée.",keywords:["budget"]};
 const fetchImpl=async(_url,options)=>{
  calls++;requestBody=JSON.parse(options.body);
  if(calls===1)return{ok:false,status:503,json:async()=>({error:{status:"UNAVAILABLE",message:"Service temporarily unavailable"}})};
  return{ok:true,status:200,json:async()=>({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify({proposals:[proposal]})}]}],usage:{total_input_tokens:12,total_output_tokens:8,total_tokens:20}})};
 };
 const result=await ingestion.analyseCollectedSources({pool,collection:{pages:[{url:"https://example.org/guide",title:"Guide budget",text:"Contenu documentaire suffisamment long."}],pagesDiscovered:1,pagesAnalysed:1,warnings:[]},category:"budget",env:{BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl});
 assert.equal(calls,2);
 assert.equal(result.providerAttempts,2);
 assert.equal(result.candidatesCreated,1);
 assert.equal(requestBody.store,false);
 assert.equal(Object.hasOwn(requestBody,"tools"),false);
 assert.ok(statements.some(x=>/INSERT INTO bep_knowledge_candidates/.test(x.sql)));
});

test("manual Gemini ingestion records safe provider diagnostics after a repeated 503 and creates no candidate",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const usage=[];
 const pool={query:async(sql,params)=>{if(/INSERT INTO bep_coach_provider_usage/.test(sql))usage.push(params);if(/INSERT INTO bep_knowledge_candidates/.test(sql))throw new Error("candidate must not be inserted");return{rowCount:1,rows:[]}}};
 let calls=0;
 const fetchImpl=async()=>{calls++;return{ok:false,status:503,json:async()=>({error:{status:"UNAVAILABLE",message:"Unavailable for key test-key; retry later"}})}};
 await assert.rejects(()=>ingestion.analyseCollectedSources({pool,collection:{pages:[{url:"https://example.org/guide",title:"Guide",text:"Contenu documentaire suffisamment long."}],pagesDiscovered:1,pagesAnalysed:1,warnings:[]},category:"budget",env:{BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"},fetchImpl}),/GEMINI_HTTP_503_UNAVAILABLE/);
 assert.equal(calls,2);
 assert.equal(usage.length,1);
 assert.equal(usage[0][2],"failed");
 assert.equal(usage[0][7],503);
 assert.match(usage[0][8],/HTTP_503_UNAVAILABLE/);
 assert.ok(usage[0][8].includes("[REDACTED]"));
 assert.doesNotMatch(usage[0][8],/test-key/);
});


test("manual batch ingestion enforces size, HTTPS validation and duplicate protection",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const pool={query:async()=>({rowCount:0,rows:[]})};
 const env={BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"};
 await assert.rejects(()=>ingestion.ingestManualSources({pool,sources:[],env}),/INVALID_BATCH_SIZE/);
 await assert.rejects(()=>ingestion.ingestManualSources({pool,sources:[{url:"http://example.org",category:"budget"}],env}),/INVALID_BATCH_SOURCE/);
 await assert.rejects(()=>ingestion.ingestManualSources({pool,sources:[{url:"https://example.org/a",category:"budget"},{url:"https://example.org/a",category:"budget"}],env}),/DUPLICATE_BATCH_SOURCE/);
 await assert.rejects(()=>ingestion.ingestManualSources({pool,sources:Array.from({length:11},(_,i)=>({url:`https://example.org/${i}`,category:"budget"})),env}),/INVALID_BATCH_SIZE/);
});

test("manual batch ingestion collects sources and creates only pending Gemini candidates",async()=>{
 const ingestion=require("../lib/bep-coach-ingestion");
 const statements=[];let requestBody=null;
 const pool={query:async(sql,params)=>{statements.push({sql,params});if(/INSERT INTO bep_knowledge_candidates/.test(sql))return{rowCount:1,rows:[{id:101}]};return{rowCount:1,rows:[]}}};
 const env={BEP_AGENT_ENABLED:"true",BEP_AGENT_RUN_MODE:"admin_on_demand",BEP_AGENT_FREE_TIER_ACKNOWLEDGED:"true",BEP_AGENT_GEMINI_API_KEY:"test-key"};
 const sources=[{url:"https://example.org/budget",category:"budget"},{url:"https://example.org/savings",category:"budget"}];
 const fetchPage=async(url)=>({url,title:url.endsWith("budget")?"Budget":"Épargne",text:"Contenu documentaire suffisamment long pour être analysé par le modèle et produire une fiche pédagogique fiable.",links:[],contentType:"text/html"});
 const proposal={title:"Comprendre le budget",content:"Une fiche pédagogique qui explique comment distinguer les dépenses fixes, variables et occasionnelles, puis construire un suivi mensuel adapté.",source_url:"https://example.org/budget",source_name:"Budget",confidence:"high",rationale:"Le contenu expose une méthode structurée.",keywords:["budget"]};
 const fetchImpl=async(_url,options)=>{requestBody=JSON.parse(options.body);return{ok:true,status:200,json:async()=>({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify({proposals:[proposal]})}]}],usage:{total_input_tokens:12,total_output_tokens:8,total_tokens:20}})}};
 const result=await ingestion.ingestManualSources({pool,sources,env,fetchPage,fetchImpl});
 assert.equal(result.batchSize,2);
 assert.equal(result.processed,2);
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.results.every(item=>item.status==="analysed"),true);
 assert.equal(requestBody.store,false);
 assert.equal(Object.hasOwn(requestBody,"tools"),false);
 const insert=statements.find(item=>/INSERT INTO bep_knowledge_candidates/.test(item.sql));
 assert.ok(insert);
 assert.equal(insert.params[5],"https://example.org/budget");
 assert.equal(insert.params[6],"web_research_pending");
});
