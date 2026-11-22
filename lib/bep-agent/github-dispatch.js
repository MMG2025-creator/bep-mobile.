"use strict";

const API_ROOT="https://api.github.com";
function readDocumentaryDispatchConfig(env=process.env){
 const token=String(env.BEP_AGENT_GITHUB_DISPATCH_TOKEN||"").trim();
 const repository=String(env.BEP_AGENT_GITHUB_REPOSITORY||"").trim();
 const workflow=String(env.BEP_AGENT_GITHUB_WORKFLOW_ID||"bep-documentary-on-demand.yml").trim();
 const ref=String(env.BEP_AGENT_GITHUB_REF||"").trim();
 const validRepository=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
 const validWorkflow=/^[A-Za-z0-9_.-]+$/.test(workflow);
 const validRef=!!ref&&ref.length<=255&&!/[\s~^:?*\[\\]/.test(ref)&&!ref.startsWith("/")&&!ref.endsWith("/");
 return Object.freeze({enabled:!!token&&validRepository&&validWorkflow&&validRef,token,repository,workflow,ref,reason:!token?"GitHub dispatch credential is missing":!validRepository?"GitHub repository is invalid":!validWorkflow?"GitHub workflow identifier is invalid":!validRef?"GitHub workflow ref is invalid":null});
}
async function dispatchDocumentaryWorkflow({jobId,env=process.env,fetchImpl=fetch,timeoutMs=10000}={}){
 const config=readDocumentaryDispatchConfig(env);
 if(!config.enabled)throw Object.assign(new Error("DOCUMENTARY_DISPATCH_NOT_CONFIGURED"),{code:"DOCUMENTARY_DISPATCH_NOT_CONFIGURED"});
 const id=String(jobId||"").trim();
 if(!/^[0-9a-f-]{8,64}$/i.test(id))throw Object.assign(new Error("DOCUMENTARY_JOB_ID_INVALID"),{code:"DOCUMENTARY_JOB_ID_INVALID"});
 const [owner,repo]=config.repository.split("/");
 const url=API_ROOT+"/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/actions/workflows/"+encodeURIComponent(config.workflow)+"/dispatches";
 let response;
 try{
  response=await fetchImpl(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(timeoutMs),headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+config.token,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({ref:config.ref,inputs:{job_id:id}})});
 }catch(error){throw Object.assign(new Error(error?.name==="TimeoutError"?"DOCUMENTARY_DISPATCH_TIMEOUT":"DOCUMENTARY_DISPATCH_NETWORK_ERROR"),{code:error?.name==="TimeoutError"?"DOCUMENTARY_DISPATCH_TIMEOUT":"DOCUMENTARY_DISPATCH_NETWORK_ERROR"})}
 if(response.status!==204)throw Object.assign(new Error("DOCUMENTARY_DISPATCH_HTTP_"+(Number(response.status)||0)),{code:"DOCUMENTARY_DISPATCH_FAILED",httpStatus:Number(response.status)||0});
 return{dispatched:true,workflow:config.workflow,ref:config.ref};
}
module.exports={readDocumentaryDispatchConfig,dispatchDocumentaryWorkflow};
