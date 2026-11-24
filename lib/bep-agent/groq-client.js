"use strict";
const {GeminiDiagnosticError,sanitizeProviderMessage}=require("./gemini-client");

function sanitizeProviderDiagnostic(value,apiKey,limit=1200){
 let text=String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
 if(apiKey&&String(apiKey).length>=8)text=text.split(String(apiKey)).join("[REDACTED]");
 return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi,"Bearer [TOKEN_REMOVED]")
  .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{12,}\b/gi,"[REDACTED]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[REDACTED_EMAIL]")
  .slice(0,limit);
}

class GroqClient{
 constructor({apiKey,model="openai/gpt-oss-20b",timeoutMs=30000}){
  if(!apiKey)throw new Error("Groq agent API key is missing");
  this.apiKey=apiKey;this.model=model;this.timeoutMs=timeoutMs;
 }
 async generateJson({system,prompt,maxOutputTokens=1800,jsonSchema}){
  if(!jsonSchema||typeof jsonSchema!=='object'||!jsonSchema.schema||typeof jsonSchema.name!=='string')throw new TypeError('Groq structured output schema is required');
  let response;
  try{
   response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(this.timeoutMs),
    headers:{"content-type":"application/json","authorization":"Bearer "+this.apiKey},
    body:JSON.stringify({model:this.model,messages:[{role:"system",content:String(system||"")},{role:"user",content:String(prompt||"")}],temperature:0.1,max_tokens:maxOutputTokens,response_format:{type:"json_schema",json_schema:{name:jsonSchema.name,strict:true,schema:jsonSchema.schema}}})
   });
  }catch(error){
   const timeout=error?.name==="TimeoutError"||error?.name==="AbortError";
   throw new GeminiDiagnosticError(timeout?"GROQ_TIMEOUT":"GROQ_NETWORK_ERROR",timeout?"Le délai maximal de connexion à Groq est dépassé.":"La connexion réseau à Groq a échoué.",{retryable:true,cause:error});
  }
  let data={};
  let rawBody="";
  try{
   rawBody=await response.text();
   if(rawBody){try{data=JSON.parse(rawBody)}catch(error){if(response.ok)throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","Groq a retourné un corps JSON invalide.",{httpStatus:response.status,cause:error})}}
  }catch(error){if(error instanceof GeminiDiagnosticError)throw error;throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","La réponse de Groq n'a pas pu être lue.",{httpStatus:response.status,cause:error})}
  if(!response.ok){
   const providerError=data.error||{};
   const providerMessage=sanitizeProviderMessage(providerError.message,this.apiKey)||null;
   const providerCode=typeof providerError.code==="string"?providerError.code:null;
   const providerStatus=typeof providerError.type==="string"?providerError.type:null;
   const providerParam=typeof providerError.param==="string"?sanitizeProviderMessage(providerError.param,this.apiKey).slice(0,100)||null:null;
   const providerFailedGeneration=sanitizeProviderDiagnostic(providerError.failed_generation??data.failed_generation,this.apiKey,1200)||null;
   const providerResponseBody=sanitizeProviderDiagnostic(rawBody,this.apiKey,4000)||null;
   const providerResponseKeys=Object.keys(data||{}).slice(0,30);
   const providerErrorKeys=Object.keys(providerError||{}).slice(0,30);
   const status=response.status;
   const quota=status===429||/rate_limit|quota/i.test(String(providerCode||providerStatus||""));
   const detail="Groq HTTP "+status+
    (providerCode?" | code="+sanitizeProviderMessage(providerCode,this.apiKey):"")+
    (providerStatus?" | type="+sanitizeProviderMessage(providerStatus,this.apiKey):"")+
    (providerParam?" | param="+providerParam:"")+
    (providerMessage?" | detail="+providerMessage:"")+
    (providerFailedGeneration?" | failed_generation="+providerFailedGeneration:"");
   const diagnosticError=new GeminiDiagnosticError(quota?"GROQ_QUOTA_EXCEEDED":"GROQ_HTTP_ERROR",detail,{httpStatus:status,providerCode,providerStatus,providerMessage,providerParam,retryable:quota||status>=500});
   diagnosticError.providerFailedGeneration=providerFailedGeneration;
   diagnosticError.providerResponseBody=providerResponseBody;
   diagnosticError.providerResponseKeys=providerResponseKeys;
   diagnosticError.providerErrorKeys=providerErrorKeys;
   throw diagnosticError;
  }
  const content=data.choices?.[0]?.message?.content;
  if(typeof content!=="string"||!content.trim())throw new GeminiDiagnosticError("GROQ_EMPTY_RESPONSE","Groq a répondu sans contenu exploitable.",{httpStatus:response.status});
  try{return{value:JSON.parse(content),usage:data.usage||null}}
  catch(error){throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","Le contenu retourné par Groq n'est pas un JSON valide.",{httpStatus:response.status,cause:error})}
 }
}
module.exports={GroqClient,sanitizeProviderDiagnostic};
