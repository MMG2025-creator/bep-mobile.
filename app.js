(()=>{"use strict";
const API=String(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
const DB="bep-mobile-v1",ACTIVE_TAB_KEY="bep-active-tab-v1",ACTIVE_BUDGET_MODULE_KEY="bep-active-budget-module-v1",defaults={income:0,budgets:[],expenses:[],goals:[],transactions:[],savingsOperations:[],coachProfile:[]};
let state;try{state={...defaults,...JSON.parse(localStorage.getItem(DB)||"{}")}}catch{state={...defaults}}
if(!Array.isArray(state.savingsOperations))state.savingsOperations=[];
if(!Array.isArray(state.coachProfile))state.coachProfile=[];
if(!Array.isArray(state.incomes))state.incomes=Number(state.income)>0?[{id:crypto.randomUUID(),label:"Revenu principal",type:"Autre revenu",amount:Number(state.income),source:"migration"}]:[];
function totalIncome(){return (state.incomes||[]).reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0)}
function syncIncomeTotal(){state.income=totalIncome()}
function migrateIncomeState(){const legacyIncome=Math.max(0,Number(state.income)||0),needsMigration=!Array.isArray(state.incomes)||(!state.incomes.length&&legacyIncome>0);if(needsMigration)state.incomes=legacyIncome>0?[{id:crypto.randomUUID(),label:"Revenu principal",type:"Autre revenu",amount:legacyIncome,source:"migration"}]:[];syncIncomeTotal();return needsMigration}
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(n)||0);
function notify(s){const t=$("toast");if(!t)return;t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),4200)}
window.addEventListener("bep:offline-conflict",()=>notify("Synchronisation suspendue : le compte a changé sur un autre appareil. Tes données locales sont préservées, aucune donnée distante n’a été écrasée."));
window.addEventListener("bep:offline-synced",()=>{dispatchLegacyBudgetChanged();notify("Synchronisation BEP terminée.")});
window.addEventListener("bep:offline-sync-error",e=>notify("Synchronisation en attente : "+(e.detail?.message||"connexion indisponible.")));
function charges(){return state.budgets.reduce((a,b)=>a+Number(b.amount),0)}
function financialPosition(options={}){return window.BEPFinancialEngine.calculate({incomes:options.incomes??state.incomes,legacyIncome:options.legacyIncome??state.income,budgets:options.budgets??state.budgets,goals:options.goals??state.goals,expenses:options.expenses??state.expenses,monthKey:options.monthKey,timeZone:options.timeZone,excludeGoalId:options.excludeGoalId})}
function available(){return financialPosition().available}
function availableBeforeSavings(){return financialPosition({goals:[]}).available}
function rate(excludeGoalId){const goals=(state.goals||[]).filter(g=>!g.archivedAt&&g.id!==excludeGoalId),free=Math.max(0,financialPosition({goals}).available),r=totalIncome()?free/totalIncome()*100:0;return r<5?0:r<15?5:r<25?10:r<35?15:20}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function dispatchLegacyBudgetChanged(){window.dispatchEvent(new CustomEvent("bep:legacy-budget-changed",{detail:{income:state.income,incomes:state.incomes,budgets:state.budgets,goals:state.goals}}))}
function save(){try{localStorage.setItem(DB,JSON.stringify(state))}catch(e){notify("Enregistrement local impossible. Vérifie l’espace disponible sur cet appareil.");return false}render();if(window.BEPOffline){window.BEPOffline.enqueue(state).then(()=>{if(!window.bepSignedIn)notify("Données enregistrées sur cet appareil. Synchronisation à la reconnexion.");}).catch(()=>notify("Données conservées en mémoire locale, mais la file de synchronisation est indisponible."));}else if(window.bepSignedIn){fetch(API+"/api/data",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)}).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);dispatchLegacyBudgetChanged()}).catch(()=>notify("Données conservées sur cet appareil, synchronisation à vérifier."));}else dispatchLegacyBudgetChanged();return true}
window.BEP_APPLY_MONTHLY_ITEMS=async(monthKey,monthlyItems)=>{
  const d=new Date(),localMonth=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  if(monthKey!==localMonth||!Array.isArray(monthlyItems))return false;
  const previousGoals=Array.isArray(state.goals)?state.goals:[];
  const savingsRows=monthlyItems.filter(x=>x.itemType==="savings");
  const activeIds=new Set(savingsRows.map(x=>x.sourceItemId||x.id).filter(Boolean));
  const archived=previousGoals.filter(g=>g&&typeof g==="object"&&(g.archivedAt||!activeIds.has(g.id))).map(g=>g.archivedAt?g:{...g,archivedAt:new Date().toISOString()});
  const nextIncomes=monthlyItems.filter(x=>x.itemType==="income").map(x=>({id:x.sourceItemId||x.id||crypto.randomUUID(),label:x.label,type:x.category||"Autre revenu",amount:Number(x.plannedAmount)||0,source:"monthly-history"}));
  const nextIncome=nextIncomes.reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0);
  const nextState={
    ...state,
    incomes:nextIncomes,
    budgets:monthlyItems.filter(x=>x.itemType==="charge").map(x=>({id:x.sourceItemId||x.id||crypto.randomUUID(),label:x.label,category:x.category||"Autres dépenses",nature:x.nature||"unspecified",amount:Number(x.plannedAmount)||0})),
    goals:[...archived,...savingsRows.map(x=>({id:x.sourceItemId||x.id||crypto.randomUUID(),name:x.label,monthly:Number(x.plannedAmount)||0,rate:Number(x.metadata?.rate)||(nextIncome?Number(x.plannedAmount)/nextIncome*100:0),duration:Number(x.metadata?.duration)||3}))]
  };
  nextState.income=nextIncome;
  try{localStorage.setItem(DB,JSON.stringify(nextState))}
  catch(e){throw Error("Le serveur a été synchronisé, mais l’enregistrement local a échoué. Recharge les données depuis ton compte.")};
  state=nextState;
  if(window.BEPOffline)await window.BEPOffline.enqueue(nextState);
  render();
  return true;
};
async function persistMigratedIncomeState(){const migrated=migrateIncomeState();localStorage.setItem(DB,JSON.stringify(state));if(migrated&&window.BEPOffline)await window.BEPOffline.enqueue(state)}
const AI_USAGE_KEY="bep-ai-usage-v1";
let coachFirstName="";
function addressAdvice(message){const clean=String(message||"").trim();return coachFirstName&&clean?coachFirstName+", "+clean.charAt(0).toLowerCase()+clean.slice(1):clean}
let aiUsage={requests:0,estimatedTokens:0,totalMs:0,lastByTab:{}};try{aiUsage={...aiUsage,...JSON.parse(localStorage.getItem(AI_USAGE_KEY)||"{}")}}catch{}
function makeAdviceContent(id){
 const income=totalIncome(),spent=charges(),left=available(),goals=(state.goals||[]).filter(g=>!g.archivedAt),expenses=state.expenses||[],incomeRows=state.incomes||[],budgetRows=state.budgets||[];
 if(id==="home"){if(!income)return "Commence par renseigner ton revenu mensuel et tes charges. BEP pourra ensuite calculer ton reste disponible et t’aider à fixer une priorité.";if(left<0)return "Tes charges dépassent tes revenus de "+money(-left)+". Priorité : identifier une dépense ajustable avant d’augmenter ton épargne.";if(left/income<.1)return "Ton reste disponible est inférieur à 10 % de tes revenus. Protège d’abord ta trésorerie et évite de prendre un engagement d’épargne trop élevé.";return "Ton reste disponible est de "+money(left)+". Définis une priorité pour cette somme : sécurité, épargne ou dépense planifiée."}
 if(id==="budget"){if(!income)return "Renseigne ton revenu mensuel pour mesurer le poids réel de tes charges.";const ratio=spent/income*100;const largest=[...budgetRows].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];return ratio>75?"Tes charges représentent "+Math.round(ratio)+" % de tes revenus. Examine d’abord les postes les plus importants, sans fragiliser les dépenses essentielles.": "Tes charges représentent "+Math.round(ratio)+" % de tes revenus."+(largest?" Ton premier poste est "+(largest.label||largest.category)+" ("+money(largest.amount)+"). Vérifie s’il correspond toujours à tes besoins.":" Ajoute tes charges pour obtenir une analyse plus précise.")}
 if(id==="income"){
  if(!incomeRows.length)return "Aucun revenu n’est enregistré. Ajoute les montants nets que tu perçois : salaire, allocations, pensions, loyers ou revenus indépendants. Pour les primes et revenus irréguliers, indique une moyenne mensuelle prudente.";
  const variable=incomeRows.filter(x=>/indépend|complément|variable|commission|prime|locatif/i.test((x.type||"")+" "+(x.label||"")));
  const largest=[...incomeRows].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
  if(variable.length)return incomeRows.length+" sources enregistrées : "+money(income)+" nets par mois. Certaines peuvent varier d’un mois à l’autre. Pour construire ton budget, retiens une moyenne prudente et ne compte pas les primes exceptionnelles comme un revenu régulier.";
  if(incomeRows.length===1)return "1 source de revenu enregistrée : "+money(income)+" nets par mois. Vérifie si tu perçois aussi des allocations, pensions, loyers ou revenus complémentaires réguliers.";
  return incomeRows.length+" sources enregistrées : "+money(income)+" nets par mois. La plus élevée est « "+(largest.label||largest.type||"Revenu principal")+" » ("+money(largest.amount)+"). Vérifie que chaque montant correspond bien à ce que tu perçois et qu’aucun revenu n’est compté deux fois.";
 }
 if(id==="charges"){
  if(!budgetRows.length)return "Aucune charge n’est enregistrée. Commence par ajouter ton logement, tes crédits, factures, assurances, impôts, transports, santé, frais liés aux enfants et abonnements. Pour une dépense annuelle, divise son montant par 12 pour obtenir son équivalent mensuel.";
  const ratio=income>0?spent/income*100:null,largest=[...budgetRows].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
  const text=(budgetRows.map(x=>(x.label||"")+" "+(x.category||"")).join(" "));
  const checks=[["assurances et mutuelle",/assur|mutuelle/i],["impôts et taxes annuels",/imp.t|taxe|fonci.re/i],["transport et entretien du véhicule",/transport|carburant|navigo|parking|véhicule|voiture/i],["frais des enfants et de scolarité",/enfant|école|cantine|garde|scolarit|pension alimentaire/i],["abonnements et télécommunications",/abonnement|streaming|internet|téléphone|mobile/i],["santé et soins",/santé|médecin|pharmacie|dentaire|optique/i]];
  const missing=checks.filter(([,re])=>!re.test(text)).map(([label])=>label).slice(0,2);
  const ratioText=ratio===null?"Ajoute tes revenus pour connaître la part de ton budget consacrée aux charges.":"Elles représentent "+Math.round(ratio)+" % de tes revenus"+(ratio>75?" : vérifie en priorité les postes qui peuvent être ajustés.":ratio>50?" : surveille leur évolution.":".");
  return budgetRows.length+" charges enregistrées : "+money(spent)+" par mois. "+ratioText+" Le poste le plus élevé est « "+(largest.label||largest.category)+" » ("+money(largest.amount)+"). "+(missing.length?"À vérifier : "+missing.join(" et ")+".":"Pense aussi aux dépenses annuelles et irrégulières, à répartir sur 12 mois.");
 }
 if(id==="savings"){if(!income)return "Avant de programmer une épargne, renseigne tes revenus et tes charges. L’objectif doit rester soutenable.";if(left<=0)return "Ton budget ne dégage pas de marge positive. Ne force pas l’épargne : commence par rééquilibrer les charges.";if(!goals.length)return "Aucun objectif n’est encore programmé. Commence par un montant modeste que tu peux tenir chaque mois.";const monthly=goals.reduce((n,g)=>n+Number(g.monthly||0),0);return "Tu as programmé "+money(monthly)+" par mois. Cela représente "+(income?Math.round(monthly/income*100):0)+" % de tes revenus. Vérifie que cet engagement reste compatible avec les imprévus."}
 if(id==="purchases"){const month=expenses.filter(p=>{const d=new Date(p.at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()});const total=month.reduce((n,p)=>n+Number(p.amount||0),0);if(!month.length)return "Aucun achat enregistré ce mois-ci. Avant chaque dépense, distingue le besoin réel de l’envie et vérifie l’enveloppe disponible.";const impulsive=month.filter(p=>p.psychology==="impulsive"||p.psychology==="pressure").length;return month.length+" achat(s) enregistré(s) ce mois-ci, pour "+money(total)+"."+(impulsive?" "+impulsive+" achat(s) ont été déclarés sous impulsion ou pression : prends un délai avant les prochaines décisions.":" Continue à vérifier le besoin et le montant avant de valider.")}
 return "Analyse tes chiffres, fixe une priorité et avance par décisions simples et soutenables.";
}
function makeAdvice(id){return addressAdvice(makeAdviceContent(id))}
const adviceRequestIds={},adviceFingerprints={};
function currentFinancialContext(){return {income:totalIncome(),incomes:(state.incomes||[]).slice(0,30),charges:charges(),available:available(),financialPosition:financialPosition(),budgets:(state.budgets||[]).slice(0,40),goals:(state.goals||[]).slice(0,20),expenses:(state.expenses||[]).slice(0,40),transactions:(state.transactions||[]).slice(-80)}}
const COACH_THEMES={budget:"Gérer mon budget",spending:"Maîtriser mes dépenses",savings:"Développer mon épargne",goals:"Atteindre mes objectifs",income:"Améliorer mes revenus",debt:"Réduire mes dettes",planning:"Anticiper les imprévus",learning:"Comprendre mes finances"};
function renderCoachProfile(){
 const selected=new Set((state.coachProfile||[]).filter(x=>Object.prototype.hasOwnProperty.call(COACH_THEMES,x)));
 document.querySelectorAll("[data-coach-theme]").forEach(input=>{input.checked=selected.has(input.dataset.coachTheme);input.closest(".coach-profile-option")?.classList.toggle("selected",input.checked)});
 const count=$("coachProfileCount");if(count){const n=selected.size;count.textContent=n?n+" thématique"+(n>1?"s":"")+" sélectionnée"+(n>1?"s":""):"Aucune thématique sélectionnée"}
}
async function persistCoachProfile(){
 state.coachProfile=(state.coachProfile||[]).filter(x=>Object.prototype.hasOwnProperty.call(COACH_THEMES,x));
 try{localStorage.setItem(DB,JSON.stringify(state))}catch{}
 renderCoachProfile();
 const status=$("coachProfileSaved");if(status)status.textContent="Enregistrement…";
 if(window.BEPOffline){try{await window.BEPOffline.enqueue(state);if(status)status.textContent="Profil enregistré sur cet appareil. Synchronisation sécurisée en attente ou effectuée."}catch{if(status)status.textContent="Profil enregistré localement. File de synchronisation indisponible."}}
 else if(status)status.textContent="Profil enregistré sur cet appareil. Il sera synchronisé à la connexion.";
}
document.querySelectorAll("[data-coach-theme]").forEach(input=>input.addEventListener("change",()=>{const key=input.dataset.coachTheme,selected=new Set(state.coachProfile||[]);input.checked?selected.add(key):selected.delete(key);state.coachProfile=[...selected];persistCoachProfile()}));
renderCoachProfile();

