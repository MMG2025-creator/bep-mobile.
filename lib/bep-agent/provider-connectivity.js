"use strict";

const {readSourceSearchConfig,searchDocumentarySources}=require("./source-search");
const {resolveAdminProvider}=require("./config");
const {GroqClient}=require("./groq-client");

const CONNECTIVITY_SCHEMA={name:"bep_provider_connectivity",schema:{
 type:"object",additionalProperties:false,
 properties:{ok:{type:"boolean"}},required:["ok"]
}};

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
  throw Object.assign(new Error("PROVIDER_CHECK_GROQ_FAILED"),{stage:"groq",diagnosticCode:String(error?.diagnosticCode||"GROQ_ERROR").slice(0,80),providerCode:String(error?.providerCode||error?.code||"").slice(0,80)||null,providerStatus:String(error?.providerStatus||"").slice(0,80)||null,providerMessage:String(error?.providerMessage||"").slice(0,500)||null,providerParam:String(error?.providerParam||"").slice(0,80)||null,httpStatus:Number(error?.httpStatus)||null});
 }
 return Object.freeze({
  status:"passed",
  exa:{status:"authenticated",httpStatus:200,resultsCount:Number(exa?.resultsCount)||0},
  groq:{status:"authenticated",model:groqConfig.model}
 });
}
module.exports={runProviderConnectivityCheck,CONNECTIVITY_SCHEMA};
