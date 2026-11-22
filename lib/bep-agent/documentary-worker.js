"use strict";
const crypto=require("node:crypto");
const {readDocumentaryWorkerConfig}=require("./config");
const {GroqClient}=require("./groq-client");
const {processOne}=require("./worker");
const {readSourceSearchConfig}=require("./source-search");

async function startDocumentaryWorker({pool,env=process.env,logger=console}={}){
 const config=readDocumentaryWorkerConfig(env);
 if(!config.enabled)throw new Error("BEP documentary worker refused to start: "+config.disabledReason);
 if(!readSourceSearchConfig(env).enabled)throw new Error("BEP documentary worker refused to start: dedicated Exa source search is not configured");
 if(!pool)throw new Error("BEP_AGENT_DATABASE_URL pool is required");
 const client=new GroqClient({apiKey:config.apiKey,model:config.model,timeoutMs:20000});
 const workerId="bep-documentary-worker-"+crypto.randomUUID();
 let stopped=false,busy=false,activeTick=null;
 async function tick(){
  if(stopped||busy)return;
  busy=true;
  activeTick=(async()=>{
   try{await processOne({pool,client,model:config.model,workerId,maxCallsPerDay:config.maxCallsPerDay,maxOutputTokens:config.maxOutputTokens,env,jobTypes:["documentary_research"]})}
   catch(error){logger.error?.("BEP documentary worker error:",String(error?.message||error).slice(0,180))}
   finally{busy=false;activeTick=null}
  })();
  return activeTick;
 }
 const poll=setInterval(()=>void tick(),config.pollMs);poll.unref?.();
 void tick();
 logger.info?.("BEP documentary worker started",JSON.stringify({provider:"groq",model:config.model,pollMs:config.pollMs,maxCallsPerDay:config.maxCallsPerDay,searchProvider:"exa"}));
 return{enabled:true,workerId,async stop(){stopped=true;clearInterval(poll);if(activeTick)await activeTick;return true}};
}
module.exports={startDocumentaryWorker};
