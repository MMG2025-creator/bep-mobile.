"use strict";
const {readAdminConfig}=require("./config");

function adminAgentStatus(env=process.env){return readAdminConfig(env)}

// The API only acknowledges that work can be queued. Gemini execution belongs
// exclusively to agent-worker.js; this function must never instantiate Gemini.
function scheduleAdminAgentRun({pool,env=process.env}={}){
 const config=readAdminConfig(env);
 if(!config.enabled)return{scheduled:false,reason:config.disabledReason};
 if(!pool)return{scheduled:false,reason:"database pool is unavailable"};
 return{scheduled:true,workerRequired:true};
}
module.exports={adminAgentStatus,scheduleAdminAgentRun};
