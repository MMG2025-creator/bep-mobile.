"use strict";

const {readSourceSearchConfig,searchDocumentarySources}=require("./source-search");
const {resolveAdminProvider}=require("./config");
const {GroqClient}=require("./groq-client");

const CONNECTIVITY_SCHEMA={name:"bep_provider_connectivity",schema:{
 type:"object",additionalProperties:false,
 properties:{ok:{type:"boolean"}},required:["ok"]
}};

function safeDiagnosticValue(value,env,limit){
 let text=String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
 const apiKey=String(env?.BEP_AGENT_GROQ_API_KEY||"");
 if(apiKey.length>=8)text=text.split(apiKey).join("[REDACTED]");
 return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi,"Bearer [TOKEN_REMOVED]")
  .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{12,}\b/gi,"[REDACTED]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[REDACTED_EMAIL]")
  .slice(0,limit);
}

async function runProviderConnectivityCheck({env=process.env,search=searchDocumentarySources,Groq=GroqClient}={}){
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
 try{
  const client=new Groq({apiKey:groqConfig.apiKey,model:groqConfig.model,timeoutMs:15000});
  const response=await client.generateJson({
   system:"Connectivity check. Return only the required JSON object.",
   prompt:"Return {ok:true}.",
   maxOutputTokens:32,
   jsonSchema:CONNECTIVITY_SCHEMA
  });
  if(response?.value?.ok!==true)throw new Error("GROQ_CHECK_INVALID_RESULT");
 }catch(error){
  const diagnosticCode=safeDiagnosticValue(error?.diagnosticCode||error?.code||"GROQ_ERROR",env,80);
  const providerCode=typeof error?.providerCode==="string"?safeDiagnosticValue(error.providerCode,env,100):null;
  const providerStatus=typeof error?.providerStatus==="string"?safeDiagnosticValue(error.providerStatus,env,100):null;
  const providerMessage=typeof error?.providerMessage==="string"?safeDiagnosticValue(error.providerMessage,env,500):null;
  const providerParam=typeof error?.providerParam==="string"?safeDiagnosticValue(error.providerParam,env,100):null;
  const providerFailedGeneration=typeof error?.providerFailedGeneration==="string"?safeDiagnosticValue(error.providerFailedGeneration,env,1200):null;
  const providerResponseBody=typeof error?.providerResponseBody==="string"?safeDiagnosticValue(error.providerResponseBody,env,4000):null;
  const providerResponseKeys=Array.isArray(error?.providerResponseKeys)?error.providerResponseKeys.slice(0,30):[];
  const providerErrorKeys=Array.isArray(error?.providerErrorKeys)?error.providerErrorKeys.slice(0,30):[];
  const httpStatus=Number(error?.httpStatus)||null;
  const retryable=error?.retryable===true;
  const details=[diagnosticCode];
  if(httpStatus)details.push("HTTP "+httpStatus);
  if(providerCode)details.push("code="+providerCode);
  if(providerStatus)details.push("type="+providerStatus);
  if(providerParam)details.push("param="+providerParam);
  if(providerMessage)details.push("detail="+providerMessage);
  if(providerFailedGeneration)details.push("failed_generation="+providerFailedGeneration);
  throw Object.assign(new Error("PROVIDER_CHECK_GROQ_FAILED: "+details.join(" | ").slice(0,1800)),{
   stage:"groq",diagnosticCode,providerCode,providerStatus,providerMessage,providerParam,providerFailedGeneration,
   providerResponseBody,providerResponseKeys,providerErrorKeys,httpStatus,retryable
  });
 }
 return Object.freeze({
  status:"passed",
  exa:{status:"authenticated",httpStatus:200,resultsCount:Number(exa?.resultsCount)||0},
  groq:{status:"authenticated",model:groqConfig.model}
 });
}
module.exports={runProviderConnectivityCheck,CONNECTIVITY_SCHEMA};
