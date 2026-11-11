"use strict";

// BEP Knowledge Engine: declarative, deterministic rules only. Never execute AI-generated code.
const VERSION="1.0.0";
const ALLOWED_TYPES=Object.freeze({
  expense_ratio:{min:0,max:1.5,field:"expenseRatio"},
  savings_rate:{min:0,max:0.8,field:"savingsRate"},
  monthly_buffer:{min:0,max:100000,field:"available"}
});
function validateRule(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new TypeError("Règle invalide.");
  const type=String(input.type||"");
  const spec=ALLOWED_TYPES[type];
  if(!spec)throw new TypeError("Type de règle non autorisé.");
  const threshold=Number(input.threshold);
  if(!Number.isFinite(threshold)||threshold<spec.min||threshold>spec.max)throw new RangeError("Seuil hors limites.");
  const direction=input.direction==="below"?"below":"above";
  const title=String(input.title||"").trim().slice(0,80);
  const message=String(input.message||"").trim().slice(0,240);
  if(!title||!message)throw new TypeError("Titre et message obligatoires.");
  return Object.freeze({type,threshold,direction,title,message});
}
function evaluateRules(rules,context){
  const ctx=context&&typeof context==="object"?context:{};
  const expenseRatio=Number(ctx.income)>0?Number(ctx.charges||0)/Number(ctx.income):null;
  const savingsRate=Number(ctx.income)>0?Number(ctx.available||0)/Number(ctx.income):null;
  const values={expenseRatio,savingsRate,available:Number(ctx.available)||0};
  return (Array.isArray(rules)?rules:[]).filter(r=>r&&r.status==="active").map(raw=>{
    let rule;try{rule=validateRule(raw)}catch{return null}
    const value=values[ALLOWED_TYPES[rule.type].field];
    if(value===null||!Number.isFinite(value))return null;
    const matched=rule.direction==="below"?value<rule.threshold:value>rule.threshold;
    return matched?{id:raw.id||null,type:rule.type,title:rule.title,message:rule.message,value,threshold:rule.threshold}:null;
  }).filter(Boolean);
}
module.exports={VERSION,ALLOWED_TYPES,validateRule,evaluateRules};