async function recordAdvice(id){
 const target=$("ai"+id.charAt(0).toUpperCase()+id.slice(1));if(!target)return;
 if(window.bepSignedIn&&!aiConnection.mode)await loadAiConnection();if(!(window.bepSignedIn&&["bep","structured"].includes(aiConnection?.mode))){target.textContent=makeAdvice(id);return}
 const context=currentFinancialContext(),fingerprint=JSON.stringify({zone:id,context,provider:aiConnection.provider,model:aiConnection.model});
 if(adviceFingerprints[id]===fingerprint&&target.textContent!=="Ton IA analyse ta situation financière…")return;
 adviceFingerprints[id]=fingerprint;
 const requestId=(adviceRequestIds[id]||0)+1;adviceRequestIds[id]=requestId;
 target.textContent="Ton IA analyse ta situation financière…";
 try{
  const started=performance.now();
  const r=await fetch(API+"/api/ai/advice",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({zone:id==="monthly"?"budget":id,financialContext:context,coachProfile:state.coachProfile||[]})});
  const d=await r.json();if(!r.ok)throw Error(d.message||"Conseil IA indisponible.");
  if(adviceRequestIds[id]!==requestId)return;
  target.textContent=d.answer;
  const elapsed=Math.max(0,performance.now()-started),tokens=Number(d.usage?.total_tokens)||Math.max(1,Math.ceil(String(d.answer||"").length/4));
  aiUsage.requests=(Number(aiUsage.requests)||0)+1;aiUsage.estimatedTokens=(Number(aiUsage.estimatedTokens)||0)+tokens;aiUsage.totalMs=(Number(aiUsage.totalMs)||0)+elapsed;aiUsage.lastByTab=aiUsage.lastByTab||{};aiUsage.lastByTab[id]=new Date().toISOString();
  try{localStorage.setItem(AI_USAGE_KEY,JSON.stringify(aiUsage))}catch{}renderAIUsage();
 }catch(e){if(adviceRequestIds[id]===requestId){delete adviceFingerprints[id];target.textContent="Le conseil IA est momentanément indisponible. "+(e.message||"Réessaie dans quelques instants.")}}
}
function renderAI(){const panel=document.querySelector(".panel.active")?.id;const ids=panel==="budget"?[activeBudgetModule]:panel==="home"?["home"]:panel==="savings"?["savings"]:panel==="purchases"?["purchases"]:[];if(window.bepSignedIn&&["bep","structured"].includes(aiConnection?.mode)){ids.forEach(id=>recordAdvice(id));return}ids.forEach(id=>{const target=$("ai"+id.charAt(0).toUpperCase()+id.slice(1));if(target)target.textContent=makeAdvice(id)})}
function renderAIUsage(){const count=$("aiRequestCount");if(!count)return;count.textContent=Number(aiUsage.requests)||0;$("aiTokenCount").textContent=(Number(aiUsage.estimatedTokens)||0).toLocaleString("fr-FR");$("aiLatency").textContent=(aiUsage.requests?Math.round((Number(aiUsage.totalMs)||0)/aiUsage.requests):0)+" ms";$("aiCost").textContent="0,00 €"}
const VALID_PANEL_IDS=new Set(["home","budget","savings","purchases","coach","settings"]);function getSavedTab(){try{const id=localStorage.getItem(ACTIVE_TAB_KEY);return VALID_PANEL_IDS.has(id)&&document.getElementById(id)?.classList.contains("panel")?id:"home"}catch{return "home"}}function tab(id){if(!VALID_PANEL_IDS.has(id)||!document.getElementById(id)?.classList.contains("panel"))id="home";try{localStorage.setItem(ACTIVE_TAB_KEY,id)}catch{}document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===id));document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===id));document.querySelector(".welcome")?.classList.toggle("hidden",id!=="home");window.scrollTo(0,0);if(id==="coach"&&window.bepSignedIn)loadAiConnection();if(id==="budget")recordAdvice(activeBudgetModule);else if(["home","savings","purchases"].includes(id))recordAdvice(id)}
let activeBudgetModule="income";
function setBudgetModule(name){if(!["income","charges","monthly"].includes(name))return;activeBudgetModule=name;try{localStorage.setItem(ACTIVE_BUDGET_MODULE_KEY,name)}catch{}document.querySelectorAll("[data-budget-module]").forEach(button=>{const active=button.dataset.budgetModule===name;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});document.querySelectorAll(".budget-module").forEach(panel=>{panel.hidden=panel.id!=="budgetModule"+name.charAt(0).toUpperCase()+name.slice(1)});document.querySelectorAll("[data-budget-advice]").forEach(advice=>{advice.hidden=advice.dataset.budgetAdvice!==name});if(document.getElementById("budget")?.classList.contains("active"))recordAdvice(name)}
// Event delegation in capture phase: keeps budget tabs functional even when
// their inner content is clicked or the module markup is re-rendered.
document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 const button=target?.closest(".budget-module-tab[data-budget-module]");
 if(!button||!document.getElementById("budget")?.contains(button))return;
 event.preventDefault();
 setBudgetModule(button.dataset.budgetModule);
},true);
setBudgetModule((()=>{try{const saved=localStorage.getItem(ACTIVE_BUDGET_MODULE_KEY);return ["income","charges","monthly"].includes(saved)?saved:"income"}catch{return "income"}})());
document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>tab(x.dataset.tab));$("homeLink").onclick=e=>{e.preventDefault();tab("home")};document.querySelectorAll("[data-goto]").forEach(x=>x.onclick=()=>tab(x.dataset.goto));$("settingsBtn").onclick=async()=>{tab("settings");if(!window.bepSignedIn)return;loadAiConnection();try{const r=await fetch(API+"/api/me",{credentials:"include",cache:"no-store"});if(!r.ok)throw Error("Profil indisponible.");const d=await r.json(),u=d.user||{};$("profileFirstName").value=u.firstName||"";$("profileLastName").value=u.lastName||"";$("profilePhone").value=u.phone||"";$("profileEmail").textContent=u.email||""}catch(e){notify(e.message)}};
$("linkGoogleBtn").onclick=async()=>{const button=$("linkGoogleBtn"),status=$("googleLinkStatus");button.disabled=true;status.textContent="Vérification du compte BEP…";try{const r=await fetch(API+"/api/auth/google/link/start",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("accountProofInput").value})});const d=await r.json();if(!r.ok)throw Error(d.message||"Impossible de démarrer l'association.");if(!d.url)throw Error("Adresse de connexion Google manquante.");window.location.href=d.url}catch(e){status.textContent=e.message;button.disabled=false}};
$("profileForm").onsubmit=async e=>{e.preventDefault();const button=$("saveProfileBtn"),status=$("profileStatus");button.disabled=true;status.textContent="Enregistrement…";try{const r=await fetch(API+"/api/profile",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName:$("profileFirstName").value,lastName:$("profileLastName").value,phone:$("profilePhone").value})});const d=await r.json();if(!r.ok)throw Error(d.message||"Enregistrement impossible.");coachFirstName=$("profileFirstName").value.trim();status.textContent="Profil enregistré.";renderAI();notify("Profil mis à jour");window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"profile"}}))}catch(e){status.textContent=e.message}finally{button.disabled=false}};
$("deleteAccountBtn").onclick=async()=>{if(!window.bepSignedIn)return notify("Connecte-toi pour supprimer ton compte.");if(!window.confirm("Supprimer définitivement ton compte BEP et toutes les données associées ? Cette action est irréversible."))return;const button=$("deleteAccountBtn");button.disabled=true;button.textContent="Suppression…";try{const r=await fetch(API+"/api/account",{method:"DELETE",credentials:"include",cache:"no-store"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.message||"La suppression du compte a échoué.");window.bepSignedIn=false;window.dispatchEvent(new Event("bep:auth-ready"));localStorage.removeItem(DB);localStorage.removeItem(ACTIVE_TAB_KEY);localStorage.removeItem(ACTIVE_BUDGET_MODULE_KEY);localStorage.removeItem(PENDING_EMAIL_KEY);localStorage.removeItem(AI_USAGE_KEY);state={...defaults};syncIncomeTotal();gate.hidden=false;authMode("login");$("loginEmail").value="";$("loginPassword").value="";authMessage.textContent="Ton compte et toutes les données associées ont été supprimés.";button.textContent="Supprimer mon compte";button.disabled=false;render()}catch(e){notify(e.message||"Erreur pendant la suppression.");button.textContent="Supprimer mon compte";button.disabled=false}};
let pdfPreviewRows=[];
const pdfCategories=["Logement","Factures","Alimentation","Transport","Crédits","Famille","Loisirs","Autres dépenses"];
function pdfCleanText(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()}
function pdfDateValue(raw){const p=raw.split(/[/.]/).map(Number);if(p.length!==3)return null;let y=p[2];if(y<100)y+=2000;if(p[0]<1||p[0]>31||p[1]<1||p[1]>12||y<2000||y>2100)return null;return String(y)+"-"+String(p[1]).padStart(2,"0")+"-"+String(p[0]).padStart(2,"0")}
function pdfMoneyValue(raw){const n=Number(String(raw).replace(/\s/g,"").replace(/\./g,"").replace(",",".").replace(/[^\d.+-]/g,""));return Number.isFinite(n)?Math.abs(n):NaN}
function pdfCategory(description){const s=pdfCleanText(description);if(/loyer|bail|agence immobiliere|syndic/.test(s))return "Logement";if(/edf|engie|electricite|gaz|veolia|eau |internet|orange|sfr|bouygues|free mobile|assurance/.test(s))return "Factures";if(/carrefour|leclerc|lidl|auchan|monoprix|intermarche|super u|franprix|boulangerie|primeur|epicerie/.test(s))return "Alimentation";if(/ratp|sncf|uber|bolt|total|shell|esso|station service|essence|parking|navigo/.test(s))return "Transport";if(/credit|pret|echeance|cofidis|cetelem|sofinco/.test(s))return "Crédits";if(/cantine|ecole|creche|pension|famille|enfant/.test(s))return "Famille";if(/netflix|spotify|cinema|theatre|concert|restaurant|loisir|decathlon|club sportif/.test(s))return "Loisirs";return "Autres dépenses"}
function pdfFingerprint(row){return row.date+"|"+(Number(row.amount)||0).toFixed(2)+"|"+pdfCleanText(row.description).slice(0,180)}
function pdfDateFilter(){const mode=$("statementPeriod").value,now=new Date(),key=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");let start="",end="";if(mode==="current_month"){start=key(new Date(now.getFullYear(),now.getMonth(),1));end=key(now)}if(mode==="last_7_days"){const d=new Date(now);d.setDate(d.getDate()-6);start=key(d);end=key(now)}if(mode==="previous_month"){start=key(new Date(now.getFullYear(),now.getMonth()-1,1));end=key(new Date(now.getFullYear(),now.getMonth(),0))}if(mode==="custom"){start=$("statementStart").value;end=$("statementEnd").value;if(!start||!end||start>end)throw Error("Renseigne une période personnalisée valide.")}return {start,end}}
function pdfSetStatus(message,isError){const el=$("pdfImportStatus");el.textContent=message;el.classList.remove("hidden","warning");if(isError)el.classList.add("warning")}
function pdfRenderSummary(){const selected=pdfPreviewRows.filter(x=>x.selected&&!x.duplicate),debits=selected.filter(x=>x.type==="debit").reduce((n,x)=>n+Math.abs(x.amount),0),credits=selected.filter(x=>x.type==="credit").reduce((n,x)=>n+Math.abs(x.amount),0),duplicates=pdfPreviewRows.filter(x=>x.duplicate).length,review=pdfPreviewRows.filter(x=>x.ambiguous).length;$("pdfReviewSummary").innerHTML="<b>"+selected.length+" sélectionnée(s)</b><span>Dépenses : "+money(debits)+"</span><span>Crédits : "+money(credits)+"</span><span>"+duplicates+" doublon(s) · "+review+" à vérifier</span>";$("confirmPdfImport").disabled=selected.length===0}
function pdfRenderRows(){const options=pdfCategories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");$("pdfReviewRows").innerHTML=pdfPreviewRows.map((r,i)=>{const warning=r.duplicate?"Doublon potentiel — déjà importé":(r.ambiguous?"Plusieurs montants détectés — vérifie le montant":"");return '<article class="pdf-transaction '+(r.duplicate?"is-duplicate":"")+'"><div class="pdf-transaction-top"><label class="pdf-check"><input type="checkbox" data-pdf-selected="'+i+'" '+(r.selected?"checked":"")+(r.duplicate?" disabled":"")+'><span>Importer</span></label><span class="pdf-date">'+esc(new Date(r.date+"T12:00:00").toLocaleDateString("fr-FR"))+'</span></div><b class="pdf-description">'+esc(r.description)+'</b>'+(warning?'<p class="pdf-row-warning">'+esc(warning)+'</p>':"")+'<div class="pdf-row-fields"><label>Montant (€)<input type="number" min="0" step="0.01" value="'+Math.abs(r.amount).toFixed(2)+'" data-pdf-amount="'+i+'"></label><label>Type<select data-pdf-type="'+i+'"><option value="debit" '+(r.type==="debit"?"selected":"")+'>Dépense</option><option value="credit" '+(r.type==="credit"?"selected":"")+'>Revenu / crédit</option></select></label><label>Catégorie<select data-pdf-category="'+i+'">'+options.replace('value="'+esc(r.category)+'"','value="'+esc(r.category)+'" selected')+'</select></label></div></article>'}).join("");pdfRenderSummary()}
async function loadPdfJs(){if(window.pdfjsLib)return window.pdfjsLib;await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=resolve;s.onerror=()=>reject(Error("Impossible de charger le lecteur PDF."));document.head.appendChild(s)});return window.pdfjsLib}
async function loadTesseract(){if(window.Tesseract)return window.Tesseract;await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";s.onload=resolve;s.onerror=()=>reject(Error("Impossible de charger le moteur OCR."));document.head.appendChild(s)});return window.Tesseract}
async function pdfExtractTransactions(file){if(!window.pdfjsLib)await loadPdfJs();window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";const data=new Uint8Array(await file.arrayBuffer()),doc=await window.pdfjsLib.getDocument({data}).promise,found=[];for(let pageNo=1;pageNo<=doc.numPages;pageNo++){const page=await doc.getPage(pageNo),content=await page.getTextContent(),groups=[];content.items.filter(x=>x.str&&x.str.trim()).forEach(item=>{const y=Number(item.transform&&item.transform[5])||0;let group=groups.find(g=>Math.abs(g.y-y)<=2);if(!group){group={y,items:[]};groups.push(group)}group.items.push(item)});const lines=groups.sort((a,b)=>b.y-a.y).map(g=>g.items.sort((a,b)=>(Number(a.transform&&a.transform[4])||0)-(Number(b.transform&&b.transform[4])||0)).map(x=>x.str).join(" ").replace(/\s+/g," ").trim());for(const line of lines){const dateMatch=line.match(/\b\d{2}[/.]\d{2}[/.]\d{2,4}\b/),amountMatches=line.match(/[+-]?\s*\d{1,3}(?:[ .]\d{3})*,\d{2}|[+-]?\s*\d+,\d{2}/g);if(!dateMatch||!amountMatches||!amountMatches.length)continue;const date=pdfDateValue(dateMatch[0]);if(!date)continue;const description=line.replace(dateMatch[0]," ").replace(/[+-]?\s*\d{1,3}(?:[ .]\d{3})*,\d{2}|[+-]?\s*\d+,\d{2}/g," ").replace(/€/g," ").replace(/\s+/g," ").trim();if(!description||/\b(solde|total des operations|ancien solde|nouveau solde)\b/i.test(description))continue;const amount=pdfMoneyValue(amountMatches[0]);if(!Number.isFinite(amount)||amount<=0)continue;const credit=/virement recu|virement en votre faveur|vir(?:ement)?\s+(?:sepa\s+)?(?:recu|entrant)|salaire|remboursement|versement|depot|interets crediteurs|avoir|prestation|allocations/i.test(description);found.push({date,description:description.slice(0,180),amount:credit?amount:-amount,type:credit?"credit":"debit",category:pdfCategory(description),ambiguous:amountMatches.length>1,page:pageNo})}}if(!found.length)throw Error("Aucune opération lisible détectée. Le PDF est peut-être scanné, protégé ou dans un format bancaire non reconnu.");return found}
if($("statementPeriod")){
$("statementPeriod").addEventListener("change",()=>$("statementCustomPeriod").classList.toggle("hidden",$("statementPeriod").value!=="custom"));
$("analyzePdf").addEventListener("click",async()=>{const file=$("statementPdf").files&&$("statementPdf").files[0];if(!file)return pdfSetStatus("Sélectionne d'abord un relevé PDF.",true);if(!/\.pdf$/i.test(file.name)&&file.type!=="application/pdf")return pdfSetStatus("Le fichier doit être au format PDF.",true);if(file.size>15*1024*1024)return pdfSetStatus("Le fichier dépasse la limite de 15 Mo.",true);$("analyzePdf").disabled=true;$("pdfReview").classList.add("hidden");pdfSetStatus("Lecture du relevé sur cet appareil…");try{const range=pdfDateFilter(),all=await pdfExtractTransactions(file),filtered=all.filter(r=>(!range.start||r.date>=range.start)&&(!range.end||r.date<=range.end));if(!filtered.length)throw Error("Aucune opération ne correspond à la période choisie.");const existing=new Set([...(state.transactions||[]).map(x=>x.fingerprint),...(state.expenses||[]).map(x=>x.sourceHash)].filter(Boolean));pdfPreviewRows=filtered.map(r=>{const fingerprint=pdfFingerprint(r),duplicate=existing.has(fingerprint);existing.add(fingerprint);return {...r,fingerprint,duplicate,selected:!duplicate&&!r.ambiguous}});pdfRenderRows();$("pdfReview").classList.remove("hidden");pdfSetStatus(filtered.length+" opération(s) détectée(s) sur "+all.length+". Vérifie la sélection avant enregistrement.")}catch(e){pdfSetStatus(e.message||"Impossible de lire ce PDF.",true)}finally{$("analyzePdf").disabled=false}});
$("pdfReviewRows").addEventListener("change",e=>{const el=e.target,idx=Number(el.dataset.pdfSelected??el.dataset.pdfType??el.dataset.pdfCategory);if(!Number.isInteger(idx)||!pdfPreviewRows[idx])return;const row=pdfPreviewRows[idx];if(el.dataset.pdfSelected!==undefined)row.selected=el.checked;if(el.dataset.pdfType!==undefined){row.type=el.value;row.amount=Math.abs(row.amount)*(row.type==="credit"?1:-1)}if(el.dataset.pdfCategory!==undefined)row.category=el.value;pdfRenderSummary()});
$("pdfReviewRows").addEventListener("input",e=>{const el=e.target;if(el.dataset.pdfAmount===undefined)return;const idx=Number(el.dataset.pdfAmount),row=pdfPreviewRows[idx];if(!row)return;const n=Number(el.value);if(Number.isFinite(n)&&n>=0)row.amount=n*(row.type==="credit"?1:-1);pdfRenderSummary()});
$("confirmPdfImport").addEventListener("click",()=>{const selected=pdfPreviewRows.filter(r=>r.selected&&!r.duplicate);if(!selected.length)return notify("Sélectionne au moins une opération.");const known=new Set([...(state.transactions||[]).map(x=>x.fingerprint),...(state.expenses||[]).map(x=>x.sourceHash)].filter(Boolean)),transactions=[],expenses=[];selected.forEach(r=>{const amount=Math.abs(Number(r.amount))*(r.type==="credit"?1:-1),fingerprint=pdfFingerprint({...r,amount});if(known.has(fingerprint))return;known.add(fingerprint);const id=crypto.randomUUID();transactions.push({id,date:r.date,description:r.description,amount,currency:"EUR",type:r.type,category:r.category,fingerprint,source:"pdf_import",importedAt:new Date().toISOString()})});state.transactions=[...(state.transactions||[]),...transactions].slice(-2000);save();$("pdfReview").classList.add("hidden");$("statementPdf").value="";pdfSetStatus(transactions.length+" opération(s) enregistrée(s) dans l’historique des imports. Elles ne sont pas ajoutées aux achats ni transformées en charges budgétaires automatiquement.");notify("Import PDF enregistré")});
$("cancelPdfImport").addEventListener("click",()=>{$("pdfReview").classList.add("hidden");pdfPreviewRows=[];$("statementPdf").value="";pdfSetStatus("Import annulé. Aucune opération n'a été enregistrée.")});
}




const bankImageCategories=pdfCategories;let imageCandidates=[],imageCandidateIndex=0;
function imageStatus(message,isError=false){const el=$("imageImportStatus");el.textContent=message;el.classList.remove("hidden","warning");if(isError)el.classList.add("warning")}
function imageMoney(raw){let s=String(raw||"").replace(/[^0-9,.-]/g,"");if(!s)return NaN;if(s.includes(",")&&s.includes(".")){if(s.lastIndexOf(",")>s.lastIndexOf("."))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"")}else if(s.includes(","))s=s.replace(",",".");const n=Number(s);return Number.isFinite(n)?Math.abs(n):NaN}
function imageCategory(text){const s=pdfCleanText(text);if(/loyer|immobilier|syndic|foncier/.test(s))return "Logement";if(/edf|engie|electric|energie|eau|gaz|orange|sfr|free|bouygues|internet|telephone|assurance|mutuelle|abonnement|netflix|spotify|prlv|prelevement/.test(s))return "Factures";if(/carrefour|leclerc|auchan|lidl|aldi|monoprix|courses|supermarche/.test(s))return "Alimentation";if(/sncf|ratp|essence|totalenergies|uber|bolt|parking|peage/.test(s))return "Transport";if(/credit|pret|echeance|cofidis|cetelem|sofinco/.test(s))return "Crédits";if(/cantine|ecole|creche|pension|famille|enfant/.test(s))return "Famille";if(/cinema|theatre|concert|restaurant|loisir|decathlon|club sportif/.test(s))return "Loisirs";return "Autres dépenses"}
async function imageGreenHighlight(file,bbox){try{if(!bbox||![bbox.x0,bbox.y0,bbox.x1,bbox.y1].every(Number.isFinite))return false;const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const x=Math.max(0,Math.floor(bbox.x0)),y=Math.max(0,Math.floor(bbox.y0)),w=Math.min(bitmap.width-x,Math.ceil(bbox.x1-bbox.x0)),h=Math.min(bitmap.height-y,Math.ceil(bbox.y1-bbox.y0));if(w<=0||h<=0){bitmap.close();return false}const data=ctx.getImageData(x,y,w,h).data;let green=0,total=0;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(g>105&&g>r*1.10&&g>b*1.04)green++;total++}bitmap.close();return total>0&&green/total>.035}catch{return false}}
function imageCandidateFromLine(line,fileName,greenCue=false){const clean=String(line||"").replace(/\s+/g," ").trim();if(clean.length<5||/solde|disponible|plafond|total des operations|ancien solde|nouveau solde|date valeur|date operation|iban|bic|numero de compte/i.test(pdfCleanText(clean)))return null;const matches=clean.match(/[-+]?\s*\d[\d\s.,]*[,.]\d{2}/g);if(!matches?.length)return null;const amount=imageMoney(matches[matches.length-1]);if(!Number.isFinite(amount)||amount<0.01||amount>100000)return null;const description=clean.replace(matches[matches.length-1]," ").replace(/\b\d{2}[/.]\d{2}(?:[/.]\d{2,4})?\b/g," ").replace(/[€$]/g," ").replace(/\s+/g," ").trim();if(!description||description.length<2)return null;const cleanedDescription=description.replace(/[©®™]/g," ").replace(/^[^A-Za-zÀ-ÿ0-9]+/,"").replace(/\s+/g," ").trim(),normalized=pdfCleanText(cleanedDescription),salary=/salaire|paie|remuneration|bulletin|caf|pole emploi|france travail|alloca/.test(normalized),credit=/virement en votre faveur|virement recu|virement entrant|remboursement|versement|prestation|allocation|alloca|salaire|paie|pension/.test(normalized),financing=/\b(?:3|4|10|12)\s*x\b|credit|pret|echeance|mensualite|cofidis|cetelem|sofinco|franfinance|younited/.test(normalized),recurring=/loyer|assurance|mutuelle|edf|engie|electric|energie|eau|gaz|telephone|internet|orange|sfr|free|bouygues|abonnement|prelevement|prlv/.test(normalized);const finalDescription=cleanedDescription.slice(0,120);return {description:finalDescription,amount,type:(salary||credit)?"income":((financing||recurring)?"budget":"ignore"),category:financing?"Crédits":imageCategory(finalDescription),source:fileName||"Capture bancaire",rawLine:clean}}
function imageOcrRows(data){const words=(data?.words||[]).filter(w=>String(w.text||"").trim()&&w.bbox&&Number.isFinite(w.bbox.y0)&&Number.isFinite(w.bbox.y1)&&(w.confidence==null||w.confidence>=18));if(!words.length)return (data?.lines||[]).map(l=>({text:String(l.text||""),bbox:l.bbox||null,centerY:l.bbox?(l.bbox.y0+l.bbox.y1)/2:0,height:l.bbox?l.bbox.y1-l.bbox.y0:16}));const heights=words.map(w=>Math.max(1,w.bbox.y1-w.bbox.y0)).sort((x,y)=>x-y),median=heights[Math.floor(heights.length/2)]||16,tolerance=Math.max(7,median*.72),sorted=words.slice().sort((x,y)=>(x.bbox.y0+x.bbox.y1)-(y.bbox.y0+y.bbox.y1));const rows=[];for(const w of sorted){const cy=(w.bbox.y0+w.bbox.y1)/2;let row=rows.find(r=>Math.abs(r.centerY-cy)<=Math.max(tolerance,Math.min(r.height,w.bbox.y1-w.bbox.y0)*.55));if(!row){row={words:[],centerY:cy,height:w.bbox.y1-w.bbox.y0};rows.push(row)}row.words.push(w);row.centerY=row.words.reduce((n,x)=>n+(x.bbox.y0+x.bbox.y1)/2,0)/row.words.length;row.height=Math.max(row.height,w.bbox.y1-w.bbox.y0)}return rows.map(r=>{r.words.sort((x,y)=>x.bbox.x0-y.bbox.x0);return {text:r.words.map(w=>w.text).join(" ").replace(/\s+/g," ").trim(),bbox:{x0:Math.min(...r.words.map(w=>w.bbox.x0)),y0:Math.min(...r.words.map(w=>w.bbox.y0)),x1:Math.max(...r.words.map(w=>w.bbox.x1)),y1:Math.max(...r.words.map(w=>w.bbox.y1))},centerY:r.centerY,height:r.height}}).sort((x,y)=>x.centerY-y.centerY)}
async function prepareBankImageForOcr(file){
 try{
  if(!window.createImageBitmap||!document.createElement("canvas").getContext)return file;
  const bitmap=await createImageBitmap(file),maxSide=2600,scale=Math.min(2, maxSide/Math.max(bitmap.width,bitmap.height),Math.max(1,1800/Math.min(bitmap.width,bitmap.height)));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx){bitmap.close?.();return file}
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.filter="grayscale(100%) contrast(112%)";ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  return canvas;
 }catch{return file}
}
function imageCandidatesFromOcrData(data,fileName){
 const rows=imageOcrRows(data),out=[],amountRx=/[-+]?\s*\d[\d\s.,]*[,.]\d{2}/;
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!amountRx.test(row.text))continue;
  const nearby=rows.filter((r,j)=>j!==i&&!amountRx.test(r.text)&&Math.abs(r.centerY-row.centerY)<=Math.max(58,row.height*2.8)&&!/^\s*(?:\d{1,2}[/. -]){1,2}\d{2,4}\s*$/.test(r.text)&&!/^(mardi|mercredi|jeudi|vendredi|samedi|dimanche|lundi)\b/i.test(pdfCleanText(r.text)));
  const combined=[...nearby.sort((x,y)=>x.centerY-y.centerY).map(x=>x.text),row.text].join(" ");
  const c=imageCandidateFromLine(combined,fileName,false);if(c)out.push(c);
 }
 // Independent text-line pass: bank transaction labels and amounts are often split.
 const lines=String(data?.text||"").split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
 for(let i=0;i<lines.length;i++){
  if(!amountRx.test(lines[i]))continue;
  const context=[];
  for(let j=Math.max(0,i-3);j<=Math.min(lines.length-1,i+2);j++){
   if(j===i||amountRx.test(lines[j])||/^\d{1,2}[/. -]\d{1,2}(?:[/. -]\d{2,4})?$/.test(lines[j]))continue;
   if(/^(solde|disponible|plafond|ancien solde|nouveau solde)\b/i.test(pdfCleanText(lines[j])))continue;
   context.push(lines[j]);
  }
  const c=imageCandidateFromLine([...context,lines[i]].join(" "),fileName,false);
  if(c)out.push(c);
 }
 const merged=[];
 for(const c of out){
  const prior=merged.find(x=>Math.abs(x.amount-c.amount)<0.005&&(/france travail|pole emploi|alloca/.test(pdfCleanText(x.description+" "+c.description))||pdfCleanText(x.description)===pdfCleanText(c.description)));
  if(!prior){merged.push(c);continue}
  const score=s=>s.description.length+(/france travail|pole emploi/.test(pdfCleanText(s.description))?100:0)+(/virement en votre faveur/.test(pdfCleanText(s.rawLine))?30:0);
  if(score(c)>score(prior))Object.assign(prior,c);
 }
 return merged;
}
function imageRenderCandidate(){const total=imageCandidates.length,idx=imageCandidateIndex;if(idx>=total){$("imageReview").classList.add("hidden");$("bankImages").value="";imageCandidates=[];imageCandidateIndex=0;imageStatus("Analyse terminée. Les photos ne sont pas conservées par BEP. Les informations confirmées ont été enregistrées dans ton budget.");notify("Onboarding financier terminé");return}const c=imageCandidates[idx];$("imageReview").classList.remove("hidden");$("imageReviewCounter").textContent="Information "+(idx+1)+" / "+total;$("imageReviewProgressLabel").textContent="À vérifier";$("imageReviewProgressBar").style.width=((idx/total)*100)+"%";$("imageCandidateTitle").textContent=c.type==="income"?"Revenu potentiel détecté":(c.type==="budget"?"Charge potentielle détectée":"Information à ignorer");$("imageCandidateSource").textContent="Capture : "+c.source+(c.rawLine?" · Texte lu : "+c.rawLine:"");$("imageCandidateDescription").value=c.description;$("imageCandidateAmount").value=c.amount.toFixed(2);$("imageCandidateType").value=c.type;$("imageCandidateCategory").value=c.category;$("imageCandidateCategoryWrap").classList.toggle("hidden",c.type==="income"||c.type==="ignore");$("imageCandidateHint").textContent=c.type==="income"?"Confirme uniquement s'il s'agit bien d'un revenu mensuel net.":(c.type==="budget"?"Confirme uniquement s’il s’agit d’une charge récurrente mensuelle.":"Cette opération ne correspond pas clairement à un revenu ou à une charge récurrente du budget. Tu peux l’ignorer.");$("confirmImageCandidate").textContent=idx===total-1?"Valider et terminer":"Confirmer et continuer"}
function imageSaveCandidate(){const c=imageCandidates[imageCandidateIndex],description=$("imageCandidateDescription").value.trim(),amount=Number($("imageCandidateAmount").value),type=$("imageCandidateType").value,category=$("imageCandidateCategory").value;if(type!=="ignore"&&(!description||!Number.isFinite(amount)||amount<=0))return notify("Vérifie le libellé et le montant.");if(type==="income"){state.incomes.push({id:crypto.randomUUID(),label:description,type:"Autre revenu",amount,source:"image_import"});syncIncomeTotal();save()}else if(type==="budget"){state.budgets.push({id:crypto.randomUUID(),category,label:description,amount,source:"image_import"});save()}imageCandidateIndex++;imageRenderCandidate()}
$("imageCandidateType").addEventListener("change",()=>{$("imageCandidateCategoryWrap").classList.toggle("hidden",["income","ignore"].includes($("imageCandidateType").value))});
$("confirmImageCandidate").addEventListener("click",imageSaveCandidate);
$("skipImageCandidate").addEventListener("click",()=>{imageCandidateIndex++;imageRenderCandidate()});
$("bankImages").addEventListener("change",()=>{const files=[...($("bankImages").files||[])];$("imageSelectionInfo").textContent=files.length+" / 10 photo(s) sélectionnée(s)";if(files.length>10){$("bankImages").value="";$("imageSelectionInfo").textContent="Maximum 10 photos. Sélectionne un nouveau lot.";imageStatus("Tu peux importer 10 photos maximum par analyse.",true)}else if(files.some(f=>!/^image\/(jpeg|png|webp)$/.test(f.type))){$("bankImages").value="";imageStatus("Format non pris en charge. Utilise JPG, PNG ou WebP.",true)}});
$("analyzeImages").addEventListener("click",async()=>{const files=[...($("bankImages").files||[])];if(!files.length)return imageStatus("Sélectionne au moins une photo.",true);if(files.length>10)return imageStatus("10 photos maximum par analyse.",true);if(files.some(f=>f.size>12*1024*1024))return imageStatus("Chaque photo doit peser moins de 12 Mo.",true);try{await loadTesseract()}catch(error){return imageStatus(error.message||"Le moteur OCR n'est pas disponible.",true)}$("analyzeImages").disabled=true;$("imageReview").classList.add("hidden");imageStatus("Lecture locale des photos… Aucune image n'est envoyée au serveur BEP.");const candidates=[];try{for(let i=0;i<files.length;i++){imageStatus("Analyse de la photo "+(i+1)+" sur "+files.length+"…");const ocrImage=await prepareBankImageForOcr(files[i]);const result=await window.Tesseract.recognize(ocrImage,"fra+eng",{logger:m=>{if(m.status==="recognizing text")imageStatus("Photo "+(i+1)+" / "+files.length+" — reconnaissance "+Math.round((m.progress||0)*100)+" %")}});const extracted=imageCandidatesFromOcrData(result.data,files[i].name);for(const c of extracted)candidates.push(c);if(!extracted.length){for(const line of String(result.data?.text||"").split(/\r?\n/)){const c=imageCandidateFromLine(line,files[i].name,false);if(c)candidates.push(c)}}}const seen=new Set();imageCandidates=candidates.filter(c=>{const k=pdfCleanText(c.description)+"|"+c.amount.toFixed(2);if(seen.has(k))return false;seen.add(k);return true});if(!imageCandidates.length)throw Error("Aucune information financière suffisamment lisible n'a été détectée. Essaie avec des captures plus nettes où les libellés et montants sont visibles.");imageCandidateIndex=0;$("bankImages").value="";$("imageSelectionInfo").textContent="Photos analysées. Les fichiers originaux ne sont plus sélectionnés.";imageStatus(imageCandidates.length+" information(s) détectée(s). Vérifie-les une par une.");imageRenderCandidate()}catch(e){$("bankImages").value="";imageStatus(e.message||"L'analyse des photos a échoué.",true)}finally{$("analyzeImages").disabled=false}});

