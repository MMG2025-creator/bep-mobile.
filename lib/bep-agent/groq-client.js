"use strict";
const {GeminiDiagnosticError,sanitizeProviderMessage}=require("./gemini-client");
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
  try{
   const raw=await response.text();
   if(raw){try{data=JSON.parse(raw)}catch(error){if(response.ok)throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","Groq a retourné un corps JSON invalide.",{httpStatus:response.status,cause:error})}}
  }catch(error){if(error instanceof GeminiDiagnosticError)throw error;throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","La réponse de Groq n'a pas pu être lue.",{httpStatus:response.status,cause:error})}
  if(!response.ok){
   const providerError=data.error||{};
   const providerMessage=sanitizeProviderMessage(providerError.message,this.apiKey)||null;
   const providerCode=typeof providerError.code==="string"?providerError.code:null;
   const providerStatus=typeof providerError.type==="string"?providerError.type:null;
   const status=response.status;
   const quota=status===429||/rate_limit|quota/i.test(String(providerCode||providerStatus||""));
   throw new GeminiDiagnosticError(quota?"GROQ_QUOTA_EXCEEDED":"GROQ_HTTP_ERROR","Groq a retourné une erreur HTTP "+status+".",{httpStatus:status,providerCode,providerStatus,providerMessage,retryable:quota||status>=500});
  }
  const content=data.choices?.[0]?.message?.content;
  if(typeof content!=="string"||!content.trim())throw new GeminiDiagnosticError("GROQ_EMPTY_RESPONSE","Groq a répondu sans contenu exploitable.",{httpStatus:response.status});
  try{return{value:JSON.parse(content),usage:data.usage||null}}
  catch(error){throw new GeminiDiagnosticError("GROQ_INVALID_RESPONSE","Le contenu retourné par Groq n'est pas un JSON valide.",{httpStatus:response.status,cause:error})}
 }
}
module.exports={GroqClient};
