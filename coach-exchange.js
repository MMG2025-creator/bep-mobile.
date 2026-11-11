(()=>{"use strict";
const API="https://bep-v2-api.onrender.com",DB="bep-mobile-v1",$=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Math.round((Number(n)||0)*100)/100;
const readState=()=>{try{return JSON.parse(localStorage.getItem(DB)||"{}")}catch{return {}}};
const providerNames={chatgpt:"ChatGPT",gemini:"Gemini",claude:"Claude",mistral:"Mistral",other:"IA externe"};
function buildPrompt(provider){
const name=providerNames[provider]||"IA externe";
return `MISSION BEP — CONSEILLER FINANCIER PERSONNEL — EXÉCUTION EN UNE SEULE PASSE

RÔLE
Tu es le conseiller financier personnel de l'utilisateur, spécialisé en finances personnelles, diagnostic budgétaire, maîtrise des dépenses, épargne, dettes et coaching comportemental. Tu es ferme, précis, exigeant, factuel et orienté résultats. Tu ne cherches pas à flatter : tu nommes clairement les déséquilibres et les risques, sans jugement moral. Tu proposes des actions réalistes, hiérarchisées et mesurables. Tu ne prétends pas être un professionnel réglementé et ne fournis pas de conseils d'investissement, juridiques ou fiscaux personnalisés engageants.

MISSION
Analyse intégralement le fichier « bep-bilan-ia-v1.json », réalise le diagnostic financier et comportemental permis par les données, produis les recommandations et connaissances de coaching, puis génère immédiatement le fichier JSON final importable dans BEP.

EXÉCUTION EN UNE SEULE PASSE
- Ne pose aucune question et ne demande aucune validation intermédiaire.
- N'engage pas de dialogue exploratoire. Ne présente pas un plan à faire valider.
- N'affiche pas ton raisonnement interne détaillé ; effectue les contrôles puis livre les résultats.
- Si une donnée manque, signale précisément cette limite et poursuis avec les informations vérifiables.
- Termine obligatoirement par la création du fichier JSON téléchargeable. Ne demande jamais si l'utilisateur souhaite le fichier.

PROCÉDURE
1. Vérifie le schéma, la version, la devise, la période et la cohérence des champs et montants.
2. Identifie le périmètre réel (cumulatif ou périodique), les données disponibles et les absences. Ne compare pas des périodes incompatibles.
3. Analyse revenus, budgets, achats/dépenses, catégories, objectifs, épargne et dettes uniquement lorsque les données existent et sont comparables.
4. Identifie incohérences, concentrations, dépassements possibles, fragilités et angles morts. Distingue fait, signal à vérifier et hypothèse.
5. N'invente aucune habitude, charge récurrente, dette ou caractéristique psychologique.
6. Propose des actions concrètes. Chaque recommandation précise le constat, sa preuve, l'action et le résultat attendu. Ne chiffre une économie que si le calcul est fondé.
7. Crée des connaissances de coaching réutilisables, prudentes et contextualisées.
8. Contrôle le JSON final : syntaxe, champs, catégories, priorités, confiance, identifiants uniques, limites de taille et absence de données financières modifiées.

RÈGLES FINANCIÈRES ABSOLUES
- Le fichier source est l'unique vérité financière ; ses montants sont immuables.
- N'invente, ne complète et ne corrige aucun revenu, achat, dépense, solde, dette, échéance ou objectif.
- Ne déduis pas un revenu mensuel d'un total cumulatif.
- Ne considère pas un achat comme une charge mensuelle.
- Ne calcule pas de reste à vivre si les périodes ou natures de données ne sont pas comparables.
- Expose les contradictions sans choisir arbitrairement.
- Le retour ne doit contenir aucune copie modifiée du bilan financier.

CONTRAT DE SORTIE STRICT — JSON BEP V1
Génère un objet JSON unique conforme à cette structure :
{
  "schema": "bep-coach-exchange",
  "schema_version": 1,
  "source": "external_ai",
  "provider": "__PROVIDER__",
  "model": "nom exact du modèle utilisé ou non communiqué",
  "financial_analysis": {
    "summary": "diagnostic synthétique en français",
    "observations": ["constat factuel ou limite clairement formulée"]
  },
  "recommendations": [
    {
      "id": "identifiant unique",
      "category": "budget|spending|savings|debt|behavior|other",
      "title": "titre court",
      "detail": "constat, preuve, explication et résultat attendu",
      "priority": "low|medium|high",
      "confidence": "low|medium|high",
      "evidence": ["preuve issue du fichier source"],
      "action": "prochaine action concrète et vérifiable",
      "valid_until": null
    }
  ],
  "knowledge_updates": [
    {
      "id": "identifiant unique",
      "category": "budget|spending|savings|behavior|general",
      "title": "principe réutilisable",
      "content": "contenu prudent et actionnable",
      "confidence": "low|medium|high",
      "evidence": ["élément qui justifie cette connaissance"]
    }
  ]
}

CONTRAINTES
- Respecte exactement les noms et types des champs ci-dessus.
- « evidence » est toujours un tableau de chaînes.
- « valid_until » est une date YYYY-MM-DD valide ou null.
- Les tableaux recommendations et knowledge_updates peuvent être vides si aucun élément n'est suffisamment fondé.
- Maximum 50 recommandations et 50 connaissances.
- N'ajoute aucune autre clé racine, donnée personnelle, donnée financière réécrite ou instruction exécutable.
- Le fichier doit être directement accepté par l'import BEP v1.

LIVRABLE IMPÉRATIF
Crée maintenant une pièce jointe nommée « bep-coach-retour-v1.json » contenant le JSON complet. Utilise la fonction de création de fichier de ton interface si disponible. Sinon, affiche le JSON brut complet dans un unique bloc de code JSON, sans le tronquer, pour qu'il puisse être enregistré sous ce nom. Vérifie sa validité et les champs obligatoires avant de le livrer. Réponds ensuite par une confirmation brève et le fichier (ou le JSON de remplacement).`.replace("__PROVIDER__",name);
}

function snapshot(){const s=readState(),incomes=Array.isArray(s.incomes)?s.incomes:[],budgets=Array.isArray(s.budgets)?s.budgets:[],expenses=Array.isArray(s.expenses)?s.expenses:[],goals=Array.isArray(s.goals)?s.goals:[],transactions=Array.isArray(s.transactions)?s.transactions:[];
const income=incomes.reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0)||Math.max(0,Number(s.income)||0),totalBudget=budgets.reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0),totalExpenses=expenses.reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0),cats={};
const allowed=["Alimentation","Logement","Transport","Santé","Loisirs","Mode","Abonnements","Autre"];
for(const x of expenses){const raw=String(x.category||x.type||"Autre"),c=allowed.find(v=>v.toLowerCase()===raw.toLowerCase())||"Autre";cats[c]=(cats[c]||0)+Math.max(0,Number(x.amount)||0)}
return {period:"cumulative_app_snapshot",currency:"EUR",income_total:money(income),budget_envelope_count:budgets.length,budget_total:money(totalBudget),purchase_total:money(totalExpenses),purchase_count:expenses.length,purchases_by_category:Object.entries(cats).map(([category,amount])=>({category,amount:money(amount)})),goal_count:goals.length,goals_target_total:money(goals.reduce((a,x)=>a+Math.max(0,Number(x.target||x.amount)||0),0)),goals_saved_total:money(goals.reduce((a,x)=>a+Math.max(0,Number(x.saved||x.current)||0),0)),transaction_count:transactions.length,transaction_period_count:transactions.slice(-200).length}}
function mount(){const host=document.querySelector("#coach .ai-connection-card");if(!host||$("bepExternalExchange"))return;
const section=document.createElement("section");section.id="bepExternalExchange";section.className="bep-exchange card";
section.innerHTML='<div class="card-head"><div><p class="eyebrow">ÉCHANGE MULTI-IA</p><h2>Analyser avec une IA externe</h2></div><span class="tag">Fichier BEP v1</span></div><p class="hint">Exporte le bilan et le prompt expert correspondant au fournisseur choisi. Dans l’IA externe, joins les deux fichiers puis lance une seule fois la mission : l’IA doit générer le fichier JSON de retour BEP. Ces fichiers sont lisibles et peuvent contenir des montants ; ils ne sont pas la sauvegarde chiffrée BEP.</p><div class="field"><label for="bepExchangeProvider">IA utilisée</label><select id="bepExchangeProvider"><option value="chatgpt">ChatGPT</option><option value="gemini">Gemini</option><option value="claude">Claude</option><option value="mistral">Mistral</option><option value="other">Autre IA</option></select></div><p class="hint"><strong>Anonymisation activée par défaut :</strong> aucun nom, e-mail, identifiant, libellé libre, enseigne ou détail de transaction n’est exporté. Les dépenses sont agrégées par grandes catégories.</p><div class="bep-exchange-actions"><button type="button" class="primary" id="bepExportAnalysis">Exporter bilan + prompt expert</button><button type="button" class="secondary" id="bepExportPrompt">Télécharger le prompt seul</button></div><div class="divider"></div><h3>Réimporter une analyse externe</h3><p class="hint">Fichier JSON BEP v1 uniquement. Les données financières contenues dans le fichier seront ignorées. Les éléments importés sont enregistrés séparément et restent en attente de validation avant toute utilisation par le Coach local.</p><div class="field"><label for="bepImportAnalysis">Fichier JSON BEP</label><input type="file" id="bepImportAnalysis" accept=".json,application/json"></div><div id="bepImportPreview" class="bep-import-preview" aria-live="polite"></div><div id="bepKnowledgeStatus" class="hint" role="status"></div><div class="divider"></div><div class="bep-knowledge-head"><h3>Ma bibliothèque de coaching (à valider)</h3><button type="button" class="secondary" id="bepRefreshKnowledge">Actualiser</button></div><div id="bepKnowledgeList" class="bep-knowledge-list"><p class="hint">Chargement…</p></div>';
host.insertAdjacentElement("afterend",section);
$("bepExportAnalysis").addEventListener("click",exportAnalysis);$("bepExportPrompt").addEventListener("click",exportPrompt);$("bepImportAnalysis").addEventListener("change",previewImport);$("bepRefreshKnowledge").addEventListener("click",loadKnowledge);loadKnowledge()}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportAnalysis(){const provider=$("bepExchangeProvider").value,doc={schema:"bep-coach-exchange",schema_version:1,generated_at:new Date().toISOString(),source:"bep_app",privacy:{anonymized:true,contains_direct_identifiers:false},financial_snapshot:snapshot(),analysis_contract:{immutable_financial_facts:true,do_not_invent_amounts:true,do_not_return_modified_financial_data:true,allowed_outputs:["financial_analysis","recommendations","knowledge_updates"],required_output_fields:{schema:"bep-coach-exchange",schema_version:1,source:"external_ai",provider:"provider_id",model:"model_name",financial_analysis:{summary:"string",observations:["string"]},recommendations:[{id:"unique-string",category:"budget|spending|savings|debt|behavior|other",title:"string",detail:"string",priority:"low|medium|high",confidence:"low|medium|high",evidence:["string"],action:"string",valid_until:"YYYY-MM-DD or null"}],knowledge_updates:[{id:"unique-string",category:"budget|spending|savings|behavior|general",title:"string",content:"string",confidence:"low|medium|high",evidence:["string"]}]}}};download("bep-bilan-ia-v1.json",JSON.stringify(doc,null,2),"application/json");download("bep-prompt-conseiller-financier-"+provider+".txt",buildPrompt(provider),"text/plain;charset=utf-8");$("bepKnowledgeStatus").textContent="Bilan et prompt expert exportés. Dépose les deux fichiers dans l’IA choisie et demande une exécution unique. La sauvegarde .bep chiffrée reste distincte."}
function exportPrompt(){const provider=$("bepExchangeProvider").value;download("bep-prompt-conseiller-financier-"+provider+".txt",buildPrompt(provider),"text/plain;charset=utf-8")}