$("logoutBtn").onclick=async()=>{const button=$("logoutBtn");button.disabled=true;button.textContent="Déconnexion…";try{const r=await fetch(API+"/api/auth/logout",{method:"POST",credentials:"include",cache:"no-store"});if(!r.ok)throw Error("La déconnexion n’a pas pu être confirmée.");window.bepSignedIn=false;window.dispatchEvent(new Event("bep:auth-ready"));localStorage.removeItem(DB);localStorage.removeItem(ACTIVE_TAB_KEY);localStorage.removeItem(ACTIVE_BUDGET_MODULE_KEY);state={...defaults};syncIncomeTotal();gate.hidden=false;authMode("login");$("loginPassword").value="";$("loginEmail").value="";authMessage.textContent="Tu es déconnecté.";button.textContent="Me déconnecter du compte";button.disabled=false;render()}catch(e){notify(e.message||"Erreur pendant la déconnexion.");button.textContent="Me déconnecter du compte";button.disabled=false;}};
let editingIncomeId=null;
$("incomeForm").onsubmit=e=>{e.preventDefault();const amount=Number($("incomeAmount").value),label=$("incomeLabel").value.trim(),type=$("incomeType").value;if(!label||!Number.isFinite(amount)||amount<=0)return notify("Renseigne un libellé et un montant valide.");const item={id:editingIncomeId||crypto.randomUUID(),label,type,amount,source:"manual"};if(editingIncomeId){state.incomes=state.incomes.map(x=>x.id===editingIncomeId?item:x);editingIncomeId=null;$("incomeForm").querySelector("button").textContent="+ Ajouter ce revenu";notify("Revenu modifié")}else{state.incomes.push(item);notify("Revenu ajouté")}syncIncomeTotal();$("incomeLabel").value="";$("incomeAmount").value="";$("incomeType").value="Salaire";if(save()!==false)window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"income"}}))};
function editIncome(id){const item=state.incomes.find(x=>x.id===id);if(!item)return;editingIncomeId=id;$("incomeLabel").value=item.label||"";$("incomeType").value=item.type||"Autre revenu";$("incomeAmount").value=item.amount;$("incomeForm").querySelector("button").textContent="Enregistrer les modifications";if(window.BEP_OPEN_ENTRY_DIALOG)window.BEP_OPEN_ENTRY_DIALOG("income");else $("incomeEditorDetails").open=true;}
async function deleteIncome(id){if(!(await (window.BEP_CONFIRM_ACTION?window.BEP_CONFIRM_ACTION("Supprimer définitivement ce revenu ?","Supprimer ce revenu"):Promise.resolve(confirm("Supprimer définitivement ce revenu ?")))))return;state.incomes=state.incomes.filter(x=>x.id!==id);if(editingIncomeId===id){editingIncomeId=null;$("incomeLabel").value="";$("incomeAmount").value="";$("incomeForm").querySelector("button").textContent="+ Ajouter ce revenu"}syncIncomeTotal();save();notify("Revenu supprimé")}
$("incomeCheckupForm").onsubmit=e=>{e.preventDefault();const rows=Array.from(document.querySelectorAll("#incomeCheckupForm [data-income-item]:checked"));if(!rows.length){$("incomeCheckupStatus").textContent="Sélectionne au moins un revenu supplémentaire qui te concerne.";return}const additions=[],duplicates=[];for(const check of rows){const row=check.closest(".budget-checkup-row"),field=row.querySelector("[data-income-amount]"),value=Number(field.value);if(!field.value.trim()||!Number.isFinite(value)||value<=0){$("incomeCheckupStatus").textContent="Indique un montant mensuel moyen supérieur à zéro pour chaque revenu sélectionné.";field.focus();return}const type=check.dataset.incomeType,label=check.dataset.incomeItem;const exists=state.incomes.some(x=>String(x.label||"").trim().toLowerCase()===label.toLowerCase());if(exists){duplicates.push(label);continue}additions.push({id:crypto.randomUUID(),label,type,amount:value,source:"income-checkup"})}if(additions.length){state.incomes.push(...additions);syncIncomeTotal();save()}$("incomeCheckupStatus").textContent=(additions.length?additions.length+" source(s) ajoutée(s). ":"Aucune nouvelle source ajoutée. ")+(duplicates.length?"Déjà enregistré(s), donc ignoré(s) : "+duplicates.join(", ")+".":"Vérifie que chaque montant correspond bien à un revenu net réellement perçu.");rows.forEach(check=>{check.checked=false;check.closest(".budget-checkup-row").querySelector("[data-income-amount]").value=""});$("incomeCheckupDetails").open=false;if(additions.length){notify(additions.length+" source(s) de revenu ajoutée(s)");window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"income-checkup"}}))}};
let editingBudgetId=null;
$("budgetCheckupForm").onsubmit=e=>{e.preventDefault();const rows=Array.from(document.querySelectorAll("#budgetCheckupForm [data-checkup-item]:checked"));if(!rows.length){$("budgetCheckupStatus").textContent="Sélectionne au moins une dépense qui te concerne.";return}const additions=[];for(const check of rows){const row=check.closest(".budget-checkup-row"),field=row.querySelector("[data-checkup-amount]"),value=Number(field.value);if(!field.value.trim()||!Number.isFinite(value)||value<=0){$("budgetCheckupStatus").textContent="Indique un montant supérieur à zéro pour chaque dépense sélectionnée.";field.focus();return}const annual=check.dataset.checkupAnnual==="true";additions.push({id:crypto.randomUUID(),category:check.dataset.checkupCategory,label:(annual?"Provision annuelle — ":"")+check.dataset.checkupItem,amount:annual?value/12:value,nature:"variable"})}state.budgets.push(...additions);save();$("budgetCheckupStatus").textContent=additions.length+" dépense(s) ajoutée(s). Les provisions annuelles sont réparties sur 12 mois.";rows.forEach(check=>{check.checked=false;check.closest(".budget-checkup-row").querySelector("[data-checkup-amount]").value=""});notify(additions.length+" dépense(s) ajoutée(s) au budget");window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"charge-checkup"}}))};

