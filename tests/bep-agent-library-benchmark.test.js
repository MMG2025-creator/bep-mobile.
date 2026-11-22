"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const seed=require("../lib/bep-financial-knowledge-seed");
const {REFERENCE_CASES,evaluate,runLibraryBenchmark}=require("../lib/bep-agent/library-benchmark");

test("reference benchmark covers the seven core financial knowledge topics",()=>{
 assert.equal(REFERENCE_CASES.length,7);
 const result=evaluate(seed);
 assert.equal(result.caseCount,7);
 assert.equal(result.hitAt3Rate,1);
});

test("benchmark detects a critical retrieval regression and blocks the candidate gate",()=>{
 const baseline=seed;
 const candidate=seed.filter(x=>x.slug!=="monthly-budget-baseline");
 const result=runLibraryBenchmark({baselineDocuments:baseline,candidateDocuments:candidate});
 assert.ok(result.regressions.includes("budget-period"));
 assert.equal(result.gatePassed,false);
 assert.equal(result.metricScope,"retrieval_coverage_only");
 assert.equal(result.answerQualityMeasured,false);
});

test("benchmark reports improvements without hiding regressions",()=>{
 const baseline=seed.filter(x=>x.slug!=="emergency-savings-first");
 const candidate=seed;
 const result=runLibraryBenchmark({baselineDocuments:baseline,candidateDocuments:candidate});
 assert.ok(result.improvements.includes("emergency-savings"));
 assert.deepEqual(result.regressions,[]);
 assert.equal(result.gatePassed,true);
});
