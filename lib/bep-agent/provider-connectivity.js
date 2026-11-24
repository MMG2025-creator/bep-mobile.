"use strict";

const {readSourceSearchConfig,searchDocumentarySources}=require("./source-search");
const {resolveAdminProvider}=require("./config");
const {GroqClient}=require("./groq-client");

const CONNECTIVITY_SCHEMA={name:"bep_provider_connectivity",schema:{
 type:"object",additionalProperties:false,
 properties:{ok:{type:"boolean"}},required:["ok"]
}};

function safeDiagnosticValue(value,env,limit){
 let text=String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
 const apiKey=String(env?.BEP_AGENT_GROQ_API_KEY||"");
 if(apiKey.length>=8)text=text.split(apiKey).join("[REDACTED]");
 return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi,"Bearer [TOKEN_REMOVED]")
  .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{12,}\b/gi,"[REDACTED]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[REDACTED_EMAIL]")
  .slice(0,limit);
}

function captureGroqFailure(error,env){
 return {
  diagnosticCode:safeDiagnosticValue(error?.diagnosticCode||error?.code||"GROQ_ERROR",env,80),
  httpStatus:Number(error?.httpStatus)||null,
  providerCode:typeof error?.providerCode==="string"?safeDiagnosticValue(error.providerCode,env,100):null,
  providerStatus:typeof error?.providerStatus==="string"?safeDiagnosticValue(error.providerStatus,env,100):null,
  providerMessage:typeof error?.providerMessage==="string"?safeDiagnosticValue(error.providerMessage,env,500):null,
  providerParam:typeof error?.providerParam==="string"?safeDiagnosticValue(error.providerParam,env,100):null,
  providerFailedGeneration:typeof error?.providerFailedGeneration==="string"?safeDiagnosticValue(error.providerFailedGeneration,env,1200):null,
  providerResponseBody:typeof error?.providerResponseBody==="string"?safeDiagnosticValue(error.providerResponseBody,env,4000):null,
  providerResponseKeys:Array.isArray(error?.providerResponseKeys)?error.providerResponseKeys.slice(0,30):[],
  providerErrorKeys:Array.isArray(error?.providerErrorKeys)?error.providerErrorKeys.slice(0,30):[],
  retryable:error?.retryable===true
 };
}

async function runGroqPromptTokenMatrix({client,model,env}){
 const cases=[
  {id:"T1_reference",prompt:"Return {ok:true}.",maxOutputTokens:32},
  {id:"T2_prompt_corrected",prompt:'Return {"ok":true}.',maxOutputTokens:32},
  {id:"T3_token_limit_increased",prompt:"Return {ok:true}.",maxOutputTokens:256},
  {id:"T4_both_changes",prompt:'Return {"ok":true}.',maxOutputTokens:256}
 ];
 const results=[];
 for(const item of cases){
  const startedAt=Date.now();
  try{
   const response=await client.generateJson({
    system:"Connectivity check. Return only the required JSON object.",
    prompt:item.prompt,maxOutputTokens:item.maxOutputTokens,jsonSchema:CONNECTIVITY_SCHEMA
   });
   results.push({
    id:item.id,promptVariant:item.id.includes("prompt_corrected")||item.id==="T4_both_changes"?"json_key_quoted":"original",
    requestedMaxTokens:item.maxOutputTokens,status:response?.value?.ok===true?"passed":"invalid_result",
    model,usage:response?.usage||null,durationMs:Date.now()-startedAt
   });
  }catch(error){
   results.push({
    id:item.id,promptVariant:item.id.includes("prompt_corrected")||item.id==="T4_both_changes"?"json_key_quoted":"original",
    requestedMaxTokens:item.maxOutputTokens,status:"failed",model,
    ...captureGroqFailure(error,env),durationMs:Date.now()-startedAt
   });
  }
 }
 return Object.freeze({status:results.every(item=>item.status==="passed")?"passed":"diagnostic_completed",model,cases:results});
}

async function runProviderConnectivityCheck({env=process.env,search=searchDocumentarySources,Groq=GroqClient,diagnosticMatrix=false}={}){
 const exaConfig=readSourceSearchConfig(env);
 if(!exaConfig.enabled)throw Object.assign(new Error("PROVIDER_CHECK_EXA_NOT_CONFIGURED"),{stage:"exa"});
 let exa;
 try{
  exa=await search({query:"budget familial aides financières",env,numResults:1});
 }catch(error){
  throw Object.assign(new Error("PROVIDER_CHECK_EXA_FAILED"),{stage:"exa",providerCode:String(error?.code||"SOURCE_SEARCH_ERROR").slice(0,80),httpStatus:Number(error?.httpStatus)||null});
 }
 const groqConfig=resolveAdminProvider(env);
 if(groqConfig.provider!=="groq"||!groqConfig.apiKey)throw Object.assign(new Error("PROVIDER_CHECK_GROQ_NOT_CONFIGURED"),{stage:"groq"});
 const client=new Groq({apiKey:groqConfig.apiKey,model:groqConfig.model,timeoutMs:15000});
 if(diagnosticMatrix){
  const matrix=await runGroqPromptTokenMatrix({client,model:groqConfig.model,env});
  return Object.freeze({
   status:matrix.status,
   mode:"diagnostic_prompt_token_matrix",
   exa:{status:"authenticated",httpStatus:200,resultsCount:Number(exa?.resultsCount)||0},
   groq:matrix
  });
 }
 try{
  const response=await client.generateJson({
   system:"Connectivity check. Return only the required JSON object.",
   prompt:"Return {ok:true}.",
   maxOutputTokens:32,
   jsonSchema:CONNECTIVITY_SCHEMA
  });
  if(response?.value?.ok!==true)throw new Error("GROQ_CHECK_INVALID_RESULT");
 }catch(error){
  const diagnostics=captureGroqFailure(error,env);
  const details=[diagnostics.diagnosticCode];
  if(diagnostics.httpStatus)details.push("HTTP "+diagnostics.httpStatus);
  if(diagnostics.providerCode)details.push("code="+diagnostics.providerCode);
  if(diagnostics.providerStatus)details.push("type="+diagnostics.providerStatus);
  if(diagnostics.providerParam)details.push("param="+diagnostics.providerParam);
  if(diagnostics.providerMessage)details.push("detail="+diagnostics.providerMessage);
  if(diagnostics.providerFailedGeneration)details.push("failed_generation="+diagnostics.providerFailedGeneration);
  throw Object.assign(new Error("PROVIDER_CHECK_GROQ_FAILED: "+details.join(" | ").slice(0,1800)),{stage:"groq",...diagnostics});
 }
 return Object.freeze({
  status:"passed",
  exa:{status:"authenticated",httpStatus:200,resultsCount:Number(exa?.resultsCount)||0},
  groq:{status:"authenticated",model:groqConfig.model}
 });
}
module.exports={runProviderConnectivityCheck,runGroqPromptTokenMatrix,CONNECTIVITY_SCHEMA};
