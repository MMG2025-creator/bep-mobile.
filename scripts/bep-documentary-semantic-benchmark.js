"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {resolveAdminProvider}=require("../lib/bep-agent/config");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {sourceMapFor,auditClaimEvidence}=require("../lib/bep-agent/documentary-analysis");
const {sanitizeProviderMessage}=require("../lib/bep-agent/gemini-client");

async function main(){
 const provider=resolveAdminProvider(process.env);
 if(provider.provider!=="groq"||!provider.apiKey)throw new Error("BEP_AGENT_GROQ_API_KEY is required for the live semantic benchmark");
 const fixture=require("../tests/fixtures/bep-documentary-semantic-corpus.json");
 const sourceMap=sourceMapFor([fixture.source],[fixture.source.domain]);
 if(!sourceMap.size)throw new Error("Semantic benchmark source failed HTTPS/domain validation");
 const client=new GroqClient({apiKey:provider.apiKey,model:provider.model,timeoutMs:30000});
 const results=[];
 for(const item of fixture.cases){
  try{
   const audit=await auditClaimEvidence({client,title:item.id,content:item.content,evidenceUrls:[fixture.source.url],sourceMap,maxOutputTokens:1800});
   results.push({id:item.id,status:"completed",expectedAccepted:item.expectedAccepted,observedAccepted:audit.accepted,match:audit.accepted===item.expectedAccepted,overallVerdict:audit.overallVerdict,coverage:audit.coverage,claims:audit.claims,reason:audit.reason,error:null});
  }catch(error){
   results.push({id:item.id,status:"provider_error",expectedAccepted:item.expectedAccepted,observedAccepted:null,match:false,overallVerdict:null,coverage:null,claims:[],reason:"provider_call_failed",error:{
    name:String(error?.name||"Error").slice(0,100),
    diagnosticCode:String(error?.diagnosticCode||error?.code||"GROQ_BENCHMARK_ERROR").slice(0,120),
    message:sanitizeProviderMessage(error?.diagnosticDetail||error?.message,provider.apiKey)||"Erreur Groq non détaillée",
    httpStatus:Number.isInteger(error?.httpStatus)?error.httpStatus:null,
    providerCode:error?.providerCode==null?null:sanitizeProviderMessage(error.providerCode,provider.apiKey),
    providerStatus:error?.providerStatus==null?null:sanitizeProviderMessage(error.providerStatus,provider.apiKey),
    providerMessage:error?.providerMessage==null?null:sanitizeProviderMessage(error.providerMessage,provider.apiKey),
    providerParam:error?.providerParam==null?null:sanitizeProviderMessage(error.providerParam,provider.apiKey),
    retryable:error?.retryable===true
   }});
  }
 }
 const matched=results.filter(x=>x.match).length;
 const errors=results.filter(x=>x.status==="provider_error").length;
 const report={corpusId:fixture.corpus_id,capturedAt:fixture.captured_at,executedAt:new Date().toISOString(),provider:"groq",model:provider.model,source:{title:fixture.source.title,url:fixture.source.url,domain:fixture.source.domain},summary:{cases:results.length,matched,failed:results.length-matched,providerErrors:errors,accuracy:results.length?Number((matched/results.length).toFixed(4)):0},results};
 const outputPath=path.resolve(process.env.BEP_SEMANTIC_AUDIT_REPORT||"artifacts/bep-documentary-semantic-benchmark.json");
 await fs.mkdir(path.dirname(outputPath),{recursive:true});
 await fs.writeFile(outputPath,JSON.stringify(report,null,2)+"\n","utf8");
 process.stdout.write(JSON.stringify({summary:report.summary,reportPath:outputPath})+"\n");
 if(matched!==results.length||errors>0)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(String(error?.stack||error)+"\n");process.exitCode=1;});
