"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {resolveAdminProvider}=require("../lib/bep-agent/config");
const {GroqClient}=require("../lib/bep-agent/groq-client");
const {sourceMapFor,auditClaimEvidence}=require("../lib/bep-agent/documentary-analysis");

async function main(){
 const provider=resolveAdminProvider(process.env);
 if(provider.provider!=="groq"||!provider.apiKey)throw new Error("BEP_AGENT_GROQ_API_KEY is required for the live semantic benchmark");
 const fixture=require("../tests/fixtures/bep-documentary-semantic-corpus.json");
 const sourceMap=sourceMapFor([fixture.source],[fixture.source.domain]);
 if(!sourceMap.size)throw new Error("Semantic benchmark source failed HTTPS/domain validation");
 const client=new GroqClient({apiKey:provider.apiKey,model:provider.model,timeoutMs:30000});
 const results=[];
 for(const item of fixture.cases){
  const audit=await auditClaimEvidence({client,title:item.id,content:item.content,evidenceUrls:[fixture.source.url],sourceMap,maxOutputTokens:1800});
  results.push({id:item.id,expectedAccepted:item.expectedAccepted,observedAccepted:audit.accepted,match:audit.accepted===item.expectedAccepted,overallVerdict:audit.overallVerdict,coverage:audit.coverage,claims:audit.claims,reason:audit.reason});
 }
 const matched=results.filter(x=>x.match).length;
 const report={corpusId:fixture.corpus_id,capturedAt:fixture.captured_at,executedAt:new Date().toISOString(),provider:"groq",model:provider.model,source:{title:fixture.source.title,url:fixture.source.url,domain:fixture.source.domain},summary:{cases:results.length,matched,failed:results.length-matched,accuracy:results.length?Number((matched/results.length).toFixed(4)):0},results};
 const outputPath=path.resolve(process.env.BEP_SEMANTIC_AUDIT_REPORT||"artifacts/bep-documentary-semantic-benchmark.json");
 await fs.mkdir(path.dirname(outputPath),{recursive:true});
 await fs.writeFile(outputPath,JSON.stringify(report,null,2)+"\n","utf8");
 process.stdout.write(JSON.stringify({summary:report.summary,reportPath:outputPath})+"\n");
 if(matched!==results.length)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(String(error?.stack||error)+"\n");process.exitCode=1;});
