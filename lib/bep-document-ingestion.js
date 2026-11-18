"use strict";
const crypto=require("node:crypto");
const {collectSource,normaliseUrl}=require("./bep-coach-ingestion");
const {RESEARCH_CONFIG}=require("./bep-coach-services");
const CATEGORIES=new Set(RESEARCH_CONFIG.research_policy.categories);
const sha=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const MAX_CONTENT_CHARS=12000;
const IMPORT_CLEANING_RULES=Object.freeze({
 version:1,
 minimumContentChars:180,
 listingReadingTimeThreshold:3,
 removePatterns:[
  /Accueil\\s*(?:›|»|>|&rsaquo;)\\s*/gi,
  /(?:Lire la suite|En savoir plus|Partager cet article|Partager|Imprimer|Sommaire)\\s*(?:→|»|›)?/gi,
  /(?:Menu principal|Navigation principale|Aller au contenu|Retour en haut)\\s*/gi
 ]
});
function cleanImportedContent(value){
 let content=String(value||"").replace(/\\r/g,"\\n").replace(/\\u00a0/g," ");
 for(const pattern of IMPORT_CLEANING_RULES.removePatterns)content=content.replace(pattern," ");
 content=content.replace(/(?:\\s*[→»›]+\\s*){2,}/g," ").replace(/[ \\t]+/g," ").replace(/ *\\n */g,"\\n").replace(/\\n{3,}/g,"\\n\\n").trim();
 return content.slice(0,MAX_CONTENT_CHARS);
}
function assessImportedPage(page){
 const raw=String(page?.text||"");
 const readingTimeMatches=raw.match(/\\b\\d+\\s*min(?:ute)?s? de lecture\\b/gi)||[];
 const hasHomepageMetrics=/\\b(?:visiteurs mensuels|abonnés ravis|synthèses et dossiers publiés|thématiques approfondies)\\b/i.test(raw);
 if(readingTimeMatches.length>=IMPORT_CLEANING_RULES.listingReadingTimeThreshold||hasHomepageMetrics)return{accepted:false,reason:"SOURCE_IS_LISTING_PAGE"};
 const content=cleanImportedContent(raw);
 if(content.length<IMPORT_CLEANING_RULES.minimumContentChars)return{accepted:false,reason:"SOURCE_CONTENT_TOO_SHORT"};
 return{accepted:true,content};
}
async function ensureIdentifiedSitesSchema(pool){
 await pool.query("CREATE TABLE IF NOT EXISTS bep_document_ingestion_sites(hostname TEXT PRIMARY KEY,site_url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',pages_collected INTEGER NOT NULL DEFAULT 0,candidates_created INTEGER NOT NULL DEFAULT 0,last_status TEXT NOT NULL DEFAULT 'identified',first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("INSERT INTO bep_document_ingestion_sites(hostname,site_url,title,pages_collected,candidates_created,last_status) SELECT lower(split_part(split_part(source_url,'://',2),'/',1)), 'https://' || lower(split_part(split_part(source_url,'://',2),'/',1)), MAX(source_name), COUNT(*), COUNT(*), 'candidate_saved' FROM bep_knowledge_candidates WHERE source_url ~* '^https?://' GROUP BY lower(split_part(split_part(source_url,'://',2),'/',1)) ON CONFLICT(hostname) DO NOTHING");
}
async function recordIdentifiedSite({pool,url,title,pagesCollected,candidatesCreated,status='candidate_saved'}){
 await ensureIdentifiedSitesSchema(pool);
 const hostname=new URL(url).hostname.toLowerCase();
 await pool.query("INSERT INTO bep_document_ingestion_sites(hostname,site_url,title,pages_collected,candidates_created,last_status) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(hostname) DO UPDATE SET site_url=EXCLUDED.site_url,title=CASE WHEN EXCLUDED.title<>'' THEN EXCLUDED.title ELSE bep_document_ingestion_sites.title END,pages_collected=bep_document_ingestion_sites.pages_collected+EXCLUDED.pages_collected,candidates_created=bep_document_ingestion_sites.candidates_created+EXCLUDED.candidates_created,last_status=EXCLUDED.last_status,last_seen_at=NOW()",[hostname,url,String(title||'').slice(0,180),pagesCollected,candidatesCreated,status]);
}
async function listIdentifiedSites(pool){
 if(!pool||typeof pool.query!=='function')throw new Error('DATABASE_REQUIRED');
 await ensureIdentifiedSitesSchema(pool);
 const result=await pool.query("SELECT hostname,site_url,title,pages_collected,candidates_created,last_status,first_seen_at,last_seen_at FROM bep_document_ingestion_sites ORDER BY last_seen_at DESC,hostname ASC");
 return {total:result.rows.length,sites:result.rows};
}

function keywordsFor(title,content){
 return [...new Set((String(title)+" "+String(content)).toLocaleLowerCase("fr").match(/[a-z0-9]{4,}/g)||[])].slice(0,20);
}
async function saveCollectedPage({pool,page,category="general",confidence="medium"}={}){
 if(!pool||typeof pool.query!=="function")throw new Error("DATABASE_REQUIRED");
 if(!CATEGORIES.has(category))throw new Error("INVALID_CATEGORY");
 const sourceUrl=normaliseUrl(page?.url)?.href;
 const title=String(page?.title||"").trim().slice(0,180);
 const assessment=assessImportedPage(page);
 if(!assessment.accepted)throw new Error(assessment.reason);
 const content=assessment.content;
 if(!sourceUrl||!title)throw new Error("SOURCE_CONTENT_INVALID");
 const sourceName=title;
 const evidence="web_research_pending";
 const slug="web-"+category+"-"+sha(sourceUrl+"|"+title).slice(0,24);
 const sourceDigest=sha(JSON.stringify({slug,category,title,content,source_name:sourceName,source_url:sourceUrl,evidence_level:evidence,version:1}));
 const rationale="Document récupéré automatiquement depuis la page source, sans génération IA. Contenu brut normalisé ; validation humaine requise avant publication.";
 const inputDigest=sha(category+"|"+sourceUrl+"|"+sha(content));
 const result=await pool.query("INSERT INTO bep_knowledge_candidates(source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,input_digest) VALUES($1,1,$2,'update',$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id",[
  slug,sourceDigest,title,content,sourceName,sourceUrl,evidence,confidence,rationale,inputDigest
 ]);
 return {created:!!result.rowCount,id:result.rowCount?String(result.rows[0].id):null,slug,title,source:{name:sourceName,url:sourceUrl},category,confidence,contentChars:content.length,contentHash:sha(content),keywords:keywordsFor(title,content)};
}
async function ingestDocumentUrl({pool,url,category="general",mode="page",fetchPage}={}){
 if(!["page","deep"].includes(mode))throw new Error("INVALID_INGESTION_MODE");
 if(!CATEGORIES.has(category))throw new Error("INVALID_CATEGORY");
 const canonical=normaliseUrl(url);
 if(!canonical)throw new Error("URL_INSECURE_OR_INVALID");
 const collection=await collectSource({url:canonical.href,mode,...(fetchPage?{fetchPage}:{})});
 if(!collection.pages.length)throw new Error("NO_SOURCE_CONTENT");
 const candidates=[];
 for(const page of collection.pages){
  const saved=await saveCollectedPage({pool,page,category});
  if(saved.created)candidates.push(saved);
 }
 await recordIdentifiedSite({pool,url:canonical.href,title:collection.pages[0]?.title,pagesCollected:collection.pages.length,candidatesCreated:candidates.length,status:candidates.length?'candidate_saved':'already_registered'});
 return {enabled:true,provider:"bep-native-http-extractor",mode,sourceUrl:canonical.href,pagesDiscovered:collection.pagesDiscovered,pagesAnalysed:collection.pagesAnalysed,warnings:collection.warnings,candidatesCreated:candidates.length,candidates,duplicateCount:collection.pages.length-candidates.length,aiUsed:false,publication:"pending_human_approval"};
}
async function ingestDocumentBatch({pool,sources,fetchPage}={}){
 if(!Array.isArray(sources)||sources.length<1||sources.length>10)throw new Error("INVALID_BATCH_SIZE");
 const seen=new Set(),results=[];
 for(const item of sources){
  const url=normaliseUrl(item?.url),category=String(item?.category||"general");
  if(!url||!CATEGORIES.has(category))throw new Error("INVALID_BATCH_SOURCE");
  if(seen.has(url.href))throw new Error("DUPLICATE_BATCH_SOURCE");
  seen.add(url.href);
 }
 for(const item of sources){
  try{results.push(await ingestDocumentUrl({pool,url:item.url,category:item.category||"general",mode:"page",fetchPage}).then(result=>({url:item.url,status:"stored",...result})));}
  catch(error){results.push({url:item.url,status:"failed",error:String(error?.message||"INGESTION_FAILED").slice(0,120)});}
 }
 return {enabled:true,provider:"bep-native-http-extractor",batchSize:sources.length,processed:results.filter(x=>x.status==="stored").length,failed:results.filter(x=>x.status==="failed").length,candidatesCreated:results.reduce((n,x)=>n+(x.candidatesCreated||0),0),results,aiUsed:false};
}
module.exports={ingestDocumentUrl,ingestDocumentBatch,saveCollectedPage,keywordsFor,cleanImportedContent,assessImportedPage,IMPORT_CLEANING_RULES,MAX_CONTENT_CHARS,ensureIdentifiedSitesSchema,recordIdentifiedSite,listIdentifiedSites};
