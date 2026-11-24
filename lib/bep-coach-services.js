"use strict";
const crypto=require("node:crypto");
const {buildIntelligence}=require("./bep-financial-intelligence");
const LIBRARY_CONFIG=require("../services/coach-library.json");
const PROPOSALS_CONFIG=require("../services/coach-proposals.json");
const sha=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
async function readCoachLibrary({pool,userId,query,context,limit=6}){
 if(!pool||!userId)throw new Error("Authenticated database context is required");
 const result=await buildIntelligence({pool,userId,query:String(query||"").slice(0,4000),context,enabled:true});
 return {
  service:LIBRARY_CONFIG.service,
  version:LIBRARY_CONFIG.version,
  items:(result.knowledge||[]).map(x=>({slug:x.slug,category:x.category,title:x.title,content:x.content,keywords:x.keywords||[],source:{name:x.source_name||"BEP",url:x.source_url||"",evidenceLevel:x.evidence_level||"unspecified"},score:x.score||0})).slice(0,Math.max(1,Math.min(8,Number(limit)||6))),
  context:{monthlyHistoryMonths:result.context.monthlyHistory?.length||0,budgets:result.context.budgets?.length||0,goals:result.context.goals?.length||0,expenses:result.context.expenses?.length||0,savingsOperations:result.context.savingsOperations?.length||0,warnings:result.context.dataWarnings||[]}
 };
}
async function readCoachProposalsDocument({pool,status="pending",limit=100}={}){
 if(!pool||typeof pool.query!=="function")throw new Error("Authenticated database context is required");
 const selectedStatus=String(status||"pending");
 if(!["pending","accepted","rejected","all"].includes(selectedStatus))throw new Error("INVALID_PROPOSAL_STATUS");
 const parsedLimit=Number.parseInt(limit,10);
 const safeLimit=Number.isFinite(parsedLimit)?Math.max(1,Math.min(1000,parsedLimit)):100;
 const result=await pool.query("SELECT id,source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,review_status,created_at,reviewed_at FROM bep_knowledge_candidates WHERE ($1='all' OR review_status=$1) ORDER BY created_at DESC,id DESC LIMIT $2",[selectedStatus,safeLimit]);
 const proposals=result.rows.map(row=>({
  id:String(row.id),source_slug:row.source_slug,source_version:Number(row.source_version),source_digest:row.source_digest,
  proposal_type:row.proposal_type,title:row.title,content:row.content,
  source:{name:row.source_name,url:row.source_url,evidence_level:row.evidence_level},
  confidence:row.confidence,rationale:row.rationale,review_status:row.review_status,
  created_at:row.created_at instanceof Date?row.created_at.toISOString():row.created_at,
  reviewed_at:row.reviewed_at instanceof Date?row.reviewed_at.toISOString():row.reviewed_at||null
 }));
 return{
  schema:PROPOSALS_CONFIG.schema,schema_version:PROPOSALS_CONFIG.schema_version,
  generated_at:new Date().toISOString(),document_type:"bep_coach_knowledge_proposals",
  storage:PROPOSALS_CONFIG.storage,status:selectedStatus,count:proposals.length,
  publication:PROPOSALS_CONFIG.publication,proposals
 };
}
function createCoachProposalsDocumentHandler({pool,logger=console}={}){
 return async(req,res)=>{
  const status=String(req.query?.status||"pending");
  if(!["pending","accepted","rejected","all"].includes(status))return res.status(400).json({error:"INVALID_PROPOSAL_STATUS"});
  try{
   const document=await readCoachProposalsDocument({pool,status,limit:req.query?.limit});
   res.setHeader("Cache-Control","no-store");
   res.setHeader("Content-Disposition",'attachment; filename="bep-coach-proposals.json"');
   return res.status(200).json(document);
  }catch(error){
   logger.error?.("Coach proposals JSON export failed",String(error?.message||error).slice(0,140));
   return res.status(503).json({error:"COACH_PROPOSALS_UNAVAILABLE"});
  }
 };
}

function digestWebCandidate(candidate,category){
 return sha(JSON.stringify({slug:candidate.source_slug,category,title:candidate.title,content:candidate.content,source_name:candidate.source_name,source_url:candidate.source_url,evidence_level:candidate.evidence_level,version:1}));
}
module.exports={LIBRARY_CONFIG,PROPOSALS_CONFIG,readCoachLibrary,readCoachProposalsDocument,createCoachProposalsDocumentHandler,safeHttpUrl,digestWebCandidate};
