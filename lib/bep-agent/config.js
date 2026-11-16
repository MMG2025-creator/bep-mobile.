"use strict";
function readConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true",workerMode=env.BEP_AGENT_RUN_AS_WORKER==="true",billingConfirmed=env.BEP_AGENT_BILLING_APPROVED==="true";
 const freeAdminMode=env.BEP_AGENT_RUN_MODE==="admin_on_demand"&&env.BEP_AGENT_FREE_TIER_ACKNOWLEDGED==="true";
 const apiKey=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim(),model=String(env.BEP_AGENT_GEMINI_MODEL||"gemini-3.8-flash").trim();
 const maxCallsPerDay=Math.max(1,Math.min(freeAdminMode?8:50,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8));
 const maxOutputTokens=Math.max(256,Math.min(4096,Number(env.BEP_AGENT_MAX_OUTPUT_TOKENS)||1800)),pollMs=Math.max(5000,Math.min(60000,Number(env.BEP_AGENT_POLL_MS)||15000));
 const monthlyBudget=Number(env.BEP_AGENT_MONTHLY_BUDGET_USD),budgetConfigured=Number.isFinite(monthlyBudget)&&monthlyBudget>0;
 const enabled=requested&&workerMode&&!!apiKey&&(freeAdminMode||(billingConfirmed&&budgetConfigured));
 let disabledReason="";
 if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";else if(!workerMode)disabledReason="supervisor must run in its dedicated worker process";else if(!apiKey)disabledReason="dedicated Gemini API key is missing";else if(!freeAdminMode&&!billingConfirmed)disabledReason="explicit billing approval is missing";else if(!freeAdminMode&&!budgetConfigured)disabledReason="monthly USD budget is missing or invalid";
 return Object.freeze({enabled,requested,workerMode,billingConfirmed,freeAdminMode,apiKey,keySource:apiKey?"dedicated":"missing",model,maxCallsPerDay,maxOutputTokens,pollMs,monthlyBudget,disabledReason});
}
function readAdminConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true",onDemandMode=env.BEP_AGENT_RUN_MODE==="admin_on_demand",freeTierAcknowledged=env.BEP_AGENT_FREE_TIER_ACKNOWLEDGED==="true",apiKey=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim(),model="gemini-3.8-flash";
 const maxCallsPerDay=Math.max(1,Math.min(8,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8)),maxOutputTokens=Math.max(256,Math.min(4096,Number(env.BEP_AGENT_MAX_OUTPUT_TOKENS)||1800));
 const enabled=requested&&onDemandMode&&freeTierAcknowledged&&!!apiKey;
 let disabledReason="";if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";else if(!onDemandMode)disabledReason="BEP_AGENT_RUN_MODE must be admin_on_demand";else if(!freeTierAcknowledged)disabledReason="free-tier usage acknowledgement is missing";else if(!apiKey)disabledReason="dedicated Gemini API key is missing";
 return Object.freeze({enabled,requested,onDemandMode,freeTierAcknowledged,apiKey,keySource:apiKey?"dedicated":"missing",model,maxCallsPerDay,maxOutputTokens,disabledReason});
}
module.exports={readConfig,readAdminConfig};
