"use strict";
const {scoreDocument}=require("../bep-financial-intelligence");

const REFERENCE_CASES=Object.freeze([
 {id:"budget-period",question:"Comment comparer mon budget prévu et mes dépenses réelles ?",expectedSlugs:["monthly-budget-baseline"],critical:true},
 {id:"annual-provision",question:"Comment provisionner une dépense annuelle ?",expectedSlugs:["annual-expenses-provision"],critical:true},
 {id:"emergency-savings",question:"Comment constituer une épargne de précaution ?",expectedSlugs:["emergency-savings-first"],critical:true},
 {id:"real-savings",question:"Comment mesurer l'épargne réellement constituée ?",expectedSlugs:["planned-vs-real-savings"],critical:true},
 {id:"debt-priority",question:"Quelle dette rembourser en priorité ?",expectedSlugs:["high-cost-debt-priority"],critical:true},
 {id:"variable-income",question:"Comment construire un budget avec des revenus variables ?",expectedSlugs:["irregular-income-buffer"],critical:true},
 {id:"impulse-purchase",question:"Je veux faire un achat impulsif, comment prendre du recul ?",expectedSlugs:["impulse-purchase-pause"],critical:true}
]);
function rankDocuments(documents,question,limit=6){
 return documents.map(doc=>({slug:doc.slug,title:doc.title,score:scoreDocument(doc,question,{})}))
  .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.slug.localeCompare(b.slug)).slice(0,limit);
}
function evaluate(documents,cases=REFERENCE_CASES){
 const details=cases.map(item=>{
  const ranked=rankDocuments(documents,item.question),rank=ranked.findIndex(x=>item.expectedSlugs.includes(x.slug));
  return{id:item.id,question:item.question,expectedSlugs:item.expectedSlugs,rank:rank<0?null:rank+1,hitAt3:rank>=0&&rank<3,hitAt6:rank>=0&&rank<6,critical:item.critical,top:ranked.slice(0,3)};
 });
 const count=Math.max(1,details.length),hit3=details.filter(x=>x.hitAt3).length,hit6=details.filter(x=>x.hitAt6).length;
 const reciprocal=details.reduce((sum,x)=>sum+(x.rank?1/x.rank:0),0)/count;
 return{caseCount:details.length,hitAt3:hit3,hitAt3Rate:Number((hit3/count).toFixed(4)),hitAt6:hit6,hitAt6Rate:Number((hit6/count).toFixed(4)),meanReciprocalRank:Number(reciprocal.toFixed(4)),details};
}
function runLibraryBenchmark({baselineDocuments,candidateDocuments,cases=REFERENCE_CASES}={}){
 if(!Array.isArray(baselineDocuments)||!Array.isArray(candidateDocuments))throw new Error("BENCHMARK_DOCUMENTS_REQUIRED");
 const baseline=evaluate(baselineDocuments,cases),candidate=evaluate(candidateDocuments,cases);
 const byId=new Map(baseline.details.map(x=>[x.id,x]));
 const regressions=candidate.details.filter(x=>x.critical&&!x.hitAt3&&byId.get(x.id)?.hitAt3).map(x=>x.id);
 const improvements=candidate.details.filter(x=>x.hitAt3&&!byId.get(x.id)?.hitAt3).map(x=>x.id);
 const gatePassed=regressions.length===0&&candidate.hitAt3Rate>=baseline.hitAt3Rate&&candidate.meanReciprocalRank>=baseline.meanReciprocalRank;
 return{baseline,candidate,regressions,improvements,gatePassed,metricScope:"retrieval_coverage_only",answerQualityMeasured:false};
}
module.exports={REFERENCE_CASES,rankDocuments,evaluate,runLibraryBenchmark};
