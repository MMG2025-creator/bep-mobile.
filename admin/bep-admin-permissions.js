"use strict";
const PERMISSIONS=Object.freeze({
 "GET /api/admin/bep-agent/candidates":"documents.proposals.read",
 "POST /api/admin/bep-agent/candidates/:id/review:approve":"documents.proposals.approve",
 "POST /api/admin/bep-agent/candidates/:id/review:reject":"documents.proposals.reject",
 "GET /api/admin/bep-agent/status":"agent.status.read",
 "GET /api/admin/bep-agent/overview":"agent.telemetry.read",
 "POST /api/admin/bep-agent/run":"agent.run",
 "GET /api/admin/bep-coach/research/status":"research.status.read",
 "POST /api/admin/bep-coach/research":"research.execute",
 "GET /api/admin/bep-coach/identified-sites":"sources.read",
 "POST /api/admin/bep-coach/ingest-batch":"sources.ingest",
 "POST /api/admin/bep-coach/source-registry":"sources.manage",
 "POST /api/admin/bep-coach/ingest":"sources.ingest",
 "GET /api/admin/bep-coach/library":"documents.library.read",
 "GET /api/admin/bep-coach/proposals.json":"documents.proposals.read",
 "GET /api/admin/console/status":"console.read",
 "GET /api/admin/console/export":"console.read",
 "GET /api/admin/console/documents":"console.read",
 "GET /api/admin/console/audit":"console.audit.read",
 "GET /api/admin/console/documents/:id":"console.read",
 "POST /api/admin/console/import":"console.documents.import",
 "POST /api/admin/console/annotations":"console.annotations.create",
 "POST /api/admin/console/knowledge/import-structured-json":"console.knowledge.import"
});
function normalizeEmail(value){return String(value||"").trim().toLowerCase()}
function configuredGrants(env=process.env){
 let parsed;try{parsed=JSON.parse(String(env.BEP_ADMIN_PERMISSION_GRANTS||"{}"))}catch{return Object.create(null)}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return Object.create(null);
 const result=Object.create(null);
 for(const [email,permissions] of Object.entries(parsed))if(Array.isArray(permissions))result[normalizeEmail(email)]=new Set(permissions.filter(x=>typeof x==="string"));
 return result;
}
function resolvePermission(req){
 const method=String(req.method||"").toUpperCase(),path=String(req.fullPath||req.path||"");
 if(method==="POST"&&/^\/api\/admin\/bep-agent\/candidates\/\d+\/review$/.test(path)){
  const decision=String(req.body?.decision||"");
  return decision==="approve"?"documents.proposals.approve":decision==="reject"?"documents.proposals.reject":null;
 }
 const exact=PERMISSIONS[method+" "+path];if(exact)return exact;
 if(method==="GET"&&/^\/api\/admin\/console\/documents\/[0-9a-f-]{36}$/i.test(path))return "console.read";
 return null;
}
function validateReviewConfirmation(candidate,body){
 const decision=String(body?.decision||"");
 const expected=decision==="approve"?"APPROVE_DOCUMENT":decision==="reject"?"REJECT_DOCUMENT":null;
 return Boolean(expected&&typeof candidate?.source_digest==="string"&&/^[a-f0-9]{64}$/.test(candidate.source_digest)&&body?.confirmation===expected&&body?.candidate_digest===candidate.source_digest);
}
function requirePermission(req,res,next,permission){
 if(typeof permission!=="string"||!permission)return res.status(403).json({error:"ADMIN_PERMISSION_UNMAPPED"});
 const auth=req.session?.bepAdminAuth;
 if(!req.session?.user?.id||auth?.authenticated!==true||auth.userId!==String(req.session.user.id))return res.status(401).json({error:"INDEPENDENT_ADMIN_AUTH_REQUIRED"});
 const email=normalizeEmail(auth.email);
 const allowlist=new Set(String(process.env.BEP_ADMIN_EMAILS||"").split(",").map(normalizeEmail).filter(Boolean));
 if(!email||!allowlist.has(email))return res.status(403).json({error:"ADMIN_NOT_ALLOWLISTED"});
 const allowed=configuredGrants()[email];
 if(!allowed||!allowed.has(permission))return res.status(403).json({error:"ADMIN_PERMISSION_DENIED",permission});
 req.bepAdminPermission=permission;return next();
}
module.exports={PERMISSIONS,configuredGrants,resolvePermission,validateReviewConfirmation,requirePermission};
