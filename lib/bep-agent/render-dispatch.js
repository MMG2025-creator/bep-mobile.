"use strict";

const API_ROOT="https://api.render.com/v1";
function readRenderDispatchConfig(env=process.env){
 const token=String(env.RENDER_API_KEY||"").trim();
 const taskSlug=String(env.BEP_AGENT_RENDER_TASK_SLUG||"").trim();
 const validTaskSlug=/^[a-z0-9][a-z0-9-]{0,62}\/[A-Za-z][A-Za-z0-9_-]{0,62}(?::[A-Za-z0-9._-]{1,100})?$/.test(taskSlug);
 return Object.freeze({enabled:!!token&&validTaskSlug,token,taskSlug,reason:!token?"Render API key is missing":!validTaskSlug?"Render documentary task slug is missing or invalid":null});
}
async function dispatchDocumentaryWorkflow({jobId,env=process.env,fetchImpl=fetch,timeoutMs=10000}={}){
 const config=readRenderDispatchConfig(env);
 if(!config.enabled)throw Object.assign(new Error("DOCUMENTARY_RENDER_DISPATCH_NOT_CONFIGURED"),{code:"DOCUMENTARY_RENDER_DISPATCH_NOT_CONFIGURED"});
 const id=String(jobId||"").trim();
 if(!/^[1-9]\d{0,18}$/.test(id))throw Object.assign(new Error("DOCUMENTARY_JOB_ID_INVALID"),{code:"DOCUMENTARY_JOB_ID_INVALID"});
 let response,data;
 try{
  response=await fetchImpl(API_ROOT+"/task-runs",{method:"POST",redirect:"error",signal:AbortSignal.timeout(timeoutMs),headers:{Accept:"application/json","Content-Type":"application/json",Authorization:"Bearer "+config.token},body:JSON.stringify({task:config.taskSlug,input:[id],idempotencyKey:"bep-documentary-"+id})});
  data=await response.json().catch(()=>({}));
 }catch(error){
  const code=error?.name==="TimeoutError"?"DOCUMENTARY_RENDER_DISPATCH_TIMEOUT":"DOCUMENTARY_RENDER_DISPATCH_NETWORK_ERROR";
  throw Object.assign(new Error(code),{code});
 }
 if(response.status!==202){
  const status=Number(response.status)||0;
  const code=status===429?"DOCUMENTARY_RENDER_RATE_LIMITED":"DOCUMENTARY_RENDER_DISPATCH_HTTP_"+status;
  throw Object.assign(new Error(code),{code,httpStatus:status});
 }
 const taskRunId=String(data?.id||"").trim();
 if(!/^trn-[A-Za-z0-9]+$/.test(taskRunId))throw Object.assign(new Error("DOCUMENTARY_RENDER_RUN_ID_MISSING"),{code:"DOCUMENTARY_RENDER_RUN_ID_MISSING"});
 return{dispatched:true,taskSlug:config.taskSlug,taskRunId,status:String(data.status||"pending")};
}
module.exports={readRenderDispatchConfig,dispatchDocumentaryWorkflow};
