"use strict";
const MAX_BATCH_SOURCES=10;
const CATEGORIES=new Set(["budget","spending","savings","debt","behavior","income","planning","general"]);
const SOURCE_HOST="www.mesquestionsdargent.fr";
function validateSources(sources){
 if(!Array.isArray(sources)||sources.length<1||sources.length>MAX_BATCH_SOURCES)throw new Error("INVALID_BATCH_SIZE");
 const ids=new Set(),urls=new Set();
 return sources.map(item=>{
  const id=String(item?.id||"").trim(),title=String(item?.title||"").trim(),category=String(item?.category||"").trim();
  let url;try{url=new URL(String(item?.url||"").trim())}catch{throw new Error("INVALID_SOURCE")}
  if(!/^mqa-\d{2}$/.test(id)||!title||title.length>180||!CATEGORIES.has(category)||
   url.protocol!=="https:"||url.hostname!==SOURCE_HOST||url.username||url.password||url.port||url.search||url.hash||url.pathname==="/"||url.pathname.length>500)throw new Error("INVALID_SOURCE");
  const canonical=url.href;
  if(ids.has(id))throw new Error("DUPLICATE_SOURCE_ID");
  if(urls.has(canonical))throw new Error("DUPLICATE_SOURCE_URL");
  ids.add(id);urls.add(canonical);return{id,title,category,url:canonical};
 });
}
async function registerCoachSources({pool,sources}={}){
 if(!pool||typeof pool.connect!=="function")throw new Error("DATABASE_REQUIRED");
 const validated=validateSources(sources),client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query(`CREATE TABLE IF NOT EXISTS bep_coach_source_registry(
   id BIGSERIAL PRIMARY KEY,source_id TEXT NOT NULL UNIQUE,source_url TEXT NOT NULL UNIQUE,
   title TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('budget','spending','savings','debt','behavior','income','planning','general')),
   status TEXT NOT NULL DEFAULT 'pending_validation' CHECK(status IN ('pending_validation','validated','rejected')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  let inserted=0;
  for(const source of validated){
   const result=await client.query("INSERT INTO bep_coach_source_registry(source_id,source_url,title,category,status) VALUES($1,$2,$3,$4,'pending_validation') ON CONFLICT DO NOTHING RETURNING source_id",[source.id,source.url,source.title,source.category]);
   inserted+=result.rowCount||0;
  }
  const existing=await client.query("SELECT source_id,source_url,title,category,status FROM bep_coach_source_registry WHERE source_id=ANY($1::text[])",[validated.map(source=>source.id)]);
  const byId=new Map(existing.rows.map(row=>[row.source_id,row]));
  for(const source of validated){const row=byId.get(source.id);if(!row||row.source_url!==source.url||row.title!==source.title||row.category!==source.category)throw new Error("SOURCE_ID_CONFLICT")}
  await client.query("COMMIT");
  return{ok:true,batchSize:validated.length,inserted,alreadyPresent:validated.length-inserted,status:"pending_validation",automaticPublication:false,geminiCalls:0,webFetches:0,sources:existing.rows};
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}
 finally{client.release()}
}
module.exports={MAX_BATCH_SOURCES,validateSources,registerCoachSources};
