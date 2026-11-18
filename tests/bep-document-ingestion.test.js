"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ingestDocumentUrl,ingestDocumentBatch,saveCollectedPage}=require("../lib/bep-document-ingestion");

test("manual document ingestion stores extracted source without calling an AI provider",async()=>{
 const inserts=[];
 const pool={query:async(sql,params)=>{if(sql.includes("bep_document_ingestion_sites"))return{rowCount:1,rows:[]};if(sql.includes("INSERT INTO bep_knowledge_candidates")){inserts.push(params);return{rowCount:1,rows:[{id:17}]}}return{rowCount:0,rows:[]}}};
 const fetchPage=async(url)=>({url,title:"Guide CNIL",text:"Contenu institutionnel documenté. ".repeat(20),links:[]});
 const result=await ingestDocumentUrl({pool,url:"https://www.cnil.fr/fr/guide-de-la-securite-des-donnees-personnelles",category:"general",fetchPage});
 assert.equal(result.enabled,true);
 assert.equal(result.provider,"bep-native-http-extractor");
 assert.equal(result.aiUsed,false);
 assert.equal(result.candidatesCreated,1);
 assert.equal(result.candidates[0].id,"17");
 assert.equal(result.candidates[0].source.url,"https://www.cnil.fr/fr/guide-de-la-securite-des-donnees-personnelles");
 assert.equal(inserts.length,1);
 assert.equal(inserts[0][6],"web_research_pending");
 assert.match(inserts[0][8],/sans génération IA/);
});

test("duplicate document ingestion creates no second pending candidate",async()=>{
 const pool={query:async(sql)=>sql.includes("bep_document_ingestion_sites")?{rowCount:1,rows:[]}:{rowCount:0,rows:[]}};
 const fetchPage=async(url)=>({url,title:"Guide CNIL",text:"Contenu institutionnel documenté. ".repeat(20),links:[]});
 const result=await ingestDocumentUrl({pool,url:"https://www.cnil.fr/fr/guide-de-la-securite-des-donnees-personnelles",fetchPage});
 assert.equal(result.candidatesCreated,0);
 assert.equal(result.duplicateCount,1);
});

test("unsafe URLs and unsupported categories are rejected before fetching",async()=>{
 let fetched=0;
 const pool={query:async()=>{throw new Error("must not write")} };
 const fetchPage=async()=>{fetched++;return{}};
 await assert.rejects(()=>ingestDocumentUrl({pool,url:"http://example.org",fetchPage}),/URL_INSECURE_OR_INVALID/);
 await assert.rejects(()=>ingestDocumentUrl({pool,url:"https://example.org",category:"unknown",fetchPage}),/INVALID_CATEGORY/);
 assert.equal(fetched,0);
});

test("batch ingestion isolates source failures and continues processing",async()=>{
 const pool={query:async()=>({rowCount:1,rows:[{id:21}]})};
 const fetchPage=async(url)=>{if(url.includes("bad"))throw new Error("SOURCE_HTTP_404");return{url,title:"Document",text:"Contenu de référence suffisamment long. ".repeat(10),links:[]}};
 const result=await ingestDocumentBatch({pool,sources:[{url:"https://example.org/good",category:"general"},{url:"https://example.org/bad",category:"general"}],fetchPage});
 assert.equal(result.aiUsed,false);
 assert.equal(result.processed,1);
 assert.equal(result.failed,1);
 assert.equal(result.candidatesCreated,1);
});
