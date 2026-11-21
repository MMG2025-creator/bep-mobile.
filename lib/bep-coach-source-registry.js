"use strict";
const crypto=require("node:crypto");
const MAX_BATCH_SOURCES=10,DEFAULT_STALE_AFTER_DAYS=30;
const CATEGORIES=new Set(["budget","spending","savings","debt","behavior","income","planning","general"]);
const SOURCE_HOSTS=new Set(["mesquestionsdargent.fr","www.mesquestionsdargent.fr"]);
const digest=value=>crypto.createHash("sha256").update(String(value||"")).digest("hex");
function validateSources(sources){
 if(!Array.isArray(sources)||sources.length<1||sources.length>MAX_BATCH_SOURCES)throw new Error("INVALID_BATCH_SIZE");
 const ids=new Set(),urls=new Set();
 return sources.map(item=>{
  const id=String(item?.id||"").trim(),title=String(item?.title||"").trim(),category=String(item?.category||"").trim();
  let url;try{url=new URL(String(item?.url||"").trim())}catch{throw new Error("INVALID_SOURCE")}
  if(!/^mqa-\d{2}$/.test(id)||!title||title.length>180||!CATEGORIES.has(category)||url.protocol!=="https:"||!SOURCE_HOSTS.has(url.hostname)||url.username||url.password||url.port||url.search||url.hash||url.pathname==="/"||url.pathname.length>500)throw new Error("INVALID_SOURCE");
  const canonical=url.href;if(ids.has(id))throw new Error("DUPLICATE_SOURCE_ID");if(urls.has(canonical))throw new Error("DUPLICATE_SOURCE_URL");
  ids.add(id);urls.add(canonical);return{id,title,category,url:canonical};
 });
}
async function ensureCoachSourceRegistrySchema(pool){
 if(!pool)throw new Error("DATABASE_REQUIRED");
 await pool.query("CREATE TABLE IF NOT EXISTS bep_coach_source_registry(id BIGSERIAL PRIMARY KEY,source_id TEXT NOT NULL UNIQUE,source_url TEXT NOT NULL UNIQUE,title TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('budget','spending','savings','debt','behavior','income','planning','general')),status TEXT NOT NULL DEFAULT 'pending_validation' CHECK(status IN ('pending_validation','validated','rejected')),last_checked_at TIMESTAMPTZ,last_success_at TIMESTAMPTZ,content_digest TEXT,freshness_status TEXT NOT NULL DEFAULT 'unchecked' CHECK(freshness_status IN ('unchecked','fresh','stale','changed','error')),last_http_status INTEGER,last_error_code TEXT,stale_after_days INTEGER NOT NULL DEFAULT 30 CHECK(stale_after_days BETWEEN 1 AND 365),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 for(const column of ["last_checked_at TIMESTAMPTZ","last_success_at TIMESTAMPTZ","content_digest TEXT","freshness_status TEXT NOT NULL DEFAULT 'unchecked'","last_http_status INTEGER","last_error_code TEXT","stale_after_days INTEGER NOT NULL DEFAULT 30"])await pool.query("ALTER TABLE bep_coach_source_registry ADD COLUMN IF NOT EXISTS "+column);
 await pool.query("CREATE INDEX IF NOT EXISTS bep_coach_source_registry_freshness_idx ON bep_coach_source_registry(freshness_status,last_checked_at)");
}
async function registerCoachSources({pool,sources}={}){
 if(!pool||typeof pool.connect!=="function")throw new Error("DATABASE_REQUIRED");
 const validated=validateSources(sources),client=await pool.connect();
 try{
  await client.query("BEGIN");await ensureCoachSourceRegistrySchema(client);let inserted=0;
  for(const source of validated){const result=await client.query("INSERT INTO bep_coach_source_registry(source_id,source_url,title,category,status) VALUES($1,$2,$3,$4,'pending_validation') ON CONFLICT DO NOTHING RETURNING source_id",[source.id,source.url,source.title,source.category]);inserted+=result.rowCount||0;}
  const existing=await client.query("SELECT source_id,source_url,title,category,status,last_checked_at,last_success_at,content_digest,freshness_status,last_http_status,last_error_code,stale_after_days FROM bep_coach_source_registry WHERE source_id=ANY($1::text[])",[validated.map(source=>source.id)]);
  const byId=new Map(existing.rows.map(row=>[row.source_id,row]));
  for(const source of validated){const row=byId.get(source.id);if(!row||row.source_url!==source.url||row.title!==source.title||row.category!==source.category)throw new Error("SOURCE_ID_CONFLICT")}
  await client.query("COMMIT");
  return{ok:true,batchSize:validated.length,inserted,alreadyPresent:validated.length-inserted,status:"pending_validation",automaticPublication:false,geminiCalls:0,webFetches:0,sources:existing.rows};
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}finally{client.release()}
}
async function listCoachSources({pool,staleAfterDays=DEFAULT_STALE_AFTER_DAYS}={}){
 if(!pool)throw new Error("DATABASE_REQUIRED");await ensureCoachSourceRegistrySchema(pool);
 const days=Math.max(1,Math.min(365,Number(staleAfterDays)||DEFAULT_STALE_AFTER_DAYS));
 const result=await pool.query("SELECT source_id,source_url,title,category,status,last_checked_at,last_success_at,content_digest,freshness_status,last_http_status,last_error_code,stale_after_days,CASE WHEN last_checked_at IS NULL THEN 'unchecked' WHEN last_checked_at<NOW()-(LEAST(GREATEST(stale_after_days,1),365)*INTERVAL '1 day') THEN 'stale' ELSE freshness_status END AS computed_freshness_status,created_at,updated_at FROM bep_coach_source_registry ORDER BY category,source_id");
 const counts={total:0,unchecked:0,fresh:0,stale:0,changed:0,error:0};
 const sources=result.rows.map(row=>{const freshness=row.computed_freshness_status||row.freshness_status||"unchecked";counts.total++;counts[freshness]=(counts[freshness]||0)+1;return{...row,freshness_status:freshness}});
 return{ok:true,staleAfterDays:days,counts,sources,automaticPublication:false};
}
async function refreshCoachSource({pool,sourceId,fetchPage,now=new Date()}={}){
 if(!pool||typeof pool.query!=="function")throw new Error("DATABASE_REQUIRED");if(typeof fetchPage!=="function")throw new Error("FETCHER_REQUIRED");await ensureCoachSourceRegistrySchema(pool);
 const found=await pool.query("SELECT source_id,source_url,title,category,content_digest FROM bep_coach_source_registry WHERE source_id=$1",[String(sourceId||"")]);
 const source=found.rows[0];if(!source)throw new Error("SOURCE_NOT_FOUND");
 const parsed=validateSources([{id:source.source_id,title:source.title,category:source.category,url:source.source_url}])[0];
 try{
  const page=await fetchPage(parsed.url);if(!page||typeof page.text!=="string"||page.text.trim().length<80)throw new Error("SOURCE_TEXT_TOO_SHORT");
  const currentDigest=digest(page.text),changed=!!source.content_digest&&source.content_digest!==currentDigest,freshness=changed?"changed":"fresh";
  const result=await pool.query("UPDATE bep_coach_source_registry SET last_checked_at=$2,last_success_at=$2,content_digest=$3,freshness_status=$4,last_http_status=200,last_error_code=NULL,updated_at=NOW() WHERE source_id=$1 RETURNING source_id,source_url,title,category,status,last_checked_at,last_success_at,content_digest,freshness_status,last_http_status,last_error_code,stale_after_days",[parsed.id,now,currentDigest,freshness]);
  return{ok:true,source:result.rows[0],contentChanged:changed,automaticPublication:false,knowledgeUpdated:false};
 }catch(error){
  const code=String(error?.message||"SOURCE_CHECK_FAILED").replace(/[^A-Z0-9_]/gi,"").slice(0,80)||"SOURCE_CHECK_FAILED";
  await pool.query("UPDATE bep_coach_source_registry SET last_checked_at=$2,freshness_status='error',last_http_status=NULL,last_error_code=$3,updated_at=NOW() WHERE source_id=$1",[parsed.id,now,code]);
  return{ok:false,sourceId:parsed.id,freshness_status:"error",errorCode:code,automaticPublication:false,knowledgeUpdated:false};
 }
}
async function refreshCoachSources({pool,sourceIds,fetchPage,now=new Date()}={}){
 if(!Array.isArray(sourceIds)||sourceIds.length<1||sourceIds.length>MAX_BATCH_SOURCES)throw new Error("INVALID_BATCH_SIZE");
 const unique=[...new Set(sourceIds.map(value=>String(value||"").trim()).filter(Boolean))];if(unique.length!==sourceIds.length)throw new Error("DUPLICATE_SOURCE_ID");
 const results=[];for(const sourceId of unique)results.push(await refreshCoachSource({pool,sourceId,fetchPage,now}));
 return{ok:results.every(item=>item.ok),checked:results.length,fresh:results.filter(item=>item.ok&&!item.contentChanged).length,changed:results.filter(item=>item.contentChanged).length,errors:results.filter(item=>!item.ok).length,results,automaticPublication:false};
}
module.exports={MAX_BATCH_SOURCES,DEFAULT_STALE_AFTER_DAYS,validateSources,ensureCoachSourceRegistrySchema,registerCoachSources,listCoachSources,refreshCoachSource,refreshCoachSources};
