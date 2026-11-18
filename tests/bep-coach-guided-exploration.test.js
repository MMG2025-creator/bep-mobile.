"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("index.html");
const app=read("app.js");
const css=read("styles.css");

test("Coach exposes three accessible journeys and preserves the open question form",()=>{
 assert.match(html,/data-coach-tab="profile"/);
 assert.match(html,/data-coach-tab="explore"/);
 assert.match(html,/data-coach-tab="open"/);
 assert.match(html,/id="coachPromptForm"/);
 assert.match(html,/id="coachPromptInput"/);
 assert.match(html,/id="coachChatLog"/);
 assert.match(html,/data-coach-tab="profile">Accompagnement/);
 assert.match(html,/data-coach-tab="explore">Explorer/);
 assert.match(html,/data-coach-tab="open">Question libre/);
 assert.match(html,/<p>Pose-moi une question pour améliorer tes finances\.<\/p>/);
 assert.match(html,/id="coachChatLog" class="coach-chat-log" aria-live="polite"><\/div>/);
 assert.doesNotMatch(html,/class="coach-message coach-message-bot"><strong>Coach BEP<\/strong>/);
 assert.ok(html.indexOf('id="coachPanelOpen"')<html.indexOf('class="coach-conversation"'));
 assert.ok(html.indexOf('id="coachPanelOpen"')>html.indexOf('id="coachPanelExplore"'));
});
test("Coach keeps the eight profile preferences and their existing persistence model",()=>{
 for(const key of ["budget","spending","savings","goals","income","debt","planning","learning"])assert.match(html,new RegExp('data-coach-theme="'+key+'"'));
 assert.match(app,/async function persistCoachProfile\(\)/);
 assert.match(app,/coachProfile:\s*state\.coachProfile\s*\|\|\[\]/);
});
test("Question library covers all eight themes with actionable prompts",()=>{
 for(const key of ["budget","spending","savings","goals","income","debt","planning","learning"])assert.match(app,new RegExp('key:"'+key+'"'));
 assert.match(app,/data-coach-question/);
 assert.match(app,/function renderCoachExplorer\(\)/);
 assert.ok(app.includes("syncCoachExplorerFromProfile"));
 assert.ok(html.includes('id="coachShowAllThemes"'));
});
test("Cross-theme questions require at least two themes and separate facts from hypotheses",()=>{
 assert.match(app,/if\(selected\.length<2\)return ""/);
 assert.match(app,/Distingue les faits établis, les hypothèses et les informations qui me manquent/);
 assert.match(html,/Une corrélation observée ne suffit pas à établir une causalité/);
});
test("Coach welcome is ensured on navigation and local documentary flow remains intact",()=>{
 assert.match(app,/function ensureCoachWelcome\(\)/);
 assert.match(app,/if\(id==="coach"\)\{ensureCoachWelcome\(\)/);
 assert.match(app,/fetch\(API\+"\/api\/ai\/chat"/);
 assert.doesNotMatch(app,/gemini\.googleapis\.com/);
});
test("Coach responsive tab and question styles are present",()=>{
 assert.match(css,/\.coach-tabs/);
 assert.match(css,/\.coach-question-button/);
 assert.match(css,/@media\(max-width:480px\)\{\.coach-tabs/);
});
