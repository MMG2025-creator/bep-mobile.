"use strict";

const RECORD_ARRAY_KEYS=new Set(["incomes","budgets","expenses","goals","transactions","savingsOperations"]);
const DELETED_RECORD_KEYS=new Set(["incomes","budgets","expenses","goals","transactions"]);
const MISSING=Symbol("missing");
function canonical(value){
 if(value===MISSING)return "<missing>";
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
 return JSON.stringify(value);
}
function conflict(path){const error=Error("OFFLINE_CONFLICT");error.code="OFFLINE_CONFLICT";error.path=path;throw error}
function mergeValue(base,local,remote,path){
 if(canonical(local)===canonical(base))return remote;
 if(canonical(remote)===canonical(base)||canonical(local)===canonical(remote))return local;
 if(local===MISSING||remote===MISSING)conflict(path);
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&RECORD_ARRAY_KEYS.has(path.split(".").at(-1))){
  for(const items of [base,local,remote]){
   const ids=items.map(item=>item&&typeof item==="object"&&!Array.isArray(item)&&typeof item.id==="string"?item.id:"");
   if(ids.some(id=>!id)||new Set(ids).size!==ids.length)conflict(path);
  }
  const maps=[base,local,remote].map(items=>new Map(items.map(item=>[item.id,item])));
  const ids=new Set([...maps[0].keys(),...maps[1].keys(),...maps[2].keys()]),out=[];
  for(const id of ids){
   const b=maps[0].has(id)?maps[0].get(id):MISSING,l=maps[1].has(id)?maps[1].get(id):MISSING,r=maps[2].has(id)?maps[2].get(id):MISSING;
   const merged=mergeValue(b,l,r,path+"["+id+"]");
   if(merged!==MISSING)out.push(merged);
  }
  return out;
 }
 if(base&&local&&remote&&!Array.isArray(base)&&!Array.isArray(local)&&!Array.isArray(remote)&&typeof base==="object"&&typeof local==="object"&&typeof remote==="object"){
  const out={},keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  for(const key of keys){
   const b=Object.prototype.hasOwnProperty.call(base,key)?base[key]:MISSING;
   const l=Object.prototype.hasOwnProperty.call(local,key)?local[key]:MISSING;
   const r=Object.prototype.hasOwnProperty.call(remote,key)?remote[key]:MISSING;
   const merged=mergeValue(b,l,r,path?path+"."+key:key);
   if(merged!==MISSING)out[key]=merged;
  }
  return out;
 }
 conflict(path);
}
function normalizeDeletedRecords(value){
 const out={};
 for(const key of DELETED_RECORD_KEYS){
  const items=Array.isArray(value?.[key])?value[key]:[];
  out[key]=[...new Set(items.filter(id=>typeof id==="string"&&id.length>0&&id.length<=128))].slice(-10000);
 }
 return out;
}
function mergeOfflinePayload(base,local,remote){
 if(!base||!local||!remote||[base,local,remote].some(x=>typeof x!=="object"||Array.isArray(x)))throw Error("INVALID_OFFLINE_PAYLOAD");
 const deletedRecords=normalizeDeletedRecords({
  incomes:[...(base.deletedRecords?.incomes||[]),...(local.deletedRecords?.incomes||[]),...(remote.deletedRecords?.incomes||[])],
  budgets:[...(base.deletedRecords?.budgets||[]),...(local.deletedRecords?.budgets||[]),...(remote.deletedRecords?.budgets||[])],
  expenses:[...(base.deletedRecords?.expenses||[]),...(local.deletedRecords?.expenses||[]),...(remote.deletedRecords?.expenses||[])],
  goals:[...(base.deletedRecords?.goals||[]),...(local.deletedRecords?.goals||[]),...(remote.deletedRecords?.goals||[])],
  transactions:[...(base.deletedRecords?.transactions||[]),...(local.deletedRecords?.transactions||[]),...(remote.deletedRecords?.transactions||[])]
 });
 const deriveIncome=[base,local,remote].every(value=>Array.isArray(value.incomes));
 const inputs=[base,local,remote].map(value=>{const copy={...value};delete copy.deletedRecords;if(deriveIncome)delete copy.income;return copy});
 const merged=mergeValue(inputs[0],inputs[1],inputs[2],"");
 merged.deletedRecords=deletedRecords;
 for(const key of DELETED_RECORD_KEYS){
  const deleted=new Set(deletedRecords[key]);
  if(Array.isArray(merged[key]))merged[key]=merged[key].filter(item=>!deleted.has(String(item?.id||"")));
 }
 if(deriveIncome)merged.income=merged.incomes.reduce((sum,item)=>sum+Math.max(0,Number(item?.amount)||0),0);
 return merged;
}
module.exports={mergeOfflinePayload};
