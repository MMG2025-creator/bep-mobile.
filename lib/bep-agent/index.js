"use strict";
const crypto=require("node:crypto");
const {readConfig}=require("./config");
const {GeminiClient}=require("./gemini-client");
const repo=require("./repository");
const {processOne}=require("./worker");

async function startBepAgent({pool,logger=console,env=process.env}){
 const config=readConfig(env);
 if(!config.enabled){logger.info?.("BEP Gemini supervisor disabled:",config.disabledReason);return{enabled:false,stop(){}}}
 if(!pool)throw new Error("Dedicated supervisor database pool is required");
 const client=new GeminiClient({apiKey:config.apiKey,model:config.model});
 const workerId="bep-supervisor-"+crypto.randomUUID();
 let stopped=false,busy=false;
 async function enqueueDaily(){
  await repo.enqueue(pool,"knowledge_review");
  await repo.enqueue(pool,"coach_quality_review");
 }
 async function tick(){
  if(stopped||busy)return;busy=true;
  try{await processOne({pool,client,model:config.model,workerId,maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens})}
  catch(error){logger.error?.("BEP supervisor worker error:",String(error?.message||error).slice(0,180))}
  finally{busy=false}
 }
 await enqueueDaily();
 const poll=setInterval(tick,config.pollMs);poll.unref?.();
 const schedule=setInterval(()=>enqueueDaily().catch(e=>logger.error?.("BEP supervisor scheduling failed:",String(e?.message||e).slice(0,180))),6*60*60*1000);schedule.unref?.();
 void tick();
 logger.info?.("BEP Gemini supervisor started",JSON.stringify({model:config.model,pollMs:config.pollMs,maxCallsPerDay:config.maxCallsPerDay,monthlyBudgetUsd:config.monthlyBudget}));
 return{enabled:true,stop(){stopped=true;clearInterval(poll);clearInterval(schedule)}};
}
module.exports={startBepAgent};
