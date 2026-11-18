"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {importStructuredDocuments,validateDocument}=require("../lib/bep-coach-json-import");
const base={slug:"sample-budget-guide",category:"budget",title:"Guide de budget",content:"Contenu institutionnel suffisamment détaillé pour constituer une fiche documentaire en attente de validation humaine. ".repeat(2),keywords:["budget"],conditions:["condition"],limits:["limite"],sources:[{publisher:"Service-Public.fr",title:"Fiche officielle",url:"https://www.service-public.gouv.fr/particuliers/vosdroits/F1"}],verified_at:"2026-11-16",reliability:{level:"high",basis:"Source institutionnelle"},freshness:"À vérifier",review_status:"pending_admin_approval"};
function mockPool({rowCount=1,failAtCommit=false}={}){const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});if(sql==="COMMIT"&&failAtCommit)throw Error("commit failed");if(sql.includes("INSERT INTO bep_knowledge_candidates"))return{rowCount,rows:rowCount?[{id:12}]:[]};return{rowCount:0,rows:[]}},release(){calls.push({sql:"RELEASE"})}};return{calls,connect:async()=>client};}
test("imports a new structured source as a create candidate without AI or publication",async()=>{const pool=mockPool();const out=await importStructuredDocuments({pool,documents:[base]});const insert=pool.calls.find(x=>x.sql.includes("INSERT INTO bep_knowledge_candidates"));assert.equal(out.created,1);assert.equal(out.aiUsed,false);assert.equal(out.automaticPublication,false);assert.match(insert.sql,/'create'/);assert.equal(insert.params[0],base.slug);assert.equal(JSON.parse(insert.params[8]).category,"budget");assert.deepEqual(JSON.parse(insert.params[8]).keywords,["budget"]);assert.equal(pool.calls[0].sql,"BEGIN");assert.equal(pool.calls.at(-2).sql,"COMMIT");});
test("is idempotent for an already imported document",async()=>{const out=await importStructuredDocuments({pool:mockPool({rowCount:0}),documents:[base]});assert.equal(out.duplicates,1);});
test("rolls back the complete batch if a database operation fails",async()=>{const pool=mockPool({failAtCommit:true});await assert.rejects(()=>importStructuredDocuments({pool,documents:[base]}),/commit failed/);assert.ok(pool.calls.some(x=>x.sql==="ROLLBACK"));});
test("rejects non-HTTPS or non-allowlisted sources before opening a transaction",async()=>{let connections=0;const pool={connect:async()=>{connections++;throw Error("must not connect")}};await assert.rejects(()=>importStructuredDocuments({pool,documents:[{...base,sources:[{...base.sources[0],url:"http://example.org"}]}]}),/SOURCE_NOT_ALLOWLISTED/);await assert.rejects(()=>importStructuredDocuments({pool,documents:[{...base,sources:[{...base.sources[0],url:"https://example.org/doc"}]}]}),/SOURCE_NOT_ALLOWLISTED/);assert.equal(connections,0);});
test("rejects invalid categories and non-pending documents",()=>{assert.throws(()=>validateDocument({...base,category:"unknown"}),/INVALID_CATEGORY/);assert.throws(()=>validateDocument({...base,review_status:"accepted"}),/DOCUMENT_NOT_PENDING/);});
test("rejects duplicate slugs in the same batch before writing",async()=>{let connections=0;const pool={connect:async()=>{connections++;}};await assert.rejects(()=>importStructuredDocuments({pool,documents:[base,base]}),/DUPLICATE_DOCUMENT_SLUG/);assert.equal(connections,0);});

test("all 42 repository documents pass the structured import contract",()=>{
 const sourceSet=require("../src/coach/knowledge/financialCoachSources.additional.fr.json");
 assert.equal(sourceSet.documents.length,62);
 const docs=sourceSet.documents.map(validateDocument);
 assert.equal(new Set(docs.map(x=>x.slug)).size,62);
 assert.ok(docs.every(x=>["income","budget","savings","planning","spending","debt","behavior"].includes(x.category)));
 assert.ok(docs.every(x=>x.sources.length>0&&x.sources.every(s=>new URL(s.url).protocol==="https:")));
});

test("20 new fiches are queued for human approval",()=>{const set=require("../src/coach/knowledge/financialCoachSources.additional.fr.json");const docs=set.documents.filter(x=>x.slug.startsWith("ext-")&&x.verified_at==="2026-11-18");assert.equal(docs.length,20);assert.ok(docs.every(x=>x.review_status==="pending_admin_approval"));});
