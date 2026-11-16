"use strict";
const crypto=require("node:crypto");
const {readAdminConfig}=require("./config");
const {GeminiClient}=require("./gemini-client");
const {processOne}=require("./worker");

let running=false;

function adminAgentStatus(env=process.env){
 return readAdminConfig(env);
}

function scheduleAdminAgentRun({pool,logger=console,env=process.env,maxJobs=2}={}){
 const config=readAdminConfig(env);
 if(!config.enabled)return{scheduled:false,reason:config.disabledReason};
 if(!pool)return{scheduled:false,reason:"database pool is unavailable"};
 if(running)return{scheduled:false,busy:true};
 running=true;
 setImmediate(async()=>{
  try{
   const client=new GeminiClient({apiKey:config.apiKey,model:config.model});
   const workerId="bep-admin-on-demand-"+crypto.randomUUID();
   for(let i=0;i<Math.max(1,Math.min(2,Number(maxJobs)||2));i++){
    const processed=await processOne({pool,client,model:config.model,workerId,maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens});
    if(!processed)break;
   }
  }catch(error){
   logger.error?.("BEP admin Gemini run failed:",String(error?.message||error).slice(0,180));
  }finally{
   running=false;
  }
 });
 return{scheduled:true};
}

module.exports={adminAgentStatus,scheduleAdminAgentRun};
