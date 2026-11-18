"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {cleanImportedContent,assessImportedPage,IMPORT_CLEANING_RULES}=require("../lib/bep-document-ingestion");

test("import cleaning removes navigation and call-to-action noise",()=>{
 const result=cleanImportedContent("Accueil › Épargne\nUn article utile sur le budget familial et les réserves de précaution. Lire la suite →");
 assert.doesNotMatch(result,/Accueil|Lire la suite/);
 assert.match(result,/article utile/);
});

test("category pages with several article teasers are rejected",()=>{
 const result=assessImportedPage({text:"Article A 5 min de lecture. Article B 7 min de lecture. Article C 4 min de lecture."});
 assert.equal(result.accepted,false);
 assert.equal(result.reason,"SOURCE_IS_LISTING_PAGE");
});

test("homepage marketing extracts are rejected",()=>{
 const result=assessImportedPage({text:"Finance personnelle. 385+ synthèses et dossiers publiés. 50k visiteurs mensuels. " + "Présentation de la plateforme. ".repeat(12)});
 assert.equal(result.accepted,false);
 assert.equal(result.reason,"SOURCE_IS_LISTING_PAGE");
});

test("substantive article text is preserved after cleanup",()=>{
 const text="Un budget personnel permet de rapprocher les revenus réellement perçus des dépenses d'une même période. ".repeat(5)+"Accueil › Budget";
 const result=assessImportedPage({text});
 assert.equal(result.accepted,true);
 assert.match(result.content,/rapprocher les revenus/);
 assert.doesNotMatch(result.content,/Accueil/);
});

test("cleaning rules are versioned and enforce a minimum length",()=>{
 assert.equal(IMPORT_CLEANING_RULES.version,1);
 assert.equal(IMPORT_CLEANING_RULES.minimumContentChars,180);
});
