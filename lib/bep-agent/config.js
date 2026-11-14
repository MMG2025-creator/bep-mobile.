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
 return Object.freeze({enabled,requested,workerMode,billingConfirmed,apiKey,keySource:apiKey?"dedicated":"missing",model,maxCallsPerDay,maxOutputTokens,pollMs,monthlyBudget,disabledReason});
}
module.exports={readConfig};