$("budgetForm").onsubmit=e=>{e.preventDefault();let category=$("budgetCategory").value,amount=+$("budgetAmount").value,label=$("budgetLabel").value.trim();if(amount<0||!Number.isFinite(amount))return notify("Montant invalide");const nature=$("budgetNature").value||"unspecified";const item={id:editingBudgetId||crypto.randomUUID(),category,label,amount,nature};if(editingBudgetId){state.budgets=state.budgets.map(x=>x.id===editingBudgetId?item:x);editingBudgetId=null;$("budgetForm").querySelector("button").textContent="Ajouter une ligne budgétaire";notify("Ligne budgétaire modifiée")}else{state.budgets.push(item);notify("Ligne budgétaire ajoutée")}if(save()!==false){$("budgetLabel").value="";$("budgetAmount").value="";window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"charge"}}))}};
function editBudget(id){const item=state.budgets.find(x=>x.id===id);if(!item)return;editingBudgetId=id;$("budgetCategory").value=item.category;$("budgetLabel").value=item.label||"";$("budgetAmount").value=item.amount;$("budgetNature").value=item.nature||"unspecified";$("budgetForm").querySelector("button").textContent="Enregistrer les modifications";if(window.BEP_OPEN_ENTRY_DIALOG)window.BEP_OPEN_ENTRY_DIALOG("charge");else $("budgetEditorDetails").open=true;}
async function deleteBudget(id){if(!(await (window.BEP_CONFIRM_ACTION?window.BEP_CONFIRM_ACTION("Supprimer définitivement cette ligne budgétaire ?","Supprimer cette charge"):Promise.resolve(confirm("Supprimer définitivement cette ligne budgétaire ?")))))return;state.budgets=state.budgets.filter(x=>x.id!==id);if(editingBudgetId===id){editingBudgetId=null;$("budgetLabel").value="";$("budgetAmount").value="";$("budgetForm").querySelector("button").textContent="Ajouter une ligne budgétaire"}save();notify("Ligne budgétaire supprimée")};
$("savingsRate").onchange=()=>{const custom=$("customSavingsRate");if(custom)custom.value="";preview()};$("duration").onchange=preview;
document.querySelectorAll("[data-rate-choice]").forEach(button=>button.onclick=()=>{$("savingsRate").value=button.dataset.rateChoice;const custom=$("customSavingsRate");if(custom)custom.value="";preview()});
$("customSavingsRate").oninput=()=>{const raw=$("customSavingsRate").value,value=Number(raw);if(raw===""||!Number.isFinite(value)||value<1||value>100){$("savingsRate").value="suggested";preview();return}let option=$("savingsRate").querySelector('option[value="'+value+'"]');if(!option){option=document.createElement("option");option.value=String(value);option.textContent=value+" % · personnalisé";$("savingsRate").appendChild(option)}$("savingsRate").value=String(value);preview()};
const savingsToday=(()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})();$("savingsOperationDate").value=savingsToday;$("savingsOperationDate").max=savingsToday;function refreshSavingsGoalOptions(){const select=$("savingsOperationGoal");if(!select)return;const type=$("savingsOperationType").value,prior=select.value,goals=(state.goals||[]).filter(g=>type==="withdrawal"||!g.archivedAt);select.innerHTML='<option value="">Choisis un coffre</option>'+goals.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name||"Mon objectif")+(g.archivedAt?" · archivé":"")+'</option>').join("");if(goals.some(g=>g.id===prior))select.value=prior} $("savingsOperationType").onchange=refreshSavingsGoalOptions;refreshSavingsGoalOptions();
$("savingsOperationForm").onsubmit=e=>{e.preventDefault();const type=$("savingsOperationType").value,goalId=$("savingsOperationGoal").value,amount=Math.round(Number($("savingsOperationAmount").value)*100)/100,date=$("savingsOperationDate").value;if(!goalId||!state.goals.some(g=>g.id===goalId&&(type==="withdrawal"||!g.archivedAt)))return notify(type==="withdrawal"?"Choisis un coffre avec un historique.":"Les versements sont réservés aux coffres actifs.");if(!Number.isFinite(amount)||amount<=0||amount>10000000)return notify("Saisis un montant valide (maximum 10 000 000 €).");const parsed=new Date(date+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date>savingsToday)return notify("La date doit être valide et ne peut pas être future.");if(type==="withdrawal"&&amount>savingsBalance(goalId)+0.000001)return notify("Le retrait dépasse le solde enregistré de ce coffre.");if(savingsOperations().some(o=>o.goalId===goalId&&o.type===type&&Number(o.amount)===amount&&o.date===date)&&!confirm("Un mouvement identique est déjà enregistré à cette date. Veux-tu vraiment l'ajouter ?"))return;state.savingsOperations.push({id:crypto.randomUUID(),type,goalId,amount,date,createdAt:new Date().toISOString()});$("savingsOperationAmount").value="";if(save()!==false){notify(type==="deposit"?"Versement enregistré.":"Retrait enregistré.");window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"savings-movement"}}))}};
const projectionMonthly=$("savingsProjectionMonthly"),projectionYears=$("savingsProjectionYears");if(projectionMonthly)projectionMonthly.oninput=updateSavingsProjection;if(projectionYears)projectionYears.onchange=updateSavingsProjection;
let editingGoalId=null;
$("savingsForm").onsubmit=e=>{e.preventDefault();let r=$("savingsRate").value==="suggested"?rate(editingGoalId):+$("savingsRate").value,m=totalIncome()*r/100,otherGoals=state.goals.filter(x=>!x.archivedAt&&x.id!==editingGoalId).reduce((n,g)=>n+Number(g.monthly||0),0);if(r<=0||totalIncome()<=0||m<=0||m>availableBeforeSavings()-otherGoals)return notify("Épargne non soutenable avec le budget actuel. Vérifie tes revenus, tes charges et tes engagements.");const item={id:editingGoalId||crypto.randomUUID(),name:$("goalName").value.trim()||"Mon épargne",rate:r,monthly:m,duration:+$("duration").value};if(editingGoalId){state.goals=state.goals.map(x=>x.id===editingGoalId?item:x);editingGoalId=null;notify("Objectif modifié")}else{state.goals.push(item);notify("Objectif enregistré")}save();$("goalName").value="";$("savingsRate").value="suggested";$("customSavingsRate").value="";$("duration").value="3";$("savingsForm").querySelector("button").textContent="Créer mon objectif";preview();window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"savings-goal"}}))};
let activeSavingsModule="goals";
function setSavingsModule(name){
 if(name!=="goals"&&name!=="movements")return;
 activeSavingsModule=name;
 const root=document.getElementById("savings");
 if(!root)return;
 root.querySelectorAll(".savings-module-tab[data-savings-module]").forEach(button=>{
  const active=button.dataset.savingsModule===name;
  button.classList.toggle("active",active);
  button.setAttribute("aria-selected",active?"true":"false");
  button.tabIndex=active?0:-1;
 });
 root.querySelectorAll(".savings-module[role='tabpanel']").forEach(panel=>{
  panel.hidden=panel.id!==(name==="goals"?"savingsModuleGoals":"savingsModuleMovements");
 });
}
const savingsRoot=document.getElementById("savings");
if(savingsRoot){
 savingsRoot.querySelectorAll(".savings-module-tab[data-savings-module]").forEach(button=>{
  button.addEventListener("click",()=>setSavingsModule(button.dataset.savingsModule));
  button.addEventListener("keydown",event=>{
   if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
   event.preventDefault();
   const next=event.key==="Home"?"goals":event.key==="End"?"movements":event.key==="ArrowRight"?(button.dataset.savingsModule==="goals"?"movements":"goals"):(button.dataset.savingsModule==="goals"?"movements":"goals");
   setSavingsModule(next);
   root.querySelector('[data-savings-module="'+next+'"]')?.focus();
  });
 });
 setSavingsModule("goals");
}
function editGoal(id){const g=state.goals.find(x=>x.id===id&&!x.archivedAt);if(!g)return;editingGoalId=id;$("goalName").value=g.name||"";const goalRate=Number(g.rate)||0;if(![5,10,15,20].includes(goalRate)){let opt=$("savingsRate").querySelector('option[value="'+goalRate+'"]');if(!opt){opt=document.createElement("option");opt.value=String(goalRate);opt.textContent=goalRate+" % · personnalisé";$("savingsRate").appendChild(opt)}$("customSavingsRate").value=String(goalRate)}else $("customSavingsRate").value="";$("savingsRate").value=String(goalRate||"suggested");$("duration").value=String(g.duration||3);$("savingsForm").querySelector("button").textContent="Enregistrer les modifications";preview();if(window.BEP_OPEN_ENTRY_DIALOG)window.BEP_OPEN_ENTRY_DIALOG("savings-goal");else $("savingsForm").scrollIntoView({behavior:"smooth",block:"center"})}
async function deleteGoal(id){const goal=state.goals.find(x=>x.id===id);if(!goal||goal.archivedAt)return;if(!(await (window.BEP_CONFIRM_ACTION?window.BEP_CONFIRM_ACTION("Son historique et son solde seront conservés, mais il ne sera plus proposé pour de nouveaux versements.","Archiver cet objectif"):Promise.resolve(confirm("Archiver cet objectif ? Son historique et son solde resteront conservés, mais il ne sera plus proposé pour de nouveaux versements.")))))return;state.goals=state.goals.map(x=>x.id===id?{...x,archivedAt:new Date().toISOString()}:x);if(editingGoalId===id){editingGoalId=null;$("goalName").value="";$("savingsForm").querySelector("button").textContent="Créer mon objectif"}save();notify("Objectif archivé")};
function preview(){const suggested=rate(editingGoalId),selected=$("savingsRate").value,r=selected==="suggested"?suggested:Number(selected)||0,m=totalIncome()*r/100,d=Number($("duration").value)||3,other=(state.goals||[]).filter(g=>!g.archivedAt&&g.id!==editingGoalId).reduce((n,g)=>n+Number(g.monthly||0),0),left=availableBeforeSavings()-other-m;const suggestion=$("suggestion");if(suggestion)suggestion.textContent="Suggestion BEP : "+suggested+" % selon tes revenus, tes charges et tes engagements existants.";const reco=$("savingsSuggestedRate");if(reco)reco.textContent=suggested+" %";const recoAmount=$("savingsSuggestedAmount");if(recoAmount)recoAmount.textContent=suggested?money(totalIncome()*suggested/100)+" par mois, après prise en compte de tes engagements.":"Aucun taux standard soutenable détecté pour le moment.";const tag=$("savingsRecoTag");if(tag)tag.textContent=suggested?"Personnalisée":"Prudence";document.querySelectorAll("[data-rate-choice]").forEach(b=>{const active=b.dataset.rateChoice===selected;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});if($("savingsPreview"))$("savingsPreview").innerHTML="<b>"+money(m)+" par mois</b><br>"+money(m*d)+" de versements prévus sur "+d+" mois.<br>Reste disponible après cet engagement : <b>"+money(left)+"</b>"+(left<0?'<br><span class="negative">Cet engagement dépasse ta capacité disponible.</span>':"");}
function advice(p){if(p.delay==="already_done")return["Achat déjà effectué.","Cette dépense est enregistrée dans ton suivi. Vérifie simplement son montant et sa catégorie.","La dépense est-elle correctement classée ?"];if(p.psychology==="pressure"||p.psychology==="impulsive")return["Attention à la pression émotionnelle.","Une envie urgente n'est pas une obligation. Fais une pause avant de décider.","Si cette offre disparaissait demain, en aurais-tu toujours besoin ?"];if(p.need==="no")return["Distingue envie et besoin.","Vérifie que cet achat ne fragilise pas une priorité.","Quel poste budgétaire acceptera cette dépense ?"];if(p.need==="uncertain")return["Laisse la décision décanter.","Attendre 24 heures aide à vérifier l'utilité réelle.","Peux-tu décrire l'usage concret ?"];return["Décision réfléchie.","Vérifie que le montant entre dans l'enveloppe prévue.","Cet achat respecte-t-il ton plan du mois ?"]}
let activePurchaseMode="manual",captureSource="manual",voiceRecognition=null,receiptCaptureText="",voiceCaptureText="";
function setPurchaseMode(mode){activePurchaseMode=mode;captureSource=mode;const form=$("purchaseForm");if(form)form.classList.remove("hidden");}
function setupInlineVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return;const targets=[$("goalName")].filter(Boolean);targets.forEach(field=>{if(field.dataset.voiceReady)return;field.dataset.voiceReady="1";const wrap=document.createElement("div");wrap.className="voice-field-wrap";field.parentNode.insertBefore(wrap,field);wrap.appendChild(field);const button=document.createElement("button");button.type="button";button.className="field-mic";button.setAttribute("aria-label","Dicter dans ce champ");button.title="Dicter dans ce champ";button.textContent="";const indicator=document.createElement("span");indicator.className="recording-indicator hidden";indicator.innerHTML='<i></i><b>Enregistrement en cours</b>';wrap.append(button,indicator);let recognition=null,finalText="";button.addEventListener("click",()=>{if(recognition){recognition.stop();return}recognition=new SR();recognition.lang="fr-FR";recognition.continuous=true;recognition.interimResults=true;finalText=field.value.trim();button.classList.add("recording");button.textContent="STOP";button.setAttribute("aria-label","Arrêter la dictée");button.title="Arrêter la dictée";indicator.classList.remove("hidden");let interim="";recognition.onresult=e=>{interim="";for(let i=e.resultIndex;i<e.results.length;i++){const result=e.results[i],part=(result[0]?.transcript||"").trim();if(!part)continue;if(result.isFinal){if(part&&!finalText.toLowerCase().endsWith(part.toLowerCase()))finalText=(finalText+" "+part).trim()}else interim=part}const spokenValue=(finalText+" "+interim).trim().replace(/\s+/g," ");if(field.id==="purchaseAmount"){const numeric=spokenValue.match(/\d+(?:[,.]\d{1,2})?/);if(numeric)field.value=numeric[0].replace(",",".");else{const words=spokenValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/euros?|eur|balles/g," ").replace(/-/g," ").trim().split(/\s+/);const units={zero:0,un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,vingt:20,trente:30,quarante:40,cinquante:50,soixante:60,cent:100,cents:100};let part=0;words.forEach(w=>{if(units[w]===100)part=Math.max(1,part)*100;else if(units[w]!==undefined)part+=units[w]});if(part)field.value=String(part)}}else field.value=spokenValue;field.dispatchEvent(new Event("input",{bubbles:true}))};recognition.onerror=e=>{indicator.querySelector("b").textContent=e.error==="not-allowed"?"Autorisation microphone refusée":"Problème de reconnaissance"};recognition.onend=()=>{recognition=null;button.classList.remove("recording");button.textContent="";button.setAttribute("aria-label","Dicter dans ce champ");button.title="Dicter dans ce champ";indicator.classList.add("hidden")};try{recognition.start()}catch(e){recognition=null;button.classList.remove("recording");button.textContent="";indicator.classList.add("hidden")}})})}
function setupPlaceSuggestions(){
const description=$("merchant"),city=$("city"),category=$("purchaseCategory");
if(!description)return;
description.setAttribute("autocomplete","off");
description.setAttribute("spellcheck","true");
description.placeholder="Ex. courses alimentaires, chaussures, essence…";
if(city){city.setAttribute("autocomplete","address-level2");city.placeholder="Facultatif";}
if(!category)return;
const normalize=value=>String(value||"").toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const rules=[
["Chaussures de sport",/\b(chaussures? de sport|baskets?|sneakers?|running|crampons)\b/],
["Alimentation",/\b(courses?|alimentation|alimentaire|fruits?|legumes?|primeur|boulangerie|boucherie|poissonnerie|epicerie|supermarche)\b/],
["Restaurant et sorties",/\b(restaurant|resto|dejeuner|diner|cafe|bar|livraison|uber eats|deliveroo|brunch)\b/],
["Transport et carburant",/\b(essence|carburant|gazole|diesel|peage|parking|navigo|metro|train|bus|taxi|uber|transport)\b/],
["Vêtements et chaussures",/\b(vetement|chaussure|pantalon|robe|manteau|chemise|tee shirt|t shirt|jean|pull)\b/],
["Électronique et informatique",/\b(telephone|smartphone|ordinateur|pc|tablette|ecran|informatique|electronique|console|casque audio)\b/],
["Électroménager",/\b(refrigerateur|frigo|lave linge|lave vaisselle|four|aspirateur|micro ondes|electromenager)\b/],
["Maison et décoration",/\b(meuble|canape|lit|matelas|decoration|linge de maison|vaisselle|luminaire)\b/],
["Bricolage et jardin",/\b(bricolage|peinture|outillage|outil|jardin|plante|tondeuse|quincaillerie)\b/],
["Santé et pharmacie",/\b(pharmacie|medicament|ordonnance|consultation|medecin|dentiste|optique|soin medical)\b/],
["Beauté et hygiène",/\b(cosmetique|maquillage|parfum|shampooing|coiffure|hygiene|creme|savon)\b/],
["Loisirs et culture",/\b(cinema|concert|spectacle|musee|livre|jeu video|loisir|culture|sport|fitness|abonnement streaming)\b/],
["Fournitures et papeterie",/\b(cahier|stylo|papier|cartouche|fourniture|papeterie|impression)\b/],
["Animaux",/\b(croquettes?|veterinaire|animal|litiere)\b/]
];
let autoWriting=false;
const suggest=()=>{
 const text=normalize(description.value);
 if(!text){if(category.dataset.autoSuggested==="1"){category.value="";delete category.dataset.autoSuggested;category.dispatchEvent(new Event("input",{bubbles:true}))}return}
 const match=rules.find(([,pattern])=>pattern.test(text));
 if(!match){if(category.dataset.autoSuggested==="1"){category.value="";delete category.dataset.autoSuggested;category.dispatchEvent(new Event("input",{bubbles:true}))}return}
 if(category.value.trim()&&category.dataset.autoSuggested!=="1")return;
 category.value=match[0];category.dataset.autoSuggested="1";autoWriting=true;
 category.dispatchEvent(new Event("input",{bubbles:true}));autoWriting=false;
};
category.addEventListener("input",()=>{if(!autoWriting)category.dataset.autoSuggested="0"});
category.addEventListener("change",()=>{category.dataset.autoSuggested="0"});
description.addEventListener("input",suggest);
description.addEventListener("change",suggest);
suggest();
}
function setupPurchaseNatureSuggestions(){
const input=$("purchaseCategory"),panel=$("purchaseNaturePanel");if(!input||!panel)return;
const options=["Alimentation","Vêtements et chaussures","Chaussures de sport","Équipement sportif","Électronique et informatique","Électroménager","Maison et décoration","Bricolage et jardin","Transport et carburant","Beauté et hygiène","Santé et pharmacie","Loisirs et culture","Restaurant et sorties","Fournitures et papeterie","Animaux","Autre"];
const show=()=>{const q=input.value.trim().toLocaleLowerCase("fr");const matches=options.filter(x=>!q||x.toLocaleLowerCase("fr").includes(q));panel.innerHTML="";matches.forEach(value=>{const b=document.createElement("button");b.type="button";b.className="nature-suggestion";b.setAttribute("role","option");b.textContent=value;b.addEventListener("click",()=>{input.value=value;panel.classList.add("hidden");input.dispatchEvent(new Event("change",{bubbles:true}))});panel.appendChild(b)});panel.classList.toggle("hidden",!matches.length)};
input.addEventListener("focus",show);input.addEventListener("input",show);input.addEventListener("blur",()=>setTimeout(()=>panel.classList.add("hidden"),160));document.addEventListener("click",e=>{if(!panel.contains(e.target)&&e.target!==input)panel.classList.add("hidden")});
}
function fillPurchase(data){if(data.label&&$("merchant")){$("merchant").value=data.label.slice(0,70);$("merchant").dispatchEvent(new Event("input",{bubbles:true}))}if(data.notes&&$("purchaseNotes"))$("purchaseNotes").value=data.notes.slice(0,180);if(data.notes&&$("purchaseCategory")){const n=data.notes.toLowerCase();if(/chauss|basket|sneaker|vêtement|textile|tenue/.test(n))$("purchaseCategory").value="Mode";else if(/ballon|raquette|fitness|équipement sportif/.test(n))$("purchaseCategory").value="Loisirs"}if(data.city&&$("city"))$("city").value=data.city.slice(0,60);if(data.amount>0&&$("purchaseAmount"))$("purchaseAmount").value=Number(data.amount).toFixed(2);if(data.category&&$("purchaseCategory"))$("purchaseCategory").value=data.category;if(data.need&&$("need"))$("need").value=data.need;if(data.psychology&&$("psychology"))$("psychology").value=data.psychology;if(data.moodAfter&&$("moodAfter"))$("moodAfter").value=data.moodAfter;notify("Champs détectés : vérifie et complète avant l’enregistrement.")}
function parsePurchaseText(text){
const raw=String(text||"").replace(/\\s+/g," ").trim();
const amountMatches=[...raw.matchAll(/(?:total(?:\\s+(?:ttc|à payer))?|net\\s+à\\s+payer|montant\\s+payé|payé|pour|prix)?\\s*[:=]?\\s*(\\d{1,5}(?:[ .]\\d{3})*(?:[,.]\\d{1,2})?)\\s*(?:€|euros?|eur)?/gi)];
let amount=0;if(amountMatches.length){const m=amountMatches[amountMatches.length-1];amount=Number(m[1].replace(/[ .](?=\\d{3}(?:[,.]|$))/g,"").replace(",", "."))||0}
const brands=[["Carrefour",/\\bcarrefour(?:\\s+(?:market|city|contact|express))?\\b/i],["Auchan",/\\bauchan\\b/i],["E.Leclerc",/\\b(?:e\\.?\\s*leclerc|leclerc)\\b/i],["Lidl",/\\blidl\\b/i],["Aldi",/\\baldi\\b/i],["Monoprix",/\\bmonoprix\\b/i],["Franprix",/\\bfranprix\\b/i],["Intermarché",/\\bintermarch[eé]\\b/i],["Super U",/\\bsuper\\s*u\\b/i],["Casino",/\\bcasino\\b/i],["Picard",/\\bpicard\\b/i],["Fnac",/\\bfnac\\b/i],["Darty",/\\bdarty\\b/i],["IKEA",/\\bikea\\b/i],["Leroy Merlin",/\\bleroy\\s*merlin\\b/i],["Decathlon",/\\bdecathlon\\b/i],["Zara",/\\bzara\\b/i],["Uniqlo",/\\buniqlo\\b/i],["H&M",/\\bh\\s*&\\s*m\\b/i]];
const found=brands.find(x=>x[1].test(raw));const label=found?found[0]:"";
let cleaned=raw.replace(/\\bje vais acheter\\b/gi," ").replace(/\\bj[’']ach[eè]te\\b/gi," ").replace(/\\b(?:acheter|ach[eè]ter|chez|au magasin|magasin|pour|au prix de|prix de|co[uû]te|co[uû]t[eé])\\b/gi," ");
if(found)cleaned=cleaned.replace(found[1]," ");
cleaned=cleaned.replace(/\\b\\d{1,5}(?:[,.]\\d{1,2})?\\s*(?:€|euros?|eur)?\\b/gi," ").replace(/\\b(?:euros?|eur)\\b/gi," ").replace(/[,.!?;:]+/g," ").replace(/\\s+/g," ").trim();
const notes=cleaned.replace(/^(?:des?|les?|de|du|d)\\s+/i,"").replace(/\\s+(?:à|dans|sur)\\s+(?:bois colombes|paris|antony)\\b.*$/i,"").trim().slice(0,180);
let city="";const cm=raw.match(/\\b(?:à|dans la ville de)\\s+([A-ZÀ-Ÿ][\\wÀ-ÿ'’-]*(?:[- ][A-ZÀ-Ÿ][\\wÀ-ÿ'’-]*){0,3})(?=\\s+(?:pour|total|coût|coûte)|\\s+\\d|$)/i);if(cm&&(!label||cm[1].toLowerCase()!==label.toLowerCase()))city=cm[1].replace(/[,.!?]+$/,"").trim().slice(0,60);
let category="";if(/chauss|basket|vêtement|mode|textile|baskets?|sneakers?|tenue|sportwear/i.test(raw))category="Mode";else if(/decathlon|sport|ballon|raquette|fitness/i.test(raw))category="Loisirs";else if(/courses?|supermarch[eé]|aliment|primeur|fruits?|légumes?|boulangerie|boucherie|poissonnerie|épicerie|carrefour|auchan|leclerc|lidl|aldi|monoprix|franprix/i.test(raw))category="Alimentation";else if(/informatique|téléphone|ordinateur|électronique|fnac|darty/i.test(raw))category="Technologie";else if(/maison|meuble|ikea|bricolage|leroy merlin/i.test(raw))category="Maison";else if(/transport|essence|carburant|parking|train|métro/i.test(raw))category="Transport";else if(/beauté|coiffure|parfum|cosmétique|esthétique/i.test(raw))category="Beauté";
return{label,notes,city,amount,category,need:/pas nécessaire|envie|pas un besoin/i.test(raw)?"no":/besoin|nécessaire/i.test(raw)?"yes":"" ,psychology:/impulsif|sur un coup de tête/i.test(raw)?"impulsive":/pression|stress|fomo/i.test(raw)?"pressure":/envie spontanée/i.test(raw)?"spontaneous":""}
}
async function prepareReceiptImageForOcr(file){
 if(!window.createImageBitmap||!document.createElement("canvas").getContext)return file;
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);
  const maxSide=1800,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)return file;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.filter="grayscale(100%) contrast(115%)";ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));
  canvas.width=1;canvas.height=1;return blob||file;
 }catch{return file}
 finally{bitmap?.close?.()}
}
$("receiptImportButton")?.addEventListener("click",()=> $("receiptFile")?.click());
async function processReceiptFile(file,input){
 if(!file)return;
 const status=$("receiptStatus");status.hidden=false;status.textContent="Préparation de la photo…";
 let worker;
 try{
  if(!/^image\/[a-z0-9.+-]+$/i.test(file.type))throw Error("Format non pris en charge. Importe une image lisible par ton navigateur.");
  if(file.size>12*1024*1024)throw Error("Cette photo dépasse la limite actuelle de 12 Mo. Réduis-la ou compresse-la, ou prends une capture d’écran. Tu peux aussi saisir directement le montant dans le champ « Montant (€) ».");
  if(!window.BEPReceiptOCR)throw Error("Le moteur d'extraction BEP n'est pas disponible. Saisis les informations manuellement.");
  await loadTesseract();
  const ocrImage=await prepareReceiptImageForOcr(file);
  status.textContent="Lecture du justificatif sur cet appareil…";
  worker=await window.Tesseract.createWorker("fra+eng",1,{logger:m=>{if(m.status==="recognizing text")status.textContent="Lecture du justificatif : "+Math.round((m.progress||0)*100)+" %"}});
  const result=await worker.recognize(ocrImage);
  const rawText=String(result.data?.text||"").trim();
  if(!rawText)throw Error("Aucun texte lisible. Tu peux saisir les informations manuellement.");
  const extracted=window.BEPReceiptOCR.extract(rawText);
  if(extracted.merchant&&!$("merchant").value.trim())$("merchant").value=extracted.merchant.slice(0,70);
  if(extracted.city&&$("city")&&!$("city").value.trim())$("city").value=extracted.city.slice(0,60);
  if(Number.isFinite(extracted.amount)&&extracted.amount>0)$("purchaseAmount").value=extracted.amount.toFixed(2);
  if(extracted.date&&$("purchaseDate"))$("purchaseDate").value=extracted.date;
  if(extracted.category&&(!$("purchaseCategory").value.trim()||$("purchaseCategory").value==="Autres dépenses"))$("purchaseCategory").value=extracted.category;
  $("purchaseCategory").dispatchEvent(new Event("input",{bubbles:true}));
  $("purchaseAmount").dispatchEvent(new Event("input",{bubbles:true}));
  const confidenceLabel=v=>v>=.85?"élevée":v>=.65?"moyenne":"faible";
  const fields=[["commerçant",extracted.confidence.merchant],["montant",extracted.confidence.amount],["date",extracted.confidence.date],["heure",extracted.confidence.time||0],["catégorie",extracted.confidence.category],["support",extracted.confidence.documentType||0]].map(([name,value])=>name+" : "+confidenceLabel(value)).join(" · ");
  receiptCaptureText="Preuve d’achat importée · "+(extracted.merchant||"Enseigne non identifiée")+" · "+(Number.isFinite(extracted.amount)?extracted.amount.toFixed(2)+" €":"montant à vérifier");
  const dateLabel=extracted.date?"Date proposée : "+new Date(extracted.date+"T12:00:00").toLocaleDateString("fr-FR")+(extracted.time?" à "+extracted.time:"")+". ":"Date non identifiée. ";const documentLabels={ticket_caisse:"ticket de caisse",commande_web:"commande web",facture:"facture",releve_bancaire:"relevé bancaire",affichage_ou_borne:"écran ou borne",ecran_ou_document:"écran ou document",inconnu:"support non identifié"};const documentLabel="Support détecté : "+(documentLabels[extracted.documentType]||"support non identifié")+". ";
  status.textContent=documentLabel+(Number.isFinite(extracted.amount)&&extracted.amount>0?"Montant proposé : "+extracted.amount.toFixed(2).replace(".",",")+" €. ":"Montant non identifié avec certitude. ")+(extracted.merchant?"Enseigne : "+extracted.merchant+". ":"")+(extracted.city?"Ville : "+extracted.city+". ":"")+dateLabel+"Confiance — "+fields+". Vérifie et corrige chaque champ avant d’enregistrer. La photo n’est pas conservée par BEP."+(extracted.ambiguous?" Plusieurs montants ont été détectés : contrôle le total.":"");
 }catch(err){const reason=String(err?.message||"Lecture impossible.");const photoHelp="\n\nLa photo est peut-être trop lourde ou difficile à décoder. Essaie de la réduire ou de la compresser, ou prends une capture d’écran du justificatif. Tu peux aussi saisir directement le montant dans le champ « Montant (€) ».";status.textContent=reason+photoHelp}
 finally{if(worker)await worker.terminate().catch(()=>{});if(input)input.value="";if(window.BEP_OPEN_PURCHASE_DIALOG)window.BEP_OPEN_PURCHASE_DIALOG();}
}
if($("receiptFile"))$("receiptFile").onchange=e=>processReceiptFile(e.target.files?.[0],e.target);

