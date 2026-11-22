"use strict";

function readConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true";
 const workerMode=env.BEP_AGENT_RUN_AS_WORKER==="true";
 const billingConfirmed=env.BEP_AGENT_BILLING_APPROVED==="true";
 const apiKey=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim();
 const model=String(env.BEP_AGENT_GEMINI_MODEL||"gemini-3.8-flash").trim();
 const maxCallsPerDay=Math.max(1,Math.min(50,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8));
 const maxOutputTokens=Math.max(256,Math.min(4096,Number(env.BEP_AGENT_MAX_OUTPUT_TOKENS)||1800));
 const pollMs=Math.max(5000,Math.min(60000,Number(env.BEP_AGENT_POLL_MS)||15000));
 const monthlyBudget=Number(env.BEP_AGENT_MONTHLY_BUDGET_USD);
 const budgetConfigured=Number.isFinite(monthlyBudget)&&monthlyBudget>0;
 const enabled=requested&&workerMode&&billingConfirmed&&!!apiKey&&budgetConfigured;
 let disabledReason="";
 if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";
 else if(!workerMode)disabledReason="supervisor must run in its dedicated worker process";
 else if(!billingConfirmed)disabledReason="explicit billing approval is missing";
 else if(!apiKey)disabledReason="dedicated Gemini API key is missing";
 else if(!budgetConfigured)disabledReason="monthly USD budget is missing or invalid";
 return Object.freeze({enabled,requested,workerMode,billingConfirmed,apiKey,keySource:apiKey?"dedicated":"missing",provider:"gemini",model,maxCallsPerDay,maxOutputTokens,pollMs,monthlyBudget,disabledReason});
}
function resolveAdminGeminiKey(env=process.env){
 const dedicated=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim();
 if(dedicated)return{apiKey:dedicated,keySource:"dedicated"};
 const provider=String(env.BEP_AI_PROVIDER||"gemini").trim().toLowerCase();
 const existing=String(env.BEP_AI_API_KEY||"").trim();
 if(provider==="gemini"&&env.BEP_AI_ZERO_BILLING_CONFIRMED==="true"&&existing)return{apiKey:existing,keySource:"existing_bep_ai"};
 return{apiKey:"",keySource:"missing"};
}
function resolveAdminProvider(env=process.env){
 const provider=String(env.BEP_AGENT_AI_PROVIDER||"groq").trim().toLowerCase();
 if(provider==="groq"){
  const apiKey=String(env.BEP_AGENT_GROQ_API_KEY||"").trim();
  return{provider,apiKey,keySource:apiKey?"dedicated_groq":"missing",model:String(env.BEP_AGENT_GROQ_MODEL||"openai/gpt-oss-20b").trim()};
 }
 if(provider==="gemini"){
  const apiKey=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim();
  return{provider,apiKey,keySource:apiKey?"dedicated_gemini":"missing",model:"gemini-3.8-flash"};
 }
 return{provider,apiKey:"",keySource:"missing",model:""};
}
function readDocumentaryWorkerConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true",workerMode=env.BEP_AGENT_RUN_AS_WORKER==="true",onDemandMode=env.BEP_AGENT_RUN_MODE==="admin_on_demand",freeTierAcknowledged=env.BEP_AGENT_FREE_TIER_ACKNOWLEDGED==="true";
 const resolved=resolveAdminProvider(env),pollMs=Math.max(5000,Math.min(60000,Number(env.BEP_AGENT_POLL_MS)||15000));
 const enabled=requested&&workerMode&&onDemandMode&&freeTierAcknowledged&&resolved.provider==="groq"&&!!resolved.apiKey;
 let disabledReason="";
 if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";
 else if(!workerMode)disabledReason="dedicated documentary worker mode is required";
 else if(!onDemandMode)disabledReason="BEP_AGENT_RUN_MODE must be admin_on_demand";
 else if(!freeTierAcknowledged)disabledReason="free-tier usage acknowledgement is missing";
 else if(resolved.provider!=="groq")disabledReason="documentary worker requires the dedicated Groq provider";
 else if(!resolved.apiKey)disabledReason="dedicated Groq API key is missing";
 return Object.freeze({enabled,requested,workerMode,onDemandMode,freeTierAcknowledged,provider:resolved.provider,apiKey:resolved.apiKey,keySource:resolved.keySource,model:resolved.model,pollMs,maxCallsPerDay:Math.max(1,Math.min(8,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8)),maxOutputTokens:Math.max(256,Math.min(4096,Number(env.BEP_AGENT_MAX_OUTPUT_TOKENS)||1800)),disabledReason});
}
function readAdminConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true";
 const onDemandMode=env.BEP_AGENT_RUN_MODE==="admin_on_demand";
 const freeTierAcknowledged=env.BEP_AGENT_FREE_TIER_ACKNOWLEDGED==="true";
 const resolved=resolveAdminProvider(env);
 const apiKey=resolved.apiKey;
 const maxCallsPerDay=Math.max(1,Math.min(8,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8));
 const maxOutputTokens=Math.max(256,Math.min(4096,Number(env.BEP_AGENT_MAX_OUTPUT_TOKENS)||1800));
 const enabled=requested&&onDemandMode&&freeTierAcknowledged&&!!apiKey;
 let disabledReason="";
 if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";
 else if(!onDemandMode)disabledReason="BEP_AGENT_RUN_MODE must be admin_on_demand";
 else if(!freeTierAcknowledged)disabledReason="free-tier usage acknowledgement is missing";
 else if(!apiKey)disabledReason=resolved.provider==="groq"?"dedicated Groq API key is missing":"dedicated Gemini API key is missing";
 return Object.freeze({enabled,requested,onDemandMode,freeTierAcknowledged,apiKey,keySource:resolved.keySource,provider:resolved.provider,model:resolved.model,maxCallsPerDay,maxOutputTokens,disabledReason});
}
module.exports={readConfig,readAdminConfig,readDocumentaryWorkerConfig,resolveAdminProvider,resolveAdminGeminiKey};
