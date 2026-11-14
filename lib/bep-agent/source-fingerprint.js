"use strict";
const crypto=require("node:crypto");
function sourceFingerprint(source){
 return crypto.createHash("sha256").update(JSON.stringify({
  slug:source.slug,category:source.category,title:source.title,content:String(source.content||""),
  source_name:source.source_name,source_url:source.source_url,evidence_level:source.evidence_level,
  version:Number(source.version)
 })).digest("hex");
}
module.exports={sourceFingerprint};
