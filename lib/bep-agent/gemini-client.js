"use strict";
class GeminiDiagnosticError extends Error{
 constructor(code,detail,{httpStatus=null,retryable=false,providerCode=null,providerStatus=null,providerMessage=null,cause}={}){super(detail,cause?{cause}:undefined);this.name="GeminiDiagnosticError";this.diagnosticCode=code;this.diagnosticDetail=detail;this.httpStatus=httpStatus;this.retryable=retryable;this.providerCode=providerCode;this.providerStatus=providerStatus;this.providerMessage=providerMessage;}
}
function sanitizeProviderMessage(value,apiKey){
 let message=String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
 if(apiKey&&String(apiKey).length>=8)message=message.split(String(apiKey)).join("[REDACTED]");
 message=message.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g,"[REDACTED]");
 message=message.replace(/\bBearer\s+\S+/gi,"Bearer [REDACTED]");
 message=message.replace(/\b(?:sk|key|token)[-_][A-Za-z0-9_-]{12,}\b/gi,"[REDACTED]");
 message=message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[REDACTED_EMAIL]");
 return message.slice(0,500);
}
function classifyHttpError(status,body,apiKey){
 const providerError=body?.error||{};
 const providerStatus=typeof providerError.status==="string"&&/^[A-Z][A-Z0-9_]{0,63}$/.test(providerError.status)?providerError.status:null;
 const providerCode=Number.isInteger(providerError.code)?providerError.code:null;
 const providerMessage=sanitizeProviderMessage(providerError.message,apiKey)||null;
 const metadata={httpStatus:status,providerCode,providerStatus,providerMessage};
 const gs=String(providerStatus||"").toUpperCase(),gm=String(providerMessage||"").toLowerCase();
 if(status===401)return new GeminiDiagnosticError("GEMINI_AUTH_ERROR","Google a refusé la clé API (HTTP 401).",{...metadata});
 if(status===403){if(gs==="RESOURCE_EXHAUSTED"||/quota|rate.?limit|resource exhausted/.test(gm))return new GeminiDiagnosticError("GEMINI_QUOTA_EXCEEDED","Le quota ou la limite de débit Google est dépassé (HTTP 403).",{...metadata,retryable:true});return new GeminiDiagnosticError("GEMINI_PERMISSION_ERROR","La clé est reconnue, mais le projet ou l'API ne dispose pas des permissions requises (HTTP 403).",{...metadata});}
 if(status===429)return new GeminiDiagnosticError("GEMINI_QUOTA_EXCEEDED","Le quota ou la limite de débit Google est dépassé (HTTP 429).",{...metadata,retryable:true});
 if(status===400&&gs==="INVALID_ARGUMENT")return new GeminiDiagnosticError("GEMINI_INVALID_ARGUMENT","Google a rejeté un ou plusieurs paramètres de la requête (INVALID_ARGUMENT).",{...metadata});
 return new GeminiDiagnosticError("GEMINI_HTTP_ERROR","Google Gemini a retourné une erreur HTTP "+status+".",{...metadata,retryable:status>=500});
}
class GeminiClient{
 constructor({apiKey,model,timeoutMs=30000}){if(!apiKey)throw new Error("Gemini agent API key is missing");this.apiKey=apiKey;this.model=model;this.timeoutMs=timeoutMs;}
 async generateJson({system,prompt,maxOutputTokens=1800}){
  const url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(this.model)+":generateContent";let response;
  try{response=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(this.timeoutMs),headers:{"content-type":"application/json","x-goog-api-key":this.apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:String(system||"")}]},contents:[{role:"user",parts:[{text:String(prompt||"")}]}],generationConfig:{temperature:0.1,maxOutputTokens,responseMimeType:"application/json"}})});}
  catch(error){const timeout=error?.name==="TimeoutError"||error?.name==="AbortError";throw new GeminiDiagnosticError(timeout?"GEMINI_TIMEOUT":"GEMINI_NETWORK_ERROR",timeout?"Le délai maximal de connexion à Google Gemini est dépassé.":"La connexion réseau à Google Gemini a échoué.",{retryable:true,cause:error});}
  let data={};
  try{
   if(typeof response.text==="function"){
    const raw=await response.text();
    if(raw){try{data=JSON.parse(raw)}catch(error){if(response.ok)throw new GeminiDiagnosticError("GEMINI_INVALID_RESPONSE","Google Gemini a retourné un corps JSON invalide.",{httpStatus:response.status,cause:error});}}
   }else if(typeof response.json==="function"){
    data=await response.json();
   }else if(response.ok){
    throw new GeminiDiagnosticError("GEMINI_INVALID_RESPONSE","La réponse de Google Gemini ne contient pas de corps JSON lisible.",{httpStatus:response.status});
   }
  }catch(error){if(error instanceof GeminiDiagnosticError)throw error;throw new GeminiDiagnosticError("GEMINI_INVALID_RESPONSE","La réponse de Google Gemini n'a pas pu être lue.",{httpStatus:response.status,cause:error});}
  if(!response.ok)throw classifyHttpError(response.status,data,this.apiKey);
  const text=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();
  if(!text)throw new GeminiDiagnosticError("GEMINI_EMPTY_RESPONSE","Google Gemini a répondu sans contenu exploitable.",{httpStatus:response.status});
  try{return{value:JSON.parse(text),usage:data.usageMetadata||null};}catch(error){throw new GeminiDiagnosticError("GEMINI_INVALID_RESPONSE","Le contenu retourné par Gemini n'est pas un JSON valide.",{httpStatus:response.status,cause:error});}
 }
}
module.exports={GeminiClient,GeminiDiagnosticError,sanitizeProviderMessage};