"use strict";
const crypto=require("node:crypto");
const CATEGORIES=new Set(["budget","spending","savings","debt","behavior","income","planning","general"]);
const EVIDENCE_LEVELS=new Set(["institutional_guidance","official_legal_information","behavioral_practice","bep_accounting_rule","bep_data_integrity_rule"]);
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
function clean(value){return String(value||"").normalize("NFC").replace(/\s+/g," ").trim()}
function validateManualKnowledge(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return{error:"INVALID_INPUT"};
 const allowed=new Set(["title","category","content","source_name","source_url","evidence_level","confidence","rationale"]);
 if(Object.keys(input).some(key=>!allowed.has(key)))return{error:"UNEXPECTED_FIELDS"};
 const title=clean(input.title),category=clean(input.category),content=String(input.content||"").normalize("NFC").trim(),sourceName=clean(input.source_name),rationale=clean(input.rationale),evidenceLevel=clean(input.evidence_level),confidence=clean(input.confidence);
 let sourceUrl="";
 try{const rawUrl=String(input.source_url||"");if(rawUrl.length>2048)return{error:"INVALID_SOURCE_URL"};const parsed=new URL(rawUrl);if(parsed.protocol!=="https:"||parsed.username||parsed.password||!parsed.hostname)return{error:"INVALID_SOURCE_URL"};sourceUrl=parsed.href}catch{return{error:"INVALID_SOURCE_URL"}}
 if(title.length<5||title.length>140||category.length>32||!CATEGORIES.has(category))return{error:"INVALID_TITLE_OR_CATEGORY"};
 if(content.length<100||content.length>1800)return{error:"INVALID_CONTENT"};
 if(sourceName.length<2||sourceName.length>180)return{error:"INVALID_SOURCE_NAME"};
 if(!EVIDENCE_LEVELS.has(evidenceLevel)||!["low","medium","high"].includes(confidence))return{error:"INVALID_EVIDENCE"};
 if(rationale.length<20||rationale.length>500)return{error:"INVALID_RATIONALE"};
 const slugHash=sha((sourceUrl.toLowerCase()+"|"+title.toLocaleLowerCase("fr")).normalize("NFC")).slice(0,24);
 const sourceSlug="manual-"+category+"-"+slugHash;
 const source={slug:sourceSlug,category,title,content,source_name:sourceName,source_url:sourceUrl,evidence_level:evidenceLevel,version:1};
 const sourceDigest=sha(JSON.stringify(source));
 const normalized={title,category,content,source_name:sourceName,source_url:sourceUrl,evidence_level:evidenceLevel,confidence,rationale};
 const inputDigest=sha(JSON.stringify(normalized));
 return{value:{sourceSlug,sourceVersion:1,sourceDigest,inputDigest,title,category,content,sourceName,sourceUrl,evidenceLevel,confidence,rationale}};
}
module.exports={validateManualKnowledge,CATEGORIES,EVIDENCE_LEVELS};
