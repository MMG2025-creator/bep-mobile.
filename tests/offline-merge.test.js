"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {mergeOfflinePayload}=require("../lib/bep-offline-merge");

test("offline merge keeps independent record additions from both devices",()=>{
 const base={incomes:[],expenses:[],goals:[],savingsOperations:[]};
 const local={...base,incomes:[{id:"pc-income",amount:2400,label:"Salaire"}]};
 const remote={...base,expenses:[{id:"mobile-expense",amount:42,label:"Courses"}]};
 const merged=mergeOfflinePayload(base,local,remote);
 assert.deepEqual(merged.incomes,local.incomes);
 assert.deepEqual(merged.expenses,remote.expenses);
 assert.equal(merged.income,2400);
});

test("offline merge combines independent edits to the same record",()=>{
 const base={expenses:[{id:"expense-1",label:"Courses",amount:40,category:"Alimentation"}]};
 const local={expenses:[{id:"expense-1",label:"Courses du marché",amount:40,category:"Alimentation"}]};
 const remote={expenses:[{id:"expense-1",label:"Courses",amount:45,category:"Alimentation"}]};
 assert.deepEqual(mergeOfflinePayload(base,local,remote).expenses[0],{id:"expense-1",label:"Courses du marché",amount:45,category:"Alimentation"});
});

test("offline merge rejects competing edits to the same field",()=>{
 const base={goals:[{id:"goal-1",name:"Voyage",monthly:100}]};
 const local={goals:[{id:"goal-1",name:"Voyage été",monthly:100}]};
 const remote={goals:[{id:"goal-1",name:"Voyage hiver",monthly:100}]};
 assert.throws(()=>mergeOfflinePayload(base,local,remote),error=>error.code==="OFFLINE_CONFLICT");
});

test("offline merge rejects delete-versus-edit conflicts",()=>{
 const base={budgets:[{id:"budget-1",label:"Loyer",amount:900}]};
 const local={budgets:[]};
 const remote={budgets:[{id:"budget-1",label:"Loyer",amount:950}]};
 assert.throws(()=>mergeOfflinePayload(base,local,remote),error=>error.code==="OFFLINE_CONFLICT");
});

test("offline merge unions append-only savings operations by stable id",()=>{
 const base={goals:[{id:"goal-1",name:"Voyage"}],savingsOperations:[]};
 const local={goals:base.goals,savingsOperations:[{id:"deposit-pc",goalId:"goal-1",type:"deposit",amount:100,date:"2026-11-15"}]};
 const remote={goals:base.goals,savingsOperations:[{id:"deposit-mobile",goalId:"goal-1",type:"deposit",amount:50,date:"2026-11-15"}]};
 const merged=mergeOfflinePayload(base,local,remote);
 assert.deepEqual(merged.savingsOperations.map(item=>item.id).sort(),["deposit-mobile","deposit-pc"]);
});


test("a durable budget deletion marker prevents a stale device from resurrecting a deleted charge",()=>{
 const deleted={id:"charge-test-r5",label:"test R5",amount:12};
 const base={budgets:[],deletedRecords:{budgets:[]}};
 const local={budgets:[deleted],deletedRecords:{budgets:[]}};
 const remote={budgets:[deleted],deletedRecords:{budgets:["charge-test-r5"]}};
 const merged=mergeOfflinePayload(base,local,remote);
 assert.deepEqual(merged.budgets,[]);
 assert.deepEqual(merged.deletedRecords.budgets,["charge-test-r5"]);
});

test("a local deletion marker removes a charge even when the server still has its old copy",()=>{
 const charge={id:"charge-test-r",label:"test R",amount:10};
 const base={budgets:[charge],deletedRecords:{budgets:[]}};
 const local={budgets:[],deletedRecords:{budgets:["charge-test-r"]}};
 const remote={budgets:[charge],deletedRecords:{budgets:[]}};
 const merged=mergeOfflinePayload(base,local,remote);
 assert.deepEqual(merged.budgets,[]);
 assert.deepEqual(merged.deletedRecords.budgets,["charge-test-r"]);
});