let purchaseSelectionMode=false,purchaseSelection=new Set(),suppressPurchaseClick=false;
let incomeSelectionMode=false,incomeSelection=new Set(),budgetSelectionMode=false,budgetSelection=new Set();
function attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label){
 const container=$(containerId);if(!container)return;
 const rows=Array.from(container.querySelectorAll("[data-multi-row]"));
 const active=kind==="income"?incomeSelectionMode:budgetSelectionMode;
 let toolbar=document.getElementById(containerId+"BulkToolbar");
 if(!toolbar){toolbar=document.createElement("div");toolbar.id=containerId+"BulkToolbar";toolbar.className="multi-select-toolbar hidden";container.before(toolbar)}
 toolbar.classList.toggle("hidden",!active);
 toolbar.innerHTML=active?'<span>'+selection.size+' '+label+' sélectionné(s)</span><button type="button" data-multi-all>Tout sélectionner</button><button type="button" data-multi-delete>Supprimer la sélection</button><button type="button" data-multi-cancel>Annuler</button>':"";
 rows.forEach(row=>{
  const id=row.dataset.multiRow;
  row.classList.toggle("is-selected",active&&selection.has(id));
  let check=row.querySelector("[data-multi-check]");
  if(active){row.classList.add("has-multi-check");
   if(!check){check=document.createElement("input");check.type="checkbox";check.dataset.multiCheck="";check.className="multi-select-check purchase-select-check";check.setAttribute("aria-label","Sélectionner");const main=row.querySelector(".budget-saved-row__main, .purchase-row-main");(main||row).insertBefore(check,(main||row).firstChild)}
   check.checked=selection.has(id);
   check.onchange=()=>{if(check.checked)selection.add(id);else selection.delete(id);attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label)};
  }else{check?.remove();row.classList.remove("has-multi-check")}
  if(row.dataset.multiBound==="1")return;
  row.dataset.multiBound="1";
  let timer=null,startedAt=0;
  const clear=()=>{if(timer){clearTimeout(timer);timer=null}};
  const start=e=>{
   if(e.target.closest("button,input")||e.button===2)return;
   clear();startedAt=Date.now();
   timer=setTimeout(()=>{
    timer=null;modeSetter(true);selection.add(id);
    attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label);
   },600);
  };
  row.addEventListener("pointerdown",start,{passive:true});
  row.addEventListener("pointerup",clear,{passive:true});
  row.addEventListener("pointercancel",clear,{passive:true});
  row.addEventListener("pointerleave",clear,{passive:true});
  row.addEventListener("contextmenu",e=>e.preventDefault());
  row.addEventListener("click",e=>{
   if(!(kind==="income"?incomeSelectionMode:budgetSelectionMode)||e.target.closest("button,input"))return;
   e.preventDefault();e.stopPropagation();
   if(selection.has(id))selection.delete(id);else selection.add(id);
   attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label);
  });
  row.querySelectorAll("button").forEach(button=>{
   const original=button.onclick;
   button.onclick=e=>{
    if(kind==="income"?incomeSelectionMode:budgetSelectionMode){e.preventDefault();e.stopPropagation();return}
    original?.call(button,e);
   };
  });
 });
 toolbar.querySelector("[data-multi-all]")?.addEventListener("click",()=>{
  if(selection.size===rows.length)selection.clear();else rows.forEach(row=>selection.add(row.dataset.multiRow));
  attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label);
 });
 toolbar.querySelector("[data-multi-cancel]")?.addEventListener("click",()=>{
  selection.clear();modeSetter(false);attachLongPressSelection(containerId,kind,selection,modeSetter,removeSelected,label);
 });
 toolbar.querySelector("[data-multi-delete]")?.addEventListener("click",async()=>{
  if(!selection.size)return;
  const accepted=window.BEP_CONFIRM_ACTION?await window.BEP_CONFIRM_ACTION("Supprimer les "+selection.size+" "+label+" sélectionné(s) ?","Suppression multiple"):confirm("Supprimer les "+selection.size+" "+label+" sélectionné(s) ?");
  if(!accepted)return;
  removeSelected(new Set(selection));selection.clear();modeSetter(false);render();
 });
}
let editingPurchaseId=null;
function setPurchaseFormTitle(isEditing){
 const entry=document.querySelector(".purchase-entry-card");
 const heading=entry?.querySelector("h2");
 const intro=entry?.querySelector(".bep-spend-form-intro");
 if(heading)heading.textContent=isEditing?"Modifier ma dépense":"Ajouter une dépense";
 if(intro)intro.textContent=isEditing?"Modifie les informations de ton achat puis enregistre les changements.":"Trois informations suffisent. Le reste est facultatif.";
}
function localPurchaseDate(value){const d=value?new Date(value):new Date();if(!Number.isFinite(d.getTime()))return "";return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
if($("purchaseDate")&&!$("purchaseDate").value)$("purchaseDate").value=localPurchaseDate();if($("purchaseCategory"))$("purchaseCategory").required=false;
function editPurchase(id){const p=state.expenses.find(x=>x.id===id);if(!p)return;editingPurchaseId=id;setPurchaseFormTitle(true);if($("purchaseId"))$("purchaseId").value=id;if($("purchaseDate"))$("purchaseDate").value=localPurchaseDate(p.at);if($("merchant"))$("merchant").value=p.label||"";if($("purchaseNotes"))$("purchaseNotes").value=p.notes||"";if($("city"))$("city").value=p.city||"";if($("purchaseAmount"))$("purchaseAmount").value=p.amount??"";if($("purchaseCategory")){$("purchaseCategory").value=p.category||"";$("purchaseCategory").dispatchEvent(new Event("input",{bubbles:true}))}if($("psychology"))$("psychology").value=p.psychology||"reflective";if($("moodAfter"))$("moodAfter").value=p.moodAfter||"neutral";if($("need"))$("need").value=p.need||"yes";if($("delay"))$("delay").value=p.delay||"now";if($("purchaseSubmit")){$("purchaseSubmit").innerHTML='<svg class="save-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h12l3.25 3.25v13.25H3.75V5A1.25 1.25 0 0 1 5 3.75Z"/><path d="M7.5 3.75v6h8v-6M7.5 20.25v-7h9v7"/></svg> Enregistrer les modifications';$("purchaseSubmit").classList.remove("hidden")}if($("purchaseNew"))$("purchaseNew").classList.add("hidden");if($("cancelEdit"))$("cancelEdit").classList.remove("hidden");setPurchaseMode("manual");if(window.BEP_OPEN_ENTRY_DIALOG)window.BEP_OPEN_ENTRY_DIALOG("purchase");else $("purchaseForm")?.scrollIntoView({behavior:"smooth",block:"center"})}
function cancelPurchaseEdit(){editingPurchaseId=null;receiptCaptureText="";setPurchaseFormTitle(false);$("purchaseForm").reset();if($("purchaseDate"))$("purchaseDate").value=localPurchaseDate();if($("purchaseId"))$("purchaseId").value="";$("purchaseSubmit").innerHTML='<svg class="save-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h12l3.25 3.25v13.25H3.75V5A1.25 1.25 0 0 1 5 3.75Z"/><path d="M7.5 3.75v6h8v-6M7.5 20.25v-7h9v7"/></svg> Enregistrer l’achat';$("purchaseSubmit").classList.remove("hidden");$("purchaseNew")?.classList.add("hidden");$("cancelEdit").classList.add("hidden")}
if($("cancelEdit"))$("cancelEdit").onclick=cancelPurchaseEdit;if($("purchaseNew"))$("purchaseNew").onclick=()=>{editingPurchaseId=null;setPurchaseFormTitle(false);$("purchaseForm").reset();if($("purchaseDate"))$("purchaseDate").value=localPurchaseDate();if($("purchaseId"))$("purchaseId").value="";$("purchaseSubmit").classList.remove("hidden");$("purchaseNew").classList.add("hidden");$("cancelEdit").classList.add("hidden");$("purchaseSubmit").innerHTML='<svg class="save-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h12l3.25 3.25v13.25H3.75V5A1.25 1.25 0 0 1 5 3.75Z"/><path d="M7.5 3.75v6h8v-6M7.5 20.25v-7h9v7"/></svg> Enregistrer l’achat';$("merchant")?.focus()};
if($("selectAllPurchases"))$("selectAllPurchases").onclick=()=>{const items=(state.expenses||[]);if(items.length&&purchaseSelection.size===items.length)purchaseSelection.clear();else items.forEach(p=>purchaseSelection.add(p.id));render()};if($("cancelPurchaseSelection"))$("cancelPurchaseSelection").onclick=()=>{purchaseSelectionMode=false;purchaseSelection.clear();render()};if($("deleteSelectedPurchases"))$("deleteSelectedPurchases").onclick=async()=>{const ids=new Set(purchaseSelection);if(!ids.size)return;if(!(await (window.BEP_CONFIRM_ACTION?window.BEP_CONFIRM_ACTION("Cette action supprimera "+ids.size+" achat(s), sans modifier les revenus ni les charges.","Supprimer la sélection"):Promise.resolve(confirm("Supprimer définitivement les "+ids.size+" achats sélectionnés ? Cette action ne modifiera pas le budget ni les revenus.")))))return;state.expenses=(state.expenses||[]).filter(p=>!ids.has(p.id));if(ids.has(editingPurchaseId))cancelPurchaseEdit();purchaseSelection.clear();purchaseSelectionMode=false;save();notify(ids.size+" achat(s) supprimé(s)")};
$("purchaseForm").onsubmit=e=>{
 e.preventDefault();
 const label=$("merchant")?.value.trim()||"";
 const amount=Number($("purchaseAmount").value);
 if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99)return notify("Le montant doit être supérieur à zéro et rester dans la limite autorisée.");
 const category=$("purchaseCategory")?.value.trim()||"Autre";
 if($("purchaseCategory"))$("purchaseCategory").required=false;
 const previous=editingPurchaseId?state.expenses.find(x=>x.id===editingPurchaseId)||{}:{};
 const purchaseLabel=label||category||"Achat";
 const p={...previous,id:editingPurchaseId||crypto.randomUUID(),captureMode:editingPurchaseId?(previous.captureMode||"manual"):(receiptCaptureText?"receipt":"manual"),captureText:editingPurchaseId?(previous.captureText||""):(receiptCaptureText||$("purchaseDescription")?.value||""),label:purchaseLabel,notes:$("purchaseNotes")?.value.trim()||"",city:$("city")?.value.trim()||"",amount,category,psychology:$("psychology")?.value||"reflective",moodAfter:$("moodAfter")?.value||"",need:$("need")?.value||"yes",delay:$("delay")?.value||"now",at:(()=>{const date=$("purchaseDate")?.value||localPurchaseDate();return date?new Date(date+"T12:00:00").toISOString():new Date().toISOString()})()};
 const wasEditing=Boolean(editingPurchaseId),beforeExpenses=(state.expenses||[]).slice();
 if(wasEditing)state.expenses=state.expenses.map(x=>x.id===editingPurchaseId?p:x);else state.expenses.unshift(p);
 if(save()===false){state.expenses=beforeExpenses;return}
 showPurchaseAdvice(p);cancelPurchaseEdit();$("purchaseSubmit").classList.add("hidden");$("purchaseNew")?.classList.remove("hidden");notify(wasEditing?"Achat modifié":"Achat enregistré");window.dispatchEvent(new CustomEvent("bep:expense-saved"));
};


