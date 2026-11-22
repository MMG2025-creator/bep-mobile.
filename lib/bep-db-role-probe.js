"use strict";

// Opt-in, one-shot PostgreSQL identity probe.
// Emits only the configured variable name, presence, connection status and current_user.
async function reportPostgresRole({pool,component,variable,sharedWith=[] ,logger=console}){
 const present=typeof process.env[variable]==="string"&&process.env[variable].trim().length>0;
 const base={component,variable,variable_present:present,database_connected:false,postgres_role:null};
 if(!present||!pool){
  logger.info("[BEP_DB_ROLE_PROBE]",JSON.stringify({...base,reason:present?"POOL_UNAVAILABLE":"VARIABLE_MISSING",shared_with:sharedWith}));
  return;
 }
 try{
  const result=await pool.query("SELECT current_user AS postgres_role");
  const role=result.rows&&result.rows[0]?result.rows[0].postgres_role:null;
  logger.info("[BEP_DB_ROLE_PROBE]",JSON.stringify({...base,database_connected:true,postgres_role:typeof role==="string"?role:null,reason:typeof role==="string"?"OK":"ROLE_NOT_RETURNED",shared_with:sharedWith}));
 }catch(_error){
  // Do not expose driver errors; they can contain connection details.
  logger.info("[BEP_DB_ROLE_PROBE]",JSON.stringify({...base,reason:"DATABASE_CONNECTION_FAILED",shared_with:sharedWith}));
 }
}

module.exports={reportPostgresRole};
