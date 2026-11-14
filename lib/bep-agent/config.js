"use strict";

function readConfig(env=process.env){
 const requested=env.BEP_AGENT_ENABLED==="true";
 const billingConfirmed=env.BEP_AGENT_ZERO_BILLING_CONFIRMED==="true";
 const apiKey=String(env.BEP_AGENT_GEMINI_API_KEY||"").trim();
 const model=String(env.BEP_AGENT_GEMINI_MODEL||"gemini-3.8-flash").trim();
 const maxCallsPerDay=Math.max(1,Math.min(50,Number(env.BEP_AGENT_MAX_CALLS_PER_DAY)||8));
 const pollMs=Math.max(5000,Math.min(60000,Number(env.BEP_AGENT_POLL_MS)||15000));
 const enabled=requested&&billingConfirmed&&!!apiKey;
 let disabledReason="";
 if(!requested)disabledReason="BEP_AGENT_ENABLED is not true";
 else if(!billingConfirmed)disabledReason="zero-billing confirmation is missing";
 else if(!apiKey)disabledReason="dedicated Gemini API key is missing";
 return Object.freeze({enabled,requested,billingConfirmed,apiKey,model,maxCallsPerDay,pollMs,disabledReason});
}
module.exports={readConfig};
