"use strict";

const REQUIRED_TABLES=Object.freeze([
 "bep_agent_jobs",
 "bep_agent_runs",
 "bep_knowledge_candidates",
 "bep_agent_daily_usage",
 "bep_agent_metrics",
 "bep_financial_knowledge",
 "bep_agent_approved_knowledge"
]);

async function inspectDocumentarySchema(pool){
 if(!pool||typeof pool.query!=="function")throw new Error("DOCUMENTARY_SCHEMA_DATABASE_REQUIRED");
 const tableResult=await pool.query(
  "SELECT "+REQUIRED_TABLES.map(name=>"to_regclass('public."+name+"') IS NOT NULL AS "+name).join(",")
 );
 const tables=tableResult.rows[0]||{};
 const missingTables=REQUIRED_TABLES.filter(name=>tables[name]!==true);
 if(missingTables.length)return{ready:false,missingTables,missingConstraints:["bep_agent_jobs_job_type_check","bep_knowledge_candidates_proposal_type_check"]};
 const constraints=await pool.query(
  "SELECT c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.contype='c' AND c.conrelid IN (to_regclass('public.bep_agent_jobs'),to_regclass('public.bep_knowledge_candidates'))"
 );
 const byName=new Map(constraints.rows.map(row=>[String(row.conname),String(row.definition||"").toLowerCase()]));
 const jobCheck=byName.get("bep_agent_jobs_job_type_check")||"";
 const candidateCheck=byName.get("bep_knowledge_candidates_proposal_type_check")||"";
 const missingConstraints=[];
 if(!jobCheck.includes("documentary_research"))missingConstraints.push("bep_agent_jobs_job_type_check");
 if(!candidateCheck.includes("create"))missingConstraints.push("bep_knowledge_candidates_proposal_type_check");
 return{ready:missingConstraints.length===0,missingTables:[],missingConstraints};
}
async function assertDocumentarySchema(pool){
 const result=await inspectDocumentarySchema(pool);
 if(!result.ready)throw Object.assign(new Error("BEP_DOCUMENTARY_SCHEMA_NOT_READY"),{code:"BEP_DOCUMENTARY_SCHEMA_NOT_READY",missingTables:result.missingTables,missingConstraints:result.missingConstraints});
 return result;
}
module.exports={REQUIRED_TABLES,inspectDocumentarySchema,assertDocumentarySchema};
