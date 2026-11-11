"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateRule,evaluateRules}=require("../lib/bep-knowledge-engine");
test("accepts only bounded declarative rule types",()=>{
 assert.equal(validateRule({type:"expense_ratio",threshold:.7,title:"Charges élevées",message:"Vérifier les charges"}).threshold,.7);
 assert.throws(()=>validateRule({type:"javascript",threshold:1,title:"x",message:"y"}),/non autorisé/);
 assert.throws(()=>validateRule({type:"expense_ratio",threshold:9,title:"x",message:"y"}),/limites/);
});
test("evaluates approved rules deterministically and ignores pending rules",()=>{
 const rules=[
  {id:"a",status:"active",type:"expense_ratio",threshold:.7,direction:"above",title:"Charges",message:"Examiner les charges"},
  {id:"b",status:"pending",type:"expense_ratio",threshold:.2,direction:"above",title:"Pending",message:"No"}
 ];
 const out=evaluateRules(rules,{income:3000,charges:2400,available:600});
 assert.equal(out.length,1);assert.equal(out[0].id,"a");assert.equal(out[0].value,.8);
});
test("does not evaluate ratios when income is missing",()=>{
 const out=evaluateRules([{status:"active",type:"expense_ratio",threshold:.7,title:"x",message:"y"}],{income:0,charges:100});
 assert.deepEqual(out,[]);
});