async function showPurchaseAdvice(p){
 const target=$("purchaseAdvice");if(!target)return;
 const local=advice(p),financialContext=currentFinancialContext(),available=Number(financialContext.available),amount=Number(p.amount)||0;
 const availableKnown=Number.isFinite(available),overBudget=availableKnown&&amount>available;
 const budgetWarning=overBudget?(available<0
  ? "Attention : ton montant restant disponible est déjà négatif ("+money(available)+"). Cet achat de "+money(amount)+" aggraverait le dépassement. Il est hors budget."
  : "Attention : cet achat de "+money(amount)+" dépasse le montant restant disponible de "+money(available)+" de "+money(amount-available)+". Il est hors budget."): "";
 target.classList.remove("hidden");
 target.textContent=budgetWarning||"Préparation du conseil BEP…";
 if(aiCoachEnabled&&window.bepSignedIn&&aiConnection?.personal){
  const question="Analyse cet achat enregistré et donne un conseil personnalisé, concret et non moralisateur. Libellé : "+(p.merchant||p.category||"Achat")+". Montant : "+money(p.amount)+". Montant restant disponible avant cet achat : "+(availableKnown?money(available):"non renseigné")+". "+(overBudget?"ALERTE : le montant dépasse le disponible ; indique clairement que cet achat est hors budget et invite à la prudence, sans bloquer son enregistrement. ":"")+"Catégorie : "+(p.category||"non précisée")+". État déclaré : "+p.psychology+". Besoin réel : "+p.need+". Délai : "+p.delay+". Pour juger l'abordabilité, utilise exclusivement le montant restant disponible, sans recalculer à partir des revenus, charges, épargne ou objectifs. Réponds en trois parties courtes : lecture de la décision, impact/prudence budgétaire, une question utile.";
  try{
   const started=performance.now();
   const r=await fetch(API+"/api/ai/chat",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,intent:"purchase_review",financialContext:{available:availableKnown?available:null}})});
   const d=await r.json();if(!r.ok)throw Error(d.message||"Conseil IA indisponible.");
   target.textContent=(budgetWarning?budgetWarning+" ":"")+d.answer;
   const elapsed=Math.max(0,performance.now()-started),tokens=Number(d.usage?.total_tokens)||Math.max(1,Math.ceil(String(d.answer||"").length/4));
   aiUsage.requests=(Number(aiUsage.requests)||0)+1;aiUsage.estimatedTokens=(Number(aiUsage.estimatedTokens)||0)+tokens;aiUsage.totalMs=(Number(aiUsage.totalMs)||0)+elapsed;try{localStorage.setItem(AI_USAGE_KEY,JSON.stringify(aiUsage))}catch{}renderAIUsage();
   return;
  }catch(e){target.textContent=(budgetWarning?budgetWarning+" ":"")+"Le conseil IA est indisponible. Conseil local : "+local.join(" ")+" "+(e.message||"")}
  return;
 }
 target.innerHTML=(budgetWarning?"<strong>"+esc(budgetWarning)+"</strong><br><br>":"")+"<strong>"+esc(local[0])+"</strong>"+esc(local[1])+"<br><br><b>Question BEP :</b> "+esc(local[2]);
}
function coachReply(question){
 const q=String(question||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const income=totalIncome(),spent=charges(),left=available(),budgets=state.budgets||[],goals=state.goals||[],expenses=state.expenses||[];
 const now=new Date(),month=expenses.filter(p=>{const d=new Date(p.at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});
 const spentThisMonth=month.reduce((n,p)=>n+Number(p.amount||0),0);
 const impulsive=month.filter(p=>p.psychology==="impulsive"||p.psychology==="pressure").length;
 const monthlyGoals=goals.reduce((n,g)=>n+Number(g.monthly||0),0);
 const hi=coachFirstName?coachFirstName+", ":"";
 if(!income)return hi+"je peux t'accompagner, mais il me manque ton revenu mensuel. Renseigne-le dans l'onglet Budget pour que mes recommandations reposent sur des chiffres fiables. En attendant, évite de fixer un objectif d'épargne sans connaître ta marge réelle.";
 if(/stress|pression|peur|angoiss|difficile|panique|culpabil/.test(q)){
  return hi+"commençons par ralentir la décision. Ne prends aucun engagement financier sous le coup de la pression. Note le fait concret qui t'inquiète, distingue-le de ce que tu imagines, puis reporte toute dépense non essentielle de 24 heures. Ton reste disponible estimé est de "+money(left)+".";
 }
 if(/achat|acheter|envie|impuls|craquer|commander/.test(q)){
  const guard=left<=0?"Ton budget ne dégage actuellement aucune marge positive : je te recommande de différer tout achat non essentiel.": "Vérifie que le montant entre dans ton reste disponible de "+money(left)+".";
  return hi+"avant de décider, vérifie trois points : est-ce un besoin concret, l'achat était-il prévu, et peux-tu attendre 24 heures ? "+guard+(impulsive?" Tu as enregistré "+impulsive+" achat(s) sous impulsion ou pression ce mois-ci : prends ce signal comme une invitation à ralentir, pas comme un jugement.":"");
 }
 if(/epargne|economis|objectif|mettre de cote|mettre de cote/.test(q)){
  if(left<=0)return hi+"la priorité est de retrouver une marge budgétaire avant de programmer une épargne. Tes charges atteignent "+money(spent)+" pour "+money(income)+" de revenus.";
  return hi+"ton reste disponible estimé est de "+money(left)+". Tes objectifs actuels représentent "+money(monthlyGoals)+" par mois. Une cible prudente doit rester inférieure à ta marge réelle et laisser une réserve pour les imprévus. "+(goals.length?"Revois chaque engagement avant d'en ajouter un nouveau.":"Commence par un objectif modeste et mesurable.");
 }
 if(/budget|charge|revenu|reste|depense|depens/.test(q)){
  const ratio=income?Math.round(spent/income*100):0;
  const largest=[...budgets].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
  return hi+"voici ta situation : revenus "+money(income)+", charges enregistrées "+money(spent)+", reste estimé "+money(left)+". Tes charges représentent "+ratio+" % de tes revenus. "+(left<0?"Il existe un déficit : identifie d'abord un poste ajustable sans toucher aux dépenses essentielles.":left/income<.1?"Ta marge est inférieure à 10 % : protège ta trésorerie et évite les nouveaux engagements.":"Ta marge est positive. Conserve une réserve avant d'augmenter tes dépenses ou ton épargne.")+(largest?" Ton poste le plus important est "+largest.category+" ("+money(largest.amount)+").":"");
 }
 if(/objectif|progres|plan|priorite/.test(q))return hi+"choisissons une seule priorité pour les 7 prochains jours. Ton reste disponible est de "+money(left)+" et tes dépenses enregistrées ce mois-ci totalisent "+money(spentThisMonth)+". Une action simple et vérifiable sera plus utile qu'un objectif trop ambitieux.";
 return hi+"je peux t'aider à analyser ton budget, tes dépenses, ton épargne ou une décision d'achat. Pour te répondre précisément, indique-moi ce qui te préoccupe et je croiserai ta question avec les données déjà enregistrées dans BEP.";
}
function addCoachMessage(role,message){
 const log=$("coachChatLog");if(!log)return;
 const item=document.createElement("div");item.className="coach-message "+(role==="user"?"coach-message-user":"coach-message-bot");
 if(role!=="user"){const title=document.createElement("strong");title.textContent="Coach BEP";item.appendChild(title)}
 const p=document.createElement("p");p.textContent=message;item.appendChild(p);log.appendChild(item);log.scrollTop=log.scrollHeight;
}
let aiConnection={configured:false,provider:"",model:"",mode:"local",personal:false,used:0,limit:60};
const AI_ENABLED_KEY="bep-external-ai-enabled-v1";let aiCoachEnabled=false;try{localStorage.removeItem(AI_ENABLED_KEY)}catch{}
async function loadAiConnection(){if(!window.bepSignedIn)return;try{
 const sr=await fetch(API+"/api/ai/status",{credentials:"include",cache:"no-store"});
 if(!sr.ok)throw Error("HTTP "+sr.status);
 const status=await sr.json(),active=!!status.available;
 aiConnection={configured:active,mode:active?"bep":"structured",provider:status.provider||"",model:status.model||"",used:Number(status.used)||0,limit:Number(status.limit)||60,personal:false,financialIntelligence:status.financialIntelligence||{enabled:false}};
 const coachBadge=$("coachBadge");if(coachBadge)coachBadge.innerHTML=active?'<span class="pin">●</span> Coach IA BEP':'<span class="pin">●</span> Coach BEP structuré';
 const modeLabel=$("coachModeLabel");if(modeLabel)modeLabel.textContent=active?"● IA BEP configurée · "+aiConnection.provider+" / "+aiConnection.model:"● Base financière BEP · Gemini sous verrou gratuit";
 const statusLabel=$("aiConnectionStatus");if(statusLabel)statusLabel.textContent=active?"Le fournisseur IA est configuré. La connexion réelle est vérifiée à chaque réponse. Les appels passent par le service BEP.": "Le moteur financier BEP reste disponible. Gemini est verrouillé tant que le fonctionnement sans facturation du projet Google n'est pas confirmé.";
 const quotaLabel=$("aiQuotaStatus");if(quotaLabel){quotaLabel.textContent=active?"Quota BEP : "+aiConnection.used+" / "+aiConnection.limit+" requêtes ce mois-ci.":"Base BEP : conseils structurés sans appel Gemini.";quotaLabel.classList.remove("hidden")}
 const badge=$("aiConnectionBadge");if(badge)badge.textContent=active?"Gemini gratuit":"BEP structuré";
 const disconnect=$("disconnectAiBtn");if(disconnect)disconnect.classList.add("hidden");
 const advanced=$("aiAdvancedSettings");if(advanced){advanced.hidden=true;advanced.classList.add("hidden")}
 const coachMode=$("coachAiMode");if(coachMode)coachMode.textContent=active?"● Coach IA BEP configuré · "+aiConnection.provider:"● Coach BEP structuré";
 }catch(e){aiConnection={configured:false,mode:"unavailable",provider:"",model:"",personal:false,used:0,limit:60};const label=$("aiConnectionStatus");if(label)label.textContent="Impossible de vérifier le service IA. Réessaie dans un instant. ("+e.message+")";const badge=$("aiConnectionBadge");if(badge)badge.textContent="Service indisponible";}}
async function submitCoachQuestion(question){
 const value=String(question||"").trim();if(!value)return;addCoachMessage("user",value);
 if(window.bepSignedIn&&(!aiConnection.mode||aiConnection.mode==="unavailable"))await loadAiConnection();
 if(window.bepSignedIn&&["bep","structured"].includes(aiConnection?.mode)){
  addCoachMessage("coach",aiConnection.mode==="bep"?"Le Coach BEP analyse ta demande…":"Le moteur financier BEP analyse ta demande…");const log=$("coachChatLog"),last=log?.lastElementChild;
  try{
   const r=await fetch(API+"/api/ai/chat",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:value,financialContext:currentFinancialContext(),coachProfile:state.coachProfile||[]})}),d=await r.json();
   if(!r.ok)throw Error(d.message||"IA indisponible.");
   const p=last?.querySelector("p");if(p)p.textContent=d.answer;else addCoachMessage("coach",d.answer);
   if(d.intelligence){
    const trace=[];trace.push(d.intelligence.enabled?"RAG actif":"RAG désactivé");
    const sources=Array.isArray(d.intelligence.knowledge)?d.intelligence.knowledge:[];
    trace.push(sources.length+" source(s) récupérée(s)");
    if(sources.length)trace.push(sources.map(x=>x.title+" — "+x.source).join(" | "));
    const c=d.intelligence.context||{};trace.push("Contexte chargé : "+(c.monthlyHistoryMonths||0)+" historique(s) mensuel(s), "+(c.budgets||0)+" charge(s), "+(c.goals||0)+" objectif(s), "+(c.expenses||0)+" dépense(s), "+(c.savingsOperations||0)+" mouvement(s) d’épargne.");(c.dataWarnings||[]).forEach(w=>trace.push("Alerte données : "+w));
    const detail=document.createElement("small");detail.className="coach-source-trace";detail.textContent=trace.join(" · ");last?.appendChild(detail);
   }
   const tokens=Number(d.usage?.total_tokens||d.usage?.totalTokenCount)||Math.max(1,Math.ceil(String(d.answer||"").length/4));aiUsage.requests=(Number(aiUsage.requests)||0)+1;aiUsage.estimatedTokens=(Number(aiUsage.estimatedTokens)||0)+tokens;try{localStorage.setItem(AI_USAGE_KEY,JSON.stringify(aiUsage))}catch{}renderAIUsage();
  }catch(e){const p=last?.querySelector("p");if(p)p.textContent="Le fournisseur IA n’a pas répondu correctement. Aucune réponse locale n’a été substituée. Détail : "+e.message}
 }else if(!window.bepSignedIn||aiConnection?.mode==="structured"){
  addCoachMessage("coach",coachReply(value));
 }else{
  addCoachMessage("coach","Le service IA BEP est momentanément injoignable. Aucune réponse générative n’a été produite. Réessaie après vérification de la connexion.");
 }
}
$("coachPromptForm").onsubmit=e=>{e.preventDefault();const input=$("coachPromptInput"),value=input.value.trim();if(!value)return;submitCoachQuestion(value);input.value="";input.focus()};
document.querySelectorAll("[data-coach-prompt]").forEach(button=>button.addEventListener("click",()=>{const input=$("coachPromptInput");input.value=button.dataset.coachPrompt||"";input.focus()}));
const CHART_COLORS=["#176b50","#79b99b","#b9e8d0","#d6a85f","#7b91ad","#c78e86","#9a83b7","#8b9a92"];
function chartEmpty(message){return '<div class="chart-empty">'+message+'</div>'}
function compactMoney(n){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",notation:"compact",maximumFractionDigits:1}).format(Number(n)||0)}
function donutChart(items,total){
 if(!items.length||total<=0)return chartEmpty("Ajoute des données pour afficher ce graphique.");
 const circumference=2*Math.PI*70;let offset=0;
 const circles=items.map((item,i)=>{const value=Math.max(0,Number(item.value)||0);const length=value/total*circumference;const c='<circle class="chart-data-point" data-label="'+esc(item.label)+'" data-value="'+value+'" cx="100" cy="100" r="70" fill="none" stroke="'+CHART_COLORS[i%CHART_COLORS.length]+'" stroke-width="25" stroke-dasharray="'+length+' '+(circumference-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 100 100)"/>';offset+=length;return c}).join("");
 const legend=items.map((item,i)=>'<div class="chart-legend-item"><i style="background:'+CHART_COLORS[i%CHART_COLORS.length]+'"></i><span>'+esc(item.label)+'</span><b>'+money(item.value)+'</b></div>').join("");
 return '<div class="donut-layout"><svg class="donut-svg" viewBox="0 0 200 200" role="img" aria-label="Graphique de répartition"><circle cx="100" cy="100" r="70" fill="none" stroke="#edf2ef" stroke-width="25"/>'+circles+'<text x="100" y="96" text-anchor="middle" class="donut-total">'+compactMoney(total)+'</text><text x="100" y="116" text-anchor="middle" class="donut-caption">Total</text></svg><div class="chart-legend">'+legend+'</div></div>'
}
let chartIndex=0;
const chartViews=["budget","expenses","monthly","capacity"];
function renderCharts(){
 const budgetItems=(state.budgets||[]).filter(x=>Number(x.amount)>0).map(x=>({label:x.category||"Autres",value:Number(x.amount)}));
 const byCategory={};
 (state.expenses||[]).forEach(p=>{const k=p.category||"Autres";byCategory[k]=(byCategory[k]||0)+Math.max(0,Number(p.amount)||0)});
 const allExpenseItems=Object.entries(byCategory).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
 const expenseItems=allExpenseItems.length>8?[...allExpenseItems.slice(0,7),{label:"Autres catégories",value:allExpenseItems.slice(7).reduce((n,x)=>n+x.value,0)}]:allExpenseItems;
 const now=new Date(),months=[];
 for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"),label:d.toLocaleDateString("fr-FR",{month:"short"}),value:0})}
 (state.expenses||[]).forEach(p=>{const d=new Date(p.at);if(Number.isNaN(d.getTime()))return;const m=months.find(x=>x.key===d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));if(m)m.value+=Math.max(0,Number(p.amount)||0)});
 const max=Math.max(1,...months.map(x=>x.value));
 const grid=[0,1,2,3].map(i=>{const y=35+i*48;return '<line x1="35" y1="'+y+'" x2="565" y2="'+y+'" stroke="#e8efeb" stroke-width="1"/>'}).join("");
 const bars=months.map((m,i)=>{const x=57+i*88,h=m.value>0?Math.max(3,m.value/max*135):0,y=190-h;return '<g class="chart-data-point" data-label="'+esc(m.label)+'" data-value="'+m.value+'"><title>'+esc(m.label)+' : '+money(m.value)+'</title><rect x="'+x+'" y="'+y+'" width="42" height="'+h+'" rx="7" fill="#176b50"/><text x="'+(x+21)+'" y="'+Math.max(22,y-9)+'" text-anchor="middle" fill="#52665d" font-size="11">'+esc(compactMoney(m.value))+'</text><text x="'+(x+21)+'" y="215" text-anchor="middle" fill="#71817b" font-size="12">'+esc(m.label)+'</text></g>'}).join("");
 const monthlyHtml=months.some(m=>m.value>0)?'<svg class="monthly-chart-svg" viewBox="0 0 600 235" role="img" aria-label="Évolution des dépenses sur les six derniers mois">'+grid+bars+'</svg><p class="chart-note">Montants dépensés par mois · les mois sans dépense restent à zéro.</p>':chartEmpty("Enregistre des achats pour afficher leur évolution mensuelle.");
 const plannedSavings=(state.goals||[]).reduce((n,g)=>n+Math.max(0,Number(g.monthly)||0),0);
 const income=Math.max(0,totalIncome()),fixedCharges=budgetItems.reduce((n,x)=>n+x.value,0),afterCharges=Math.max(0,income-fixedCharges),afterSavings=afterCharges-plannedSavings;
 const capacityRows=[{icon:"💶",label:"Revenu mensuel",value:income,color:"#176b50"},{icon:"🏠",label:"Charges prévues",value:fixedCharges,color:"#7b91ad"},{icon:"🐷",label:"Épargne programmée",value:plannedSavings,color:"#d6a85f"},{icon:"💰",label:"Reste après charges et épargne",value:afterSavings,color:afterSavings<0?"#c76f68":"#79b99b"}];
 const capacityHtml=income>0?'<div class="capacity-chart"><div class="capacity-chart-plot">'+capacityRows.map((r,i)=>'<div class="capacity-row chart-data-point" data-label="'+esc(r.label)+'" data-value="'+r.value+'"><span><i class="capacity-icon" aria-hidden="true">'+r.icon+'</i>'+esc(r.label)+'</span><div class="capacity-track"><i style="width:'+Math.min(100,Math.max(0,r.value)/income*100)+'%;background:'+r.color+'"></i></div><b>'+money(r.value)+'</b></div>').join("")+'</div><p class="chart-note">Calcul à partir du revenu, des charges et des engagements d’épargne actuellement enregistrés. Le reste peut être négatif si les engagements dépassent la marge disponible.</p></div>':chartEmpty("Renseigne ton revenu mensuel pour calculer ta capacité d’épargne.");
 const views=[
  {title:"Capacité d’épargne",period:"Situation mensuelle actuelle",html:capacityHtml,wide:true},
  {title:"Répartition du budget",period:"Mensuel",html:donutChart(budgetItems,budgetItems.reduce((n,x)=>n+x.value,0))},
  {title:"Répartition des dépenses",period:"Historique",html:donutChart(expenseItems,expenseItems.reduce((n,x)=>n+x.value,0))},
  {title:"Évolution des dépenses",period:"6 derniers mois",html:monthlyHtml}
 ];
 const view=views[chartIndex]||views[0];
 $("chartTitle").textContent=view.title;$("chartPeriod").textContent=view.period;$("chartZoom").classList.toggle("chart-zoom-wide",!!view.wide);
 const stage=$("activeChart");stage.classList.remove("chart-enter");stage.innerHTML=view.html;void stage.offsetWidth;stage.classList.add("chart-enter");
 $("chartCounter").textContent=(chartIndex+1)+" / "+views.length;
 if(!$("chartZoom").hidden)syncChartZoom();
}
let chartZoomScale=1,chartZoomX=0,chartZoomY=0,chartZoomPointers=new Map(),chartZoomGesture=null,lastChartTap=0;
function paintChartZoom(){
 const canvas=$("chartZoomBody").querySelector(".chart-zoom-canvas");if(!canvas)return;
 canvas.style.transform="translate("+chartZoomX+"px,"+chartZoomY+"px) scale("+chartZoomScale+")";
}
function resetChartZoom(){chartZoomScale=1;chartZoomX=0;chartZoomY=0;paintChartZoom()}
function syncChartZoom(){
 const modal=$("chartZoom"),body=$("chartZoomBody");if(!modal||modal.hidden)return;
 $("chartZoomTitle").textContent=$("chartTitle").textContent;$("chartZoomPeriod").textContent=$("chartPeriod").textContent;
 body.innerHTML='<div class="chart-zoom-viewport"><div class="chart-zoom-canvas">'+$("activeChart").innerHTML+'</div></div>';modal.classList.toggle("chart-zoom-wide",chartIndex===3);
 chartZoomScale=1;chartZoomX=0;chartZoomY=0;bindZoomPoints();bindChartZoomGestures();paintChartZoom();
}
function bindChartZoomGestures(){
 const viewport=$("chartZoomBody").querySelector(".chart-zoom-viewport");if(!viewport)return;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 viewport.addEventListener("touchstart",e=>{
  if(e.touches.length===2){e.preventDefault();const a=e.touches[0],b=e.touches[1],m=midpoint(a,b);chartZoomGesture={mode:"pinch",distance:distance({x:a.clientX,y:a.clientY},{x:b.clientX,y:b.clientY}),scale:chartZoomScale,mid:m,x:chartZoomX,y:chartZoomY};}
  else if(e.touches.length===1&&chartZoomScale>1){const t=e.touches[0];chartZoomGesture={mode:"pan",x:t.clientX,y:t.clientY,baseX:chartZoomX,baseY:chartZoomY};}
 },{passive:false});
 viewport.addEventListener("touchmove",e=>{
  if(!chartZoomGesture)return;
  if(chartZoomGesture.mode==="pinch"&&e.touches.length===2){
   e.preventDefault();const a=e.touches[0],b=e.touches[1],m=midpoint(a,b),d=distance({x:a.clientX,y:a.clientY},{x:b.clientX,y:b.clientY}),next=Math.max(1,Math.min(4,chartZoomGesture.scale*d/Math.max(1,chartZoomGesture.distance)));
   const rect=viewport.getBoundingClientRect(),px=chartZoomGesture.mid.x-rect.left,py=chartZoomGesture.mid.y-rect.top,ratio=next/chartZoomScale;
   chartZoomX=(m.x-rect.left)-(px-chartZoomX)*ratio;chartZoomY=(m.y-rect.top)-(py-chartZoomY)*ratio;chartZoomScale=next;paintChartZoom();
  }else if(chartZoomGesture.mode==="pan"&&e.touches.length===1){
   e.preventDefault();const t=e.touches[0];chartZoomX=chartZoomGesture.baseX+t.clientX-chartZoomGesture.x;chartZoomY=chartZoomGesture.baseY+t.clientY-chartZoomGesture.y;paintChartZoom();
  }
 },{passive:false});
 viewport.addEventListener("touchend",e=>{
  if(e.changedTouches.length===1&&e.touches.length===0&&!chartZoomGesture){
   const now=Date.now();if(now-lastChartTap<320)resetChartZoom();lastChartTap=now;
  }
  if(e.touches.length===0)chartZoomGesture=null;
  else if(e.touches.length===1&&chartZoomScale>1){const t=e.touches[0];chartZoomGesture={mode:"pan",x:t.clientX,y:t.clientY,baseX:chartZoomX,baseY:chartZoomY};}
 },{passive:true});
 viewport.addEventListener("dblclick",e=>{e.preventDefault();resetChartZoom()});
 viewport.addEventListener("wheel",e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();chartZoomScale=Math.max(1,Math.min(4,chartZoomScale*(e.deltaY<0?1.15:.87)));paintChartZoom()},{passive:false});
}
function bindZoomPoints(){
 const body=$("chartZoomBody"),detail=$("chartZoomDetail");if(!body)return;
 body.querySelectorAll(".chart-data-point").forEach(point=>{
  point.style.cursor="pointer";
  point.addEventListener("click",()=>{
   const label=point.dataset.label||"Valeur",value=Number(point.dataset.value)||0;
   detail.textContent=label+" : "+money(value);
   body.querySelectorAll(".chart-data-point").forEach(p=>p.classList.remove("selected"));
   point.classList.add("selected");
  });
 });
}
function openChartZoom(){
 const modal=$("chartZoom");if(!modal)return;
 modal.hidden=false;document.body.classList.add("chart-zoom-open");syncChartZoom();
 $("chartZoomDetail").textContent="Sélectionne une part ou une barre pour voir le détail.";
 $("chartZoomClose").focus();
}
function closeChartZoom(){
 const modal=$("chartZoom");if(!modal)return;modal.hidden=true;document.body.classList.remove("chart-zoom-open");chartZoomPointers.clear();chartZoomGesture=null;
}
$("activeChart").addEventListener("click",e=>{if(e.target.closest(".chart-empty"))return;openChartZoom()});
$("chartZoomClose").addEventListener("click",closeChartZoom);
$("chartZoom").addEventListener("click",e=>{if(e.target===$("chartZoom"))closeChartZoom()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("chartZoom").hidden)closeChartZoom()});