let pending=[];
async function previewImport(ev){pending=[];const file=ev.target.files?.[0],box=$("bepImportPreview");if(!file){box.innerHTML="";return}if(file.size>1048576){box.textContent="Fichier trop volumineux (maximum 1 Mo).";return}
try{const raw=JSON.parse(await file.text());if(raw.schema!=="bep-coach-exchange"||raw.schema_version!==1||raw.source!=="external_ai")throw Error("Format BEP externe non reconnu ou version incompatible.");
const recs=Array.isArray(raw.recommendations)?raw.recommendations.slice(0,50):[],updates=Array.isArray(raw.knowledge_updates)?raw.knowledge_updates.slice(0,50):[];
const clean=(v,max)=>typeof v==="string"?v.trim().slice(0,max):"",evidence=v=>Array.isArray(v)?v.slice(0,8).map(x=>clean(x,300)).filter(Boolean):[];
pending=[...recs.map((x,i)=>({kind:"recommendation",id:clean(x.id,80)||"rec-"+i,category:["budget","spending","savings","debt","behavior","other"].includes(x.category)?x.category:"other",title:clean(x.title,120),detail:clean(x.detail,1500),priority:["low","medium","high"].includes(x.priority)?x.priority:"medium",confidence:["low","medium","high"].includes(x.confidence)?x.confidence:"low",evidence:evidence(x.evidence),action:clean(x.action,500),valid_until:/^\d{4}-\d{2}-\d{2}$/.test(x.valid_until||"")?x.valid_until:null})),...updates.map((x,i)=>({kind:"knowledge",id:clean(x.id,80)||"know-"+i,category:["budget","spending","savings","behavior","general"].includes(x.category)?x.category:"general",title:clean(x.title,120),detail:clean(x.content,1500),priority:"low",confidence:["low","medium","high"].includes(x.confidence)?x.confidence:"low",evidence:evidence(x.evidence),action:"",valid_until:null}))].filter(x=>x.title&&x.detail);
if(!pending.length)throw Error("Aucune recommandation ou connaissance exploitable dans le fichier.");
box.innerHTML="<p><strong>"+pending.length+" élément(s) détecté(s)</strong> — "+recs.length+" recommandation(s), "+updates.length+" connaissance(s).</p><p class='hint'>Aucune donnée financière importée ne sera prise en compte.</p>"+pending.map((x,i)=>'<label class="bep-import-item"><input type="checkbox" data-bep-item="'+i+'" checked><span><strong>'+esc(x.title)+'</strong><small>'+esc(x.kind==="recommendation"?"Recommandation":"Connaissance")+' · '+esc(x.category)+' · confiance '+esc(x.confidence)+'</small><span>'+esc(x.detail.slice(0,260))+'</span></span></label>').join("")+'<button type="button" class="primary full" id="bepConfirmImport">Enregistrer les éléments sélectionnés</button>';
$("bepConfirmImport").addEventListener("click",confirmImport)
}catch(e){box.textContent=e.message||"Impossible de lire ce fichier.";pending=[]}}
async function confirmImport(){const selected=[...document.querySelectorAll("[data-bep-item]:checked")].map(el=>pending[Number(el.dataset.bepItem)]).filter(Boolean);if(!selected.length){$("bepKnowledgeStatus").textContent="Sélectionne au moins un élément.";return}
const button=$("bepConfirmImport");button.disabled=true;try{const response=await fetch(API+"/api/coach/knowledge",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({source_provider:$("bepExchangeProvider").value,items:selected})}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.message||"Enregistrement impossible.");$("bepKnowledgeStatus").textContent=selected.length+" élément(s) enregistré(s) dans ta base de coaching. Les chiffres financiers n'ont pas été modifiés.";pending=[];$("bepImportPreview").innerHTML="";$("bepImportAnalysis").value="";await loadKnowledge()}catch(e){$("bepKnowledgeStatus").textContent=e.message||"Erreur d'enregistrement."}finally{button.disabled=false}}
async function loadKnowledge(){const list=$("bepKnowledgeList");if(!list)return;try{const r=await fetch(API+"/api/coach/knowledge",{credentials:"include",cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.message||"Chargement indisponible.");if(!d.items?.length){list.innerHTML='<p class="hint">Aucune recommandation importée pour le moment.</p>';return}list.innerHTML=d.items.map(x=>'<article class="bep-knowledge-item"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.kind)+' · '+esc(x.category)+' · '+esc(x.confidence)+' · '+esc(x.status)+'</small></div><p>'+esc(x.detail)+'</p>'+(x.evidence?.length?'<small>Éléments justificatifs : '+esc(x.evidence.join(" · "))+'</small>':"")+'</article>').join("")}catch(e){list.innerHTML='<p class="hint">'+esc(e.message||"Base de coaching indisponible.")+'</p>'}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();