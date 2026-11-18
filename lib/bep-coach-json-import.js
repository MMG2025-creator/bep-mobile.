"use strict";
const crypto=require("node:crypto");
const ALLOWED_HOSTS=new Set(["www.mesdroitssociaux.gouv.fr","www.mesquestionsdargent.fr","mesquestionsdargent.fr","www.amf-france.org","www.service-public.gouv.fr","www.urssaf.fr"]);
const CATEGORIES=new Set(["income","budget","savings","planning"]);
const sha=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
function canonical(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";}
function validateDocument(doc){
 if(!doc||typeof doc!=="object"||Array.isArray(doc))throw Error("INVALID_DOCUMENT");
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(doc.slug||"")))throw Error("INVALID_SLUG");
 if(!CATEGORIES.has(doc.category))throw Error("INVALID_CATEGORY");
 if(typeof doc.title!=="string"||!doc.title.trim()||doc.title.length>180)throw Error("INVALID_TITLE");
 if(typeof doc.content!=="string"||doc.content.trim().length<80||doc.content.length>12000)throw Error("INVALID_CONTENT");
 if(!Array.isArray(doc.sources)||!doc.sources.length)throw Error("SOURCE_REQUIRED");
 const sources=doc.sources.map(source=>{let url;try{url=new URL(source.url)}catch{throw Error("SOURCE_URL_INVALID")}if(url.protocol!=="https:"||url.username||url.password||!ALLOWED_HOSTS.has(url.hostname.toLowerCase()))throw Error("SOURCE_NOT_ALLOWLISTED");if(typeof source.publisher!=="string"||!source.publisher.trim()||typeof source.title!=="string"||!source.title.trim())throw Error("SOURCE_METADATA_INVALID");return{publisher:source.publisher,title:source.title,url:url.href};});
 if(doc.review_status!=="pending_admin_approval")throw Error("DOCUMENT_NOT_PENDING");
 return {...doc,sources};
}
async function importStructuredDocuments({pool,documents}={}){
 if(!pool||typeof pool.query!=="function")throw Error("DATABASE_REQUIRED");
 if(!Array.isArray(documents)||documents.length<1||documents.length>20)throw Error("INVALID_DOCUMENT_BATCH");
 const seen=new Set(),results=[];
 for(const raw of documents){const doc=validateDocument(raw);if(seen.has(doc.slug))throw Error("DUPLICATE_DOCUMENT_SLUG");seen.add(doc.slug);const digest=sha(canonical(doc));const source=doc.sources[0];const sourceName=doc.sources.map(x=>x.publisher).filter((v,i,a)=>a.indexOf(v)===i).join(" ; ").slice(0,180);const rationale=JSON.stringify({origin:"versioned_repository_json",verified_at:doc.verified_at||null,reliability:doc.reliability||null,conditions:doc.conditions||[],limits:doc.limits||[],freshness:doc.freshness||null,keywords:doc.keywords||[],sources:doc.sources});const inputDigest=sha(doc.slug+"|"+digest);
  const inserted=await pool.query("INSERT INTO bep_knowledge_candidates(source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,input_digest) VALUES($1,1,$2,'update',$3,$4,$5,$6,'institutional_reference_pending',$7,$8,$9) ON CONFLICT(source_slug,proposal_type,input_digest) DO NOTHING RETURNING id",[doc.slug,digest,doc.title.trim(),doc.content.trim(),sourceName,source.url,doc.reliability?.level==="high"?"high":"medium",rationale,inputDigest]);
  results.push({slug:doc.slug,title:doc.title,status:inserted.rowCount?"created":"duplicate",id:inserted.rowCount?String(inserted.rows[0].id):null,review_status:"pending"});
 }
 return{provider:"bep-structured-json-import",aiUsed:false,automaticPublication:false,total:results.length,created:results.filter(x=>x.status==="created").length,duplicates:results.filter(x=>x.status==="duplicate").length,results};
}
module.exports={importStructuredDocuments,validateDocument};