function moveChart(direction){chartIndex=(chartIndex+direction+chartViews.length)%chartViews.length;renderCharts()}
let chartTouchStart=null;
$("chartCarousel").addEventListener("touchstart",e=>{const t=e.changedTouches[0];chartTouchStart={x:t.clientX,y:t.clientY}},{passive:true});
$("chartCarousel").addEventListener("touchend",e=>{if(!chartTouchStart)return;const t=e.changedTouches[0],dx=t.clientX-chartTouchStart.x,dy=t.clientY-chartTouchStart.y;chartTouchStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)moveChart(dx<0?1:-1)},{passive:true});
function savingsOperations(){if(!Array.isArray(state.savingsOperations))state.savingsOperations=[];return state.savingsOperations}
function savingsBalance(goalId){return savingsOperations().filter(o=>o.goalId===goalId).reduce((n,o)=>n+(o.type==="deposit"?1:-1)*Math.max(0,Number(o.amount)||0),0)}
async function cancelSavingsOperation(id){const original=savingsOperations().find(o=>o.id===id);if(!original||original.reversalOf)return notify("Ce mouvement ne peut pas être supprimé.");if(savingsOperations().some(o=>o.reversalOf===id))return notify("Ce mouvement a déjà été supprimé.");const reverseType=original.type==="deposit"?"withdrawal":"deposit",date=savingsToday;if(reverseType==="withdrawal"&&Number(original.amount)>savingsBalance(original.goalId)+0.000001)return notify("Suppression impossible : une partie de ce versement a déjà été retirée. Enregistre d'abord les mouvements correctifs nécessaires.");const accepted=window.BEP_CONFIRM_ACTION?await window.BEP_CONFIRM_ACTION("Le mouvement sera annulé par une écriture corrective. Son historique restera conservé.","Annuler ce mouvement"):confirm("Supprimer ce mouvement de l'historique ?");if(!accepted)return;state.savingsOperations.push({id:crypto.randomUUID(),type:reverseType,goalId:original.goalId,amount:Number(original.amount),date,createdAt:new Date().toISOString(),reversalOf:id});save();notify("Mouvement supprimé.")}
function savingsDate(value){if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d)}const date=new Date(value);return Number.isNaN(date.getTime())?new Date():date}
function renderSavingsExperience(){const advisorFoot=$("savingsAdvisorFoot");if(advisorFoot)advisorFoot.hidden=totalIncome()>0;
 const allGoals=state.goals||[],goals=allGoals.filter(g=>!g.archivedAt),ops=savingsOperations(),cancelledIds=new Set(ops.filter(o=>o.reversalOf).map(o=>o.reversalOf)),visibleOps=ops.filter(o=>!o.reversalOf&&!cancelledIds.has(o.id)),total=allGoals.reduce((n,g)=>n+Math.max(0,savingsBalance(g.id)),0),activeTotal=goals.reduce((n,g)=>n+Math.max(0,savingsBalance(g.id)),0),target=goals.reduce((n,g)=>n+Math.max(0,Number(g.monthly)||0)*Math.max(1,Number(g.duration)||1),0),progress=target?Math.min(100,activeTotal/target*100):0,now=new Date(),monthNet=visibleOps.filter(o=>{const d=savingsDate(o.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((n,o)=>n+(o.type==="deposit"?1:-1)*Number(o.amount||0),0);
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
 set("savingsCapital",money(total));set("savingsCapitalSub",visibleOps.length?visibleOps.length+" mouvement(s) enregistré(s)":"Aucun versement enregistré pour le moment");set("savingsTarget",target?money(target):"Non défini");set("savingsProgress",Math.round(progress)+" %");set("savingsProgressLabel",target?money(activeTotal)+" constitués sur les coffres actifs":"Crée ton premier objectif");set("savingsRemaining",target?money(Math.max(0,target-total))+" restants":"");set("savingsMonthNet",money(monthNet));set("savingsGoalCount",String(goals.length));set("savingsGoalCountBadge",String(goals.length));
 const bar=$("savingsProgressBar"),ring=$("savingsRing");if(bar)bar.style.width=progress+"%";if(ring){ring.style.setProperty("--ring",progress+"%");ring.setAttribute("aria-label","Progression de l'objectif global : "+Math.round(progress)+" %")}
 let streak=0;for(let i=0;i<24;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1),active=visibleOps.some(o=>o.type==="deposit"&&(()=>{const x=savingsDate(o.date);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()})());if(!active)break;streak++}set("savingsStreak",streak+" mois");
 const cards=$("savingsGoalCards");if(cards){cards.innerHTML=goals.length?goals.map(g=>{const balance=Math.max(0,savingsBalance(g.id)),goalTarget=Math.max(0,Number(g.monthly)||0)*Math.max(1,Number(g.duration)||1),pct=goalTarget?Math.min(100,balance/goalTarget*100):0;return '<article class="savings-goal-card"><div class="savings-goal-top"><span class="savings-goal-icon">◈</span><span class="savings-goal-actions"><button type="button" data-edit-goal="'+esc(g.id)+'" aria-label="Modifier '+esc(g.name)+'">✎</button><button type="button" data-delete-goal="'+esc(g.id)+'" aria-label="Archiver '+esc(g.name)+'">×</button></span></div><h3 class="savings-goal-name">'+esc(g.name||"Mon objectif")+'</h3><strong class="savings-goal-balance">'+money(balance)+'</strong><div class="savings-goal-meta">Versement prévu : '+money(g.monthly)+'/mois</div><div class="savings-goal-track"><span style="width:'+pct+'%"></span></div><div class="savings-goal-foot"><span>'+Math.round(pct)+' % de l’objectif</span><span>'+money(goalTarget)+'</span></div></article>'}).join(""):'<div class="savings-operation-empty">Aucun coffre pour le moment. Crée un objectif pour commencer à construire ton capital.</div>';cards.querySelectorAll("[data-edit-goal]").forEach(b=>b.onclick=()=>editGoal(b.dataset.editGoal));cards.querySelectorAll("[data-delete-goal]").forEach(b=>b.onclick=()=>deleteGoal(b.dataset.deleteGoal))}
 refreshSavingsGoalOptions();
 const rewardDefs=[{name:"Premier pas",detail:"Premier versement enregistré",icon:"✦",ok:visibleOps.some(o=>o.type==="deposit")},{name:"500 €",detail:"500 € de capital net",icon:"◈",ok:total>=500},{name:"1 000 €",detail:"1 000 € de capital net",icon:"◆",ok:total>=1000},{name:"3 mois",detail:"3 mois consécutifs avec versement",icon:"◷",ok:streak>=3},{name:"5 000 €",detail:"5 000 € de capital net",icon:"✧",ok:total>=5000},{name:"Objectif atteint",detail:"Un coffre a atteint sa cible",icon:"★",ok:allGoals.some(g=>Number(g.monthly)>0&&savingsBalance(g.id)>=Number(g.monthly)*Number(g.duration||1))}];const rewards=$("savingsRewards");if(rewards)rewards.innerHTML=rewardDefs.map(x=>'<div class="savings-reward '+(x.ok?"unlocked":"")+'"><span class="savings-reward-icon">'+x.icon+'</span><strong>'+x.name+'</strong><small>'+x.detail+'</small></div>').join("");
 const rows=$("savingsOperationRows");if(rows){const recent=[...visibleOps].sort((a,b)=>savingsDate(b.date)-savingsDate(a.date)).slice(0,12);rows.innerHTML=recent.length?recent.map(o=>{const g=allGoals.find(x=>x.id===o.goalId);const deposit=o.type==="deposit",cancelled=cancelledIds.has(o.id);return '<div class="savings-operation-row '+(cancelled?"is-cancelled":"")+'"><div class="savings-operation-main"><b>'+(deposit?"Versement · ":"Retrait · ")+esc(g?(g.archivedAt?g.name+" · archivé":g.name):"Coffre supprimé")+(cancelled?' <small class="savings-cancelled-label">Supprimé</small>':"")+'</b><small>'+savingsDate(o.date).toLocaleDateString("fr-FR")+(cancelled?" · mouvement annulé":"")+'</small></div><span class="savings-operation-amount '+(deposit?"positive":"negative")+(cancelled?" savings-cancelled-amount":"")+'">'+(deposit?"+":"−")+money(o.amount)+'</span>'+(cancelled?"":'<button type="button" class="record-action delete-action savings-delete-button" data-cancel-savings-operation="'+esc(o.id)+'" aria-label="Supprimer ce mouvement" title="Supprimer">Supprimer</button>')+'</div>'}).join(""):'<div class="savings-operation-empty">Tes versements et retraits apparaîtront ici. Enregistre uniquement les mouvements réellement effectués.</div>';rows.querySelectorAll("[data-cancel-savings-operation]").forEach(b=>b.onclick=()=>cancelSavingsOperation(b.dataset.cancelSavingsOperation))}
 updateSavingsProjection();
}
function updateSavingsProjection(){const monthly=Math.max(0,Number($("savingsProjectionMonthly")?.value)||0),years=Math.max(1,Number($("savingsProjectionYears")?.value)||1),future=monthly*12*years,total=Math.max(0,(state.goals||[]).reduce((n,g)=>n+Math.max(0,savingsBalance(g.id)),0))+future;const out=$("savingsProjectionTotal"),detail=$("savingsProjectionDetail");if(out)out.textContent=money(total);if(detail)detail.textContent=money(future)+" de versements futurs, sans rendement."}
function render(){let spent=charges(),financialSummary=financialPosition(),remain=financialSummary.available;syncIncomeTotal();$("homeTotalIncome").textContent=money(totalIncome());$("homeTotalCharges").textContent=money(spent);$("homeAvailable").textContent=money(remain);const financialDetail=$("homeFinancialDetail");if(financialDetail)financialDetail.textContent="Épargne prévue : "+money(financialSummary.plannedSavings)+" · Dépenses hors enveloppe et dépassements : "+money(financialSummary.actualImpact);$("homeAvailable").classList.toggle("negative",remain<0);$("incomeTotal").textContent=money(totalIncome());const chargesTotalEl=$("chargesTotal");if(chargesTotalEl)chargesTotalEl.textContent=money(spent);$("incomeRows").innerHTML=state.incomes.length?state.incomes.map(item=>'<article class="budget-saved-row saved-income-row"><div class="budget-saved-row__main"><span><b>'+esc(item.label)+'</b><small>'+esc(item.type||"Autre revenu")+'</small></span></div><div class="budget-saved-row__actions"><b>'+money(item.amount)+'</b><button type="button" class="record-action edit-action" data-edit-income="'+esc(item.id)+'" aria-label="Modifier le revenu" title="Modifier">✎</button><button type="button" class="record-action delete-action" data-delete-income="'+esc(item.id)+'" aria-label="Supprimer le revenu" title="Supprimer">×</button></div></article>').join(""):"<p class='empty'>Aucun revenu enregistré.</p>";$("incomeRows").querySelectorAll("[data-edit-income]").forEach(b=>b.onclick=()=>editIncome(b.dataset.editIncome));$("incomeRows").querySelectorAll("[data-delete-income]").forEach(b=>b.onclick=()=>deleteIncome(b.dataset.deleteIncome));$("incomeRows").querySelectorAll("[data-edit-income]").forEach(b=>{b.closest(".budget-saved-row, .rowitem").dataset.multiRow=b.dataset.editIncome});attachLongPressSelection("incomeRows","income",incomeSelection,v=>incomeSelectionMode=v,ids=>{state.incomes=state.incomes.filter(x=>!ids.has(String(x.id)));syncIncomeTotal();save();notify("Revenus supprimés")},"revenu");const groupedBudgets={};state.budgets.forEach(b=>{const category=b.category||"Autres dépenses";(groupedBudgets[category]||(groupedBudgets[category]=[])).push(b)});$("budgetRows").innerHTML=state.budgets.length?Object.entries(groupedBudgets).sort((a,b)=>a[0].localeCompare(b[0],"fr")).map(([category,items])=>'<section class="budget-category-group"><div class="budget-category-head"><span>'+esc(category)+'</span><b>'+money(items.reduce((n,b)=>n+Number(b.amount||0),0))+'</b></div>'+items.map(b=>'<article class="budget-saved-row saved-charge-row"><div class="budget-saved-row__main"><span><b>'+esc(b.label||b.category)+'</b><small>'+(b.nature==="fixed"?"Charge fixe":b.nature==="variable"?"Charge variable":"Nature à préciser")+'</small></span></div><div class="budget-saved-row__actions"><b>'+money(b.amount)+'</b><button type="button" class="record-action edit-action" data-edit-budget="'+esc(b.id)+'" aria-label="Modifier" title="Modifier">✎</button><button type="button" class="record-action delete-action" data-delete-budget="'+esc(b.id)+'" aria-label="Supprimer" title="Supprimer">×</button></div></article>').join("")+'</section>').join(""):"<p class='empty'>Aucune charge enregistrée.</p>";$("budgetRows").querySelectorAll("[data-edit-budget]").forEach(b=>b.onclick=()=>editBudget(b.dataset.editBudget));$("budgetRows").querySelectorAll("[data-delete-budget]").forEach(b=>b.onclick=()=>deleteBudget(b.dataset.deleteBudget));$("budgetRows").querySelectorAll("[data-edit-budget]").forEach(b=>{b.closest(".budget-saved-row, .rowitem").dataset.multiRow=b.dataset.editBudget});attachLongPressSelection("budgetRows","budget",budgetSelection,v=>budgetSelectionMode=v,ids=>{state.budgets=state.budgets.filter(x=>!ids.has(String(x.id)));save();notify("Charges supprimées")},"charge");$("budgetWarning").innerHTML=remain<0?'<div class="notice warning">Tes charges dépassent ton revenu de '+money(-remain)+'.</div>':"";const activeGoals=state.goals.filter(g=>!g.archivedAt);$("goalsList").innerHTML=activeGoals.length?activeGoals.map(g=>'<div class="rowitem"><span><b>'+esc(g.name)+'</b><small>'+g.rate+' % · '+g.duration+' mois</small></span><span class="goal-row-actions"><b>'+money(g.monthly)+'/mois</b><span class="record-actions"><button type="button" class="record-action edit-action" data-edit-goal="'+esc(g.id)+'" aria-label="Modifier" title="Modifier">✎</button><button type="button" class="record-action delete-action" data-delete-goal="'+esc(g.id)+'" aria-label="Archiver" title="Archiver">×</button></span></span></div>').join(""):"<p class='empty'>Aucun objectif actif.</p>";$("goalsList").querySelectorAll("[data-edit-goal]").forEach(b=>b.onclick=()=>editGoal(b.dataset.editGoal));$("goalsList").querySelectorAll("[data-delete-goal]").forEach(b=>b.onclick=()=>deleteGoal(b.dataset.deleteGoal));const purchaseItems=(state.expenses||[]).slice(0,3000),selectedPurchaseIds=Array.from(purchaseSelection).filter(id=>purchaseItems.some(p=>p.id===id));purchaseSelection=new Set(selectedPurchaseIds);const purchaseToolbar=$("purchaseBulkToolbar");if(purchaseToolbar)purchaseToolbar.classList.toggle("hidden",!purchaseSelectionMode);if($("purchaseSelectionCount"))$("purchaseSelectionCount").textContent=purchaseSelection.size+" achat(s) sélectionné(s)";if($("deleteSelectedPurchases"))$("deleteSelectedPurchases").disabled=purchaseSelection.size===0;if($("selectAllPurchases"))$("selectAllPurchases").textContent=purchaseSelection.size===purchaseItems.length&&purchaseItems.length?"Tout désélectionner":"Tout sélectionner";let rows=purchaseItems.map(p=>'<div class="rowitem purchase-row '+(purchaseSelection.has(p.id)?"is-selected":"")+'" data-purchase-row="'+esc(p.id)+'" data-amount="'+(Number(p.amount)||0)+'" data-date="'+esc(p.at||"")+'" data-psychology="'+esc(p.psychology||"")+'"><span class="purchase-row-main">'+(purchaseSelectionMode?'<input class="purchase-select-check" type="checkbox" data-select-purchase="'+esc(p.id)+'" '+(purchaseSelection.has(p.id)?"checked":"")+' aria-label="Sélectionner cet achat">':"")+'<span><b>'+esc(String(p.label||p.merchant||p.description||p.captureText||p.notes||p.category||"Achat").trim().slice(0,80))+'</b><small>'+esc(p.category)+' · '+new Date(p.at).toLocaleDateString("fr-FR")+(p.city?' · '+esc(p.city):'')+'</small></span></span><span class="purchase-row-actions"><b>'+money(p.amount)+'</b><button type="button" class="record-action edit-action" data-edit-purchase="'+esc(p.id)+'" aria-label="Modifier" title="Modifier">✎</button><button type="button" class="record-action delete-action" data-delete-purchase="'+esc(p.id)+'" aria-label="Supprimer" title="Supprimer">×</button></span></div>').join("");$("purchaseRows").innerHTML=rows||"Aucun achat enregistré.";$("purchaseRows").querySelectorAll("[data-select-purchase]").forEach(c=>c.onchange=()=>{if(c.checked)purchaseSelection.add(c.dataset.selectPurchase);else purchaseSelection.delete(c.dataset.selectPurchase);render()});$("purchaseRows").querySelectorAll("[data-edit-purchase]").forEach(b=>b.onclick=()=>{if(purchaseSelectionMode)return;editPurchase(b.dataset.editPurchase)});$("purchaseRows").querySelectorAll("[data-delete-purchase]").forEach(b=>b.onclick=()=>{const id=b.dataset.deletePurchase;if(!confirm("Supprimer définitivement cet achat ?"))return;state.expenses=state.expenses.filter(x=>x.id!==id);purchaseSelection.delete(id);if(editingPurchaseId===id)cancelPurchaseEdit();save();notify("Achat supprimé")});$("purchaseRows").querySelectorAll("[data-purchase-row]").forEach(row=>{let pressTimer=null;const start=e=>{if(e.target.closest("button,input"))return;pressTimer=setTimeout(()=>{purchaseSelectionMode=true;purchaseSelection.add(row.dataset.purchaseRow);suppressPurchaseClick=true;render();setTimeout(()=>{suppressPurchaseClick=false},650)},520)};const clear=()=>{if(pressTimer)clearTimeout(pressTimer);pressTimer=null};row.addEventListener("pointerdown",start);["pointerup","pointerleave","pointercancel"].forEach(type=>row.addEventListener(type,clear));row.addEventListener("contextmenu",e=>e.preventDefault());row.addEventListener("click",e=>{if(suppressPurchaseClick){e.preventDefault();e.stopPropagation();return}if(purchaseSelectionMode&&!e.target.closest("button,input")){if(purchaseSelection.has(row.dataset.purchaseRow))purchaseSelection.delete(row.dataset.purchaseRow);else purchaseSelection.add(row.dataset.purchaseRow);render()}})});renderSavingsExperience();preview();renderAI();renderAIUsage();renderCharts();window.dispatchEvent(new CustomEvent("bep:state-rendered"))}

window.bepSignedIn=false;window.dispatchEvent(new Event("bep:auth-ready"));
const gate=$("authGate"),loginForm=$("loginForm"),registerForm=$("registerForm"),verifyEmailForm=$("verifyEmailForm"),authMessage=$("authMessage"),PENDING_EMAIL_KEY="bep-pending-verification-email";let pendingVerificationEmail=localStorage.getItem(PENDING_EMAIL_KEY)||"";
function showVerification(email,message){pendingVerificationEmail=String(email||"").trim().toLowerCase();if(pendingVerificationEmail)localStorage.setItem(PENDING_EMAIL_KEY,pendingVerificationEmail);loginForm.hidden=true;registerForm.hidden=true;verifyEmailForm.hidden=false;authMessage.textContent=message||("Code envoyé à "+pendingVerificationEmail+". Consulte Gmail puis reviens ici pour le saisir.")}
function authMode(mode){const reg=mode==="register";loginForm.hidden=reg;registerForm.hidden=!reg;verifyEmailForm.hidden=true;$("showLogin").classList.toggle("active",!reg);$("showRegister").classList.toggle("active",reg);authMessage.textContent=""}
$("showLogin").onclick=()=>authMode("login");$("showRegister").onclick=()=>authMode("register");
$("googleLogin").onclick=()=>{window.location.href=API+"/api/auth/google"};
async function finishAuth(isNew){try{if(!isNew){const r=await fetch(API+"/api/data",{credentials:"include"});if(!r.ok)throw Error("Impossible de charger tes données.");const d=await r.json();state={...defaults,...(d.payload||{})};if(!Array.isArray(state.coachProfile))state.coachProfile=[];if(window.BEPOffline){try{const authResponse=await fetch(API+"/api/auth/status",{credentials:"include",cache:"no-store"});const authData=await authResponse.json();window.BEPOffline.markKnownUser(authData.user?.id||authData.user?.email||"authenticated")}catch{window.BEPOffline.markKnownUser("authenticated")}await window.BEPOffline.setBaseline(d.payload||{})}renderCoachProfile();await persistMigratedIncomeState()}else{const r=await fetch(API+"/api/data",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)});if(!r.ok)throw Error("Le compte est créé, mais la sauvegarde initiale a échoué.")}localStorage.removeItem(PENDING_EMAIL_KEY);pendingVerificationEmail="";window.bepSignedIn=true;if(window.BEPOffline){try{const authResponse=await fetch(API+"/api/auth/status",{credentials:"include",cache:"no-store"});const authData=await authResponse.json();window.BEPOffline.markKnownUser(authData.user?.id||authData.user?.email||"authenticated")}catch{window.BEPOffline.markKnownUser("authenticated")}window.BEPOffline.setBaseline(state)}window.dispatchEvent(new Event("bep:auth-ready"));gate.hidden=true;aiConnection={configured:false,provider:"",model:""};await loadAiConnection();tab("home");render()}catch(e){authMessage.textContent=e.message}}
$("resendVerification").onclick=async()=>{if(!pendingVerificationEmail)return authMessage.textContent="Adresse e-mail manquante. Recommence l'inscription.";authMessage.textContent="Envoi du code…";try{const r=await fetch(API+"/api/auth/resend-verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:pendingVerificationEmail})});const d=await r.json();if(!r.ok)throw Error(d.message||"Envoi impossible.");authMessage.textContent="Un nouveau code a été envoyé à "+pendingVerificationEmail+"."}catch(e){authMessage.textContent=e.message}};verifyEmailForm.onsubmit=async e=>{e.preventDefault();if(!pendingVerificationEmail)return authMessage.textContent="Adresse e-mail manquante. Recommence l'inscription.";authMessage.textContent="Vérification…";try{const r=await fetch(API+"/api/auth/verify-email",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:pendingVerificationEmail,code:$("verifyEmailCode").value})});const d=await r.json();if(!r.ok)throw Error(d.message||"Vérification impossible.");await finishAuth(true)}catch(e){authMessage.textContent=e.message}};loginForm.onsubmit=async e=>{e.preventDefault();authMessage.textContent="Connexion…";try{const r=await fetch(API+"/api/auth/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});const d=await r.json();if(!r.ok)throw Error(d.message||"Connexion impossible.");await finishAuth(false)}catch(x){authMessage.textContent=x.message}};
registerForm.onsubmit=async e=>{e.preventDefault();authMessage.textContent="Création du compte et envoi du code…";try{const email=$("registerEmail").value.trim().toLowerCase(),r=await fetch(API+"/api/auth/register",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("registerName").value,email,password:$("registerPassword").value})}),d=await r.json();if(!r.ok){if(r.status===409){showVerification(email,"Un compte existe déjà avec cette adresse. Si l'inscription précédente a été interrompue, appuie sur « Renvoyer le code ».");return}throw Error(d.message||"Création impossible.")}showVerification(d.email,"Code envoyé à "+d.email+". Consulte Gmail puis reviens ici pour le saisir.")}catch(x){authMessage.textContent=x.message}};
const oauthResult=new URLSearchParams(window.location.search).get("login");const oauthMessages={success:"Connexion Google réussie.",error:"Google n’a pas finalisé la connexion. Vérifie le compte Google choisi puis réessaie.",google_config_error:"La configuration Google de BEP est invalide : le Client Secret OAuth doit être renouvelé dans Google Cloud puis mis à jour sur le serveur.",link_required:"Un compte BEP existe déjà avec cette adresse. Connecte-toi par e-mail puis associe Google dans les paramètres.",link_email_mismatch:"Choisis dans Google la même adresse e-mail que celle de ton compte BEP.",google_already_linked:"Ce compte Google est déjà associé à un autre compte BEP.",google_email_changed:"L’adresse e-mail Google ne correspond plus au compte associé.",link_session_required:"La session BEP a expiré. Reconnecte-toi puis réessaie.",link_account_missing:"Le compte BEP à associer est introuvable.",link_session_error:"Google est associé, mais la session n’a pas pu être actualisée. Reconnecte-toi.",google_linked:"Compte Google associé avec succès."};if(oauthResult&&oauthMessages[oauthResult]){authMessage.textContent=oauthMessages[oauthResult];history.replaceState({},document.title,window.location.pathname+window.location.hash)}(async()=>{if(new URLSearchParams(window.location.search).has("reset")){gate.hidden=false;const startupLoader=document.getElementById("bepStartupLoader");if(startupLoader)startupLoader.hidden=true;return}if(pendingVerificationEmail)showVerification(pendingVerificationEmail,"Inscription en attente pour "+pendingVerificationEmail+". Saisis le code reçu ou demande-en un nouveau.");try{const r=await fetch(API+"/api/auth/status",{credentials:"include"});const d=await r.json();if(d.user){window.bepSignedIn=true;try{const profileResponse=await fetch(API+"/api/me",{credentials:"include",cache:"no-store"});if(profileResponse.ok){const profileData=await profileResponse.json();coachFirstName=String(profileData.user?.firstName||"").trim()}}catch{}const q=await fetch(API+"/api/data",{credentials:"include"});if(q.ok){const payload=await q.json();state={...defaults,...(payload.payload||{})};if(window.BEPOffline){window.BEPOffline.markKnownUser(d.user.id||d.user.email);window.BEPOffline.setBaseline(payload.payload||{})}await persistMigratedIncomeState();window.dispatchEvent(new Event("bep:auth-ready"));gate.hidden=true;tab(getSavedTab())}}else gate.hidden=false}catch(e){if(window.BEPOffline&&window.BEPOffline.hasKnownUser()){window.bepSignedIn=false;window.bepOfflineMode=true;gate.hidden=true;tab(getSavedTab());notify("Mode hors ligne : tes données locales restent accessibles. Les changements seront synchronisés après reconnexion et vérification du compte.");window.dispatchEvent(new Event("bep:auth-ready"));}else{gate.hidden=false;authMessage.textContent="Connexion au serveur impossible. Connecte-toi une première fois avec Internet pour activer le mode hors ligne."}}render();const startupLoader=document.getElementById("bepStartupLoader");if(startupLoader)startupLoader.hidden=true;})();

setupInlineVoice();setupPlaceSuggestions();setupPurchaseNatureSuggestions();if($("purchaseNotes"))$("purchaseNotes").addEventListener("input",()=>{const n=$("purchaseNotes").value.toLowerCase();if(/chauss|basket|sneaker|vêtement|textile|tenue/.test(n))$("purchaseCategory").value="Mode";else if(/ballon|raquette|fitness|équipement sportif/.test(n))$("purchaseCategory").value="Loisirs"});render();// Service worker disabled: always load the current published app and assets.
})();