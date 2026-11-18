"use strict";
const crypto=require("node:crypto");
const ALLOWED_HOSTS=new Set(["www.mesdroitssociaux.gouv.fr","www.mesquestionsdargent.fr","mesquestionsdargent.fr","www.amf-france.org","amf-france.org","www.service-public.gouv.fr","service-public.gouv.fr","www.urssaf.fr","urssaf.fr","anj.fr","www.anj.fr","joueurs-info-service.fr","www.joueurs-info-service.fr"]);
const CATEGORIES=new Set(["income","budget","savings","planning","spending","debt","behavior"]);
const sha=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const canonical=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(canonical).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
function sourceFingerprint(source){return sha(JSON.stringify({slug:source.slug,category:source.category,title:source.title,content:String(source.content||""),source_name:source.source_name,source_url:source.source_url,evidence_level:source.evidence_level,version:Number(source.version)}));}
function validateDocument(doc){
 if(!doc||typeof doc!=="object"||Array.isArray(doc))throw Error("INVALID_DOCUMENT");
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(doc.slug||"")))throw Error("INVALID_SLUG");
 if(!CATEGORIES.has(doc.category))throw Error("INVALID_CATEGORY");
 if(typeof doc.title!=="string"||!doc.title.trim()||doc.title.length>180)throw Error("INVALID_TITLE");
 if(typeof doc.content!=="string"||doc.content.trim().length<80||doc.content.length>12000)throw Error("INVALID_CONTENT");
 if(!Array.isArray(doc.sources)||!doc.sources.length||doc.sources.length>10)throw Error("SOURCE_REQUIRED");
 const sources=doc.sources.map(source=>{let url;try{url=new URL(source.url)}catch{throw Error("SOURCE_URL_INVALID")}if(url.protocol!=="https:"||url.username||url.password||!ALLOWED_HOSTS.has(url.hostname.toLowerCase()))throw Error("SOURCE_NOT_ALLOWLISTED");if(typeof source.publisher!=="string"||!source.publisher.trim()||typeof source.title!=="string"||!source.title.trim())throw Error("SOURCE_METADATA_INVALID");return{publisher:source.publisher.trim(),title:source.title.trim(),url:url.href};});
 if(doc.review_status!=="pending_admin_approval")throw Error("DOCUMENT_NOT_PENDING");
 return {...doc,sources};
}
async function importStructuredDocuments({pool,documents}={}){
 if(!pool||typeof pool.connect!=="function")throw Error("DATABASE_REQUIRED");
 if(!Array.isArray(documents)||documents.length<1||documents.length>20)throw Error("INVALID_DOCUMENT_BATCH");
 const seen=new Set(),validated=documents.map(validateDocument);
 for(const doc of validated){if(seen.has(doc.slug))throw Error("DUPLICATE_DOCUMENT_SLUG");seen.add(doc.slug);}
 const client=await pool.connect(),results=[];
 try{
  await client.query("BEGIN");
  for(const doc of validated){
   const source=doc.sources[0],sourceName=[...new Set(doc.sources.map(x=>x.publisher))].join(" ; ").slice(0,180);
   const evidenceLevel="institutional_reference",sourceDoc={slug:doc.slug,category:doc.category,title:doc.title.trim(),content:doc.content.trim(),source_name:sourceName,source_url:source.url,evidence_level:evidenceLevel,version:1};
   const digest=sourceFingerprint(sourceDoc),keywords=Array.isArray(doc.keywords)?doc.keywords.slice(0,40):[];
   const rationale=JSON.stringify({origin:"versioned_repository_json",verified_at:doc.verified_at||null,reliability:doc.reliability||null,conditions:doc.conditions||[],limits:doc.limits||[],freshness:doc.freshness||null,keywords,sources:doc.sources,category:doc.category});
   const inputDigest=sha(doc.slug+"|"+digest);
   const inserted=await client.query("INSERT INTO bep_knowledge_candidates(source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,review_status,input_digest) VALUES($1,1,$2,'create',$3,$4,$5,$6,$7,$8,$9,'pending',$10) ON CONFLICT(source_slug,proposal_type,input_digest) DO NOTHING RETURNING id",[doc.slug,digest,doc.title.trim(),doc.content.trim(),sourceName,source.url,evidenceLevel,doc.reliability?.level==="high"?"high":"medium",rationale,inputDigest]);
   results.push({slug:doc.slug,title:doc.title,status:inserted.rowCount?"created":"duplicate",id:inserted.rowCount?String(inserted.rows[0].id):null,review_status:"pending"});
  }
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
 return{provider:"bep-structured-json-import",aiUsed:false,automaticPublication:false,total:results.length,created:results.filter(x=>x.status==="created").length,duplicates:results.filter(x=>x.status==="duplicate").length,results};
}
module.exports={importStructuredDocuments,validateDocument};
