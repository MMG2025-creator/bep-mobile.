"use strict";

const ENDPOINT="https://api.exa.ai/search";
const DEFAULT_DOMAINS=Object.freeze([
 "www.mesdroitssociaux.gouv.fr","www.mesquestionsdargent.fr","mesquestionsdargent.fr",
 "www.amf-france.org","amf-france.org","www.service-public.gouv.fr","service-public.gouv.fr",
 "www.urssaf.fr","urssaf.fr"
]);
const MAX_QUERY_CHARS=1000,MAX_RESULTS=5,MAX_HIGHLIGHTS=3,MAX_HIGHLIGHT_CHARS=500,MAX_PAGE_TEXT_CHARS=3500;
function allowedDomain(host,domains){
 const value=String(host||"").toLowerCase().replace(/\.$/,"");
 return domains.includes(value);
}
function readSourceSearchConfig(env=process.env){
 const apiKey=String(env.BEP_AGENT_EXA_API_KEY||"").trim();
 const domains=String(env.BEP_AGENT_SOURCE_DOMAINS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 const allowedDomains=domains.length?domains:DEFAULT_DOMAINS;
 const enabled=env.BEP_AGENT_SOURCE_SEARCH_ENABLED==="true"&&!!apiKey&&allowedDomains.length>0;
 return Object.freeze({enabled,provider:"exa",apiKey,keySource:apiKey?"dedicated_exa":"missing",allowedDomains,reason:enabled?null:!env.BEP_AGENT_SOURCE_SEARCH_ENABLED?"source search is disabled":!apiKey?"dedicated Exa API key is missing":"source domain allowlist is empty"});
}
function sanitizeProviderMessage(value,apiKey){
 let message=String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 if(apiKey&&String(apiKey).length>=8)message=message.split(String(apiKey)).join('[REDACTED]');
 message=message.replace(/\bBearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\b(?:key|token)[-_][A-Za-z0-9_-]{12,}\b/gi,'[REDACTED]');
 return message.slice(0,400);
}
function safeDate(value){
 const raw=String(value||"").trim();
 if(raw.length>40||!/^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(raw))return null;
 const date=new Date(raw);
 return Number.isNaN(date.getTime())?null:date.toISOString();
}
function normalizeResult(item,domains){
 let url;
 try{url=new URL(String(item?.url||""))}catch{return null}
 if(url.protocol!=="https:"||url.username||url.password||url.port||!allowedDomain(url.hostname,domains))return null;
 url.hash="";
 const title=String(item?.title||"").trim().slice(0,180);
 const highlights=(Array.isArray(item?.highlights)?item.highlights:[])
  .slice(0,MAX_HIGHLIGHTS).map(x=>String(x||"").trim().slice(0,MAX_HIGHLIGHT_CHARS)).filter(Boolean);
 const text=String(item?.text||"").trim().slice(0,MAX_PAGE_TEXT_CHARS);
 if(!title||(!highlights.length&&!text))return null;
 return{title,url:url.href,domain:url.hostname.toLowerCase(),publishedAt:safeDate(item?.publishedDate),highlights,text};
}
async function searchDocumentarySources({query,env=process.env,fetchImpl=fetch,timeoutMs=15000,numResults=MAX_RESULTS}={}){
 const config=readSourceSearchConfig(env);
 if(!config.enabled)return{enabled:false,provider:config.provider,reason:config.reason,results:[]};
 const q=String(query||"").trim().slice(0,MAX_QUERY_CHARS);
 if(!q)throw new Error("SOURCE_SEARCH_QUERY_REQUIRED");
 const count=Math.max(1,Math.min(MAX_RESULTS,Number(numResults)||MAX_RESULTS));
 let response,data;
 try{
  response=await fetchImpl(ENDPOINT,{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(timeoutMs),
   headers:{"content-type":"application/json","x-api-key":config.apiKey},
   body:JSON.stringify({query:q,type:"auto",numResults:count,includeDomains:config.allowedDomains,contents:{text:{maxCharacters:MAX_PAGE_TEXT_CHARS},highlights:true}})
  });
  data=await response.json().catch(()=>({}));
 }catch(error){
  const timeout=error?.name==="TimeoutError"||error?.name==="AbortError";
  const wrapped=new Error(timeout?"SOURCE_SEARCH_TIMEOUT":"SOURCE_SEARCH_NETWORK_ERROR");
  wrapped.code=timeout?"SOURCE_SEARCH_TIMEOUT":"SOURCE_SEARCH_NETWORK_ERROR";
  throw wrapped;
 }
 if(!response.ok){
  const status=Number(response.status)||0;
  const providerError=data?.error||data?.message||null;
  const providerMessage=sanitizeProviderMessage(typeof providerError==="string"?providerError:providerError?.message,config.apiKey);
  const error=new Error("SOURCE_SEARCH_HTTP_"+status+(providerMessage?": "+providerMessage:""));
  error.code=status===429?"SOURCE_SEARCH_RATE_LIMIT":status===401?"SOURCE_SEARCH_AUTH_ERROR":"SOURCE_SEARCH_PROVIDER_ERROR";
  error.httpStatus=status;
  error.providerMessage=providerMessage||null;
  throw error;
 }
 const results=(Array.isArray(data?.results)?data.results:[])
  .map(item=>normalizeResult(item,config.allowedDomains)).filter(Boolean).slice(0,count);
 return{enabled:true,provider:"exa",requestId:String(data?.requestId||"").slice(0,100)||null,resultsCount:results.length,results,searchMetadata:{resolvedSearchType:String(data?.resolvedSearchType||"").slice(0,40)||null}};
}
module.exports={ENDPOINT,DEFAULT_DOMAINS,MAX_PAGE_TEXT_CHARS,readSourceSearchConfig,searchDocumentarySources,normalizeResult,allowedDomain,safeDate,sanitizeProviderMessage};
