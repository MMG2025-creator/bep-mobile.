(()=>{"use strict";
const $=id=>document.getElementById(id), euro=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const KEY="bep-spend-challenges-v1",SELECT_KEY="bep-spend-selected-challenges-v1";
const challenges=[
{id:"pause",icon:"⏳",title:"Le défi des 24 heures",desc:"Attends demain avant de valider un achat non essentiel.",done:"Pause validée : tu as laissé le temps décider avec toi."},
{id:"subscriptions",icon:"🕵️",title:"Le détective des abonnements",desc:"Retrouve un abonnement oublié ou devenu inutile.",done:"Enquête bouclée : ton compte bancaire respire."},
{id:"pleasure",icon:"🎈",title:"Le plaisir sans culpabilité",desc:"Choisis un petit plaisir prévu dans ton budget.",done:"Plaisir assumé et budget respecté : combo gagnant."},
{id:"basket",icon:"🛒",title:"Le panier allégé",desc:"Retire un article dont tu peux vraiment te passer.",done:"Un article en moins, de la marge en plus."},
{id:"coffee",icon:"☕",title:"Le café fait maison",desc:"Prépare ton café à la maison au lieu de l'acheter une fois.",done:"Barista du jour : économie réalisée."},
{id:"no-spend",icon:"🧘",title:"La journée sans achat",desc:"Passe une journée sans achat non prévu.",done:"Journée sans achat : tu viens de battre ton panier."},
{id:"fridge",icon:"🥕",title:"Opération fond du frigo",desc:"Compose un repas avec ce que tu as déjà.",done:"Mission anti-gaspi réussie : le frigo te remercie."},
{id:"compare",icon:"🔍",title:"Le comparateur malin",desc:"Compare deux offres avant ton prochain achat.",done:"Tu as comparé avant de cliquer : réflexe de pro."},
{id:"cashback",icon:"🪙",title:"La chasse aux frais cachés",desc:"Vérifie les frais ou options ajoutés à une commande.",done:"Aucun frais surprise ne t'a échappé."},
{id:"wishlist",icon:"⭐",title:"La liste des envies",desc:"Ajoute une envie à une liste plutôt que de l'acheter tout de suite.",done:"Envie mise en attente : tu gardes le choix."},
{id:"secondhand",icon:"♻️",title:"La seconde vie",desc:"Cherche une option d'occasion avant un achat non urgent.",done:"Seconde main explorée : malin et plus durable."},
{id:"unfollow",icon:"📵",title:"Stop au pousse-à-l'achat",desc:"Désactive une notification commerciale ou une newsletter promo.",done:"Une tentation en moins dans ta journée."},
{id:"mealplan",icon:"🍲",title:"Le menu anti-impro",desc:"Prévois deux repas pour éviter une commande improvisée.",done:"Deux repas anticipés : ton budget te dit merci."},
{id:"cash",icon:"💶",title:"Le défi des petites pièces",desc:"Mets de côté une petite somme que tu aurais dépensée par réflexe.",done:"Petite somme épargnée, grande satisfaction."},
{id:"repair",icon:"🧰",title:"Réparer plutôt que remplacer",desc:"Répare, nettoie ou fais durer un objet avant de le remplacer.",done:"Objet sauvé : ton portefeuille aussi."},
{id:"library",icon:"📚",title:"Emprunter, c'est gagner",desc:"Emprunte ou échange un livre, un jeu ou un outil.",done:"Échange gagnant : usage sans nouvel achat."},
{id:"walk",icon:"🚶",title:"La balade plutôt que le panier",desc:"Remplace une sortie shopping automatique par une balade.",done:"Tu as choisi l'air frais plutôt que le panier."},
{id:"price-alert",icon:"🔔",title:"Le radar à bonnes affaires",desc:"Mets une alerte de prix au lieu d'acheter au premier clic.",done:"Tu laisses le prix venir à toi : bien joué."},
{id:"declutter",icon:"🧺",title:"Le vide-poche rentable",desc:"Repère un objet à vendre ou donner plutôt que d'en acheter un neuf.",done:"Un objet retrouve une utilité, et toi de l'espace."},
{id:"weekly-review",icon:"📅",title:"Le mini-bilan du dimanche",desc:"Prends cinq minutes pour regarder tes dépenses de la semaine.",done:"Bilan express terminé : tu sais où tu vas."}
];
let done={};try{done=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch{}
const defaultSelected=["pause","subscriptions","pleasure","basket"];let selected=defaultSelected;try{const saved=JSON.parse(localStorage.getItem(SELECT_KEY)||"null");if(Array.isArray(saved))selected=saved.filter(id=>challenges.some(c=>c.id===id))}catch{}
function readState(){try{return JSON.parse(localStorage.getItem("bep-mobile-v1")||"{}")}catch{return {}}}
function monthlyStats(){const s=readState(),now=new Date(),items=(Array.isArray(s.expenses)?s.expenses:[]).filter(p=>{const d=new Date(p.at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});const total=items.reduce((n,p)=>n+Math.max(0,Number(p.amount)||0),0),impulsive=items.filter(p=>p.psychology==="impulsive"||p.psychology==="pressure").length;const categories={};items.forEach(p=>{const k=p.category||"Autre";categories[k]=(categories[k]||0)+Math.max(0,Number(p.amount)||0)});return {items,total,impulsive,categories}}
function setTab(tab){const panel=$("purchases");if(!panel)return;panel.querySelectorAll("[data-spend-tab]").forEach(b=>{const active=b.dataset.spendTab===tab;b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1;});panel.querySelectorAll(":scope > [data-spend-view]").forEach(v=>{v.hidden=v.dataset.spendView!==tab;});}
function currentBudgetState(){
 const s=readState(),position=window.BEPFinancialEngine.calculate({incomes:s.incomes,legacyIncome:s.income,budgets:s.budgets,goals:s.goals,expenses:s.expenses}),amount=Math.max(0,Number($("purchaseAmount")?.value)||0);
 return {known:position.income>0,available:position.available,amount,exceeds:position.income>0&&amount>position.available};
}
function currentScore(){const psychology=$("psychology")?.value||"reflective",need=$("need")?.value||"yes",delay=$("delay")?.value||"now",budget=currentBudgetState();let score=45;score+=psychology==="reflective"?20:psychology==="spontaneous"?8:psychology==="impulsive"?-12:-20;score+=need==="yes"?20:need==="uncertain"?8:-5;score+=delay==="24h"?15:delay==="7d"?18:delay==="already_done"?5:0;if(budget.known&&budget.amount>0){const ratio=budget.available>0?budget.amount/budget.available:2;score+=ratio<=.05?15:ratio<=.15?8:ratio<=.3?0:-12;if(budget.exceeds)score=Math.min(score,35)}else score+=5;return Math.max(0,Math.min(100,Math.round(score)))}
function scoreCopy(score){if(score>=85)return ["Décision au top !","Ton achat semble cohérent. Garde simplement un œil sur ton enveloppe."];if(score>=70)return ["Bonne réflexion !","Quelques vérifications et tu peux décider sereinement."];if(score>=50)return ["Prends encore un instant.","Un petit recul peut t'aider à distinguer envie, besoin et budget."];return ["Attention au craquage !","La meilleure décision, pour l'instant, est peut-être de ralentir."]}
function updateScore(){const score=currentScore(),budget=currentBudgetState(),ring=$("bepSpendScoreRing"),number=$("bepSpendScoreNumber"),title=$("bepSpendScoreTitle"),desc=$("bepSpendScoreDesc"),bar=$("bepSpendScoreBar");if(!ring)return;const copy=budget.exceeds?["Hors budget : vigilance !",budget.available<0?"Ton montant restant disponible est déjà négatif ("+euro(budget.available)+"). Cet achat aggraverait le dépassement. Tu peux l'enregistrer, mais sois vigilant.":"Cet achat dépasse ton montant restant disponible de "+euro(budget.amount-budget.available)+". Il est hors budget. Tu peux l'enregistrer, mais sois vigilant."]:scoreCopy(score);ring.style.setProperty("--score",score);number.textContent=String(score);title.textContent=copy[0];desc.textContent=copy[1];bar.style.width=score+"%"}
function updateHero(){const stats=monthlyStats();const amount=$("bepSpendMonthTotal"),count=$("bepSpendMonthCount"),decisions=$("bepSpendMonthDecisions");if(amount)amount.textContent=euro(stats.total);if(count)count.textContent=stats.items.length+" achat"+(stats.items.length>1?"s":"");if(decisions)decisions.textContent=stats.impulsive+" achat"+(stats.impulsive>1?"s":"")+" sous impulsion"}
function renderChallenges(){
const host=$("bepSpendChallengeGrid");if(!host)return;
const chosen=challenges.filter(c=>selected.includes(c.id));
const completed=chosen.filter(c=>done[c.id]).length;
const status=$("bepSpendChallengeStatus");
if(status)status.textContent=selected.length?completed+" / "+selected.length+" défis choisis relevés. À toi de jouer !":"Choisis quelques défis pour commencer. Tu peux changer ta sélection quand tu veux.";
const chooser='<details class="bep-spend-challenge-picker"><summary><span>＋ Choisir les défis que je veux relever</span><small>'+selected.length+' sélectionné'+(selected.length>1?'s':'')+' · '+challenges.length+' idées</small></summary><div class="bep-spend-challenge-options"><p>Pioche ceux qui te plaisent. Tu peux en choisir autant que tu veux.</p>'+challenges.map(c=>'<label class="bep-spend-challenge-option"><input type="checkbox" data-challenge-select="'+c.id+'" '+(selected.includes(c.id)?'checked':'')+'><span>'+c.icon+' '+c.title+'</span></label>').join("")+'</div></details>';
const cards=chosen.map(c=>'<article class="bep-spend-challenge '+(done[c.id]?"is-done":"")+'"><span class="bep-spend-challenge-icon" aria-hidden="true">'+c.icon+'</span><b>'+c.title+'</b><p>'+c.desc+'</p><button type="button" data-spend-challenge="'+c.id+'" aria-pressed="'+Boolean(done[c.id])+'">'+(done[c.id]?"Défi validé ✓":"Je relève le défi")+'</button>'+(done[c.id]?'<small class="bep-spend-challenge-done">'+c.done+'</small>':'')+'</article>').join("");
host.innerHTML=chooser+(cards?'<div class="bep-spend-challenge-grid-inner">'+cards+'</div>':'<div class="bep-spend-empty">Aucun défi sélectionné pour le moment. Ouvre le menu ci-dessus et compose ta propre liste !</div>');
host.querySelectorAll("[data-challenge-select]").forEach(input=>input.addEventListener("change",()=>{const id=input.dataset.challengeSelect;selected=input.checked?[...selected,id]:selected.filter(x=>x!==id);try{localStorage.setItem(SELECT_KEY,JSON.stringify(selected))}catch{}renderChallenges()}));
host.querySelectorAll("[data-spend-challenge]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.spendChallenge;done[id]=!done[id];try{localStorage.setItem(KEY,JSON.stringify(done))}catch{}renderChallenges()}));
}
function renderBalance(){const stats=monthlyStats(),avg=stats.items.length?stats.total/stats.items.length:0,rate=stats.items.length?Math.round(stats.impulsive/stats.items.length*100):0;const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};set("bepSpendBalanceTotal",euro(stats.total));set("bepSpendBalanceCount",String(stats.items.length));set("bepSpendBalanceAverage",euro(avg));set("bepSpendBalanceImpulse",rate+" %");const host=$("bepSpendCategoryList");if(host){const rows=Object.entries(stats.categories).sort((a,b)=>b[1]-a[1]).slice(0,5);host.innerHTML=rows.length?rows.map(([name,value])=>'<div class="bep-spend-category-row"><span>'+name.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</span><b>'+euro(value)+'</b></div>').join(""):'<div class="bep-spend-empty">Tes premières dépenses apparaîtront ici. Enregistre un achat pour commencer ton bilan.</div>'}}
function init(){
 mountFinancialEntryDialogs();
 mountFinancialConfirmDialog();
 const panel=$("purchases"),entry=panel?.querySelector(".purchase-entry-card"),history=$("purchaseRows")?.closest("article.card");
 if(!panel||!entry||$("bepPurchaseDialog"))return;
 const trigger=document.createElement("button");
 trigger.type="button";
 trigger.id="bepOpenPurchase";
 trigger.className="primary full bep-purchases-trigger";
 trigger.textContent="Mes achats";
 trigger.setAttribute("aria-haspopup","dialog");
 trigger.setAttribute("aria-controls","bepPurchaseDialog");
 panel.appendChild(trigger);
 if(history)history.hidden=true;
 const dialog=document.createElement("dialog");
 dialog.id="bepPurchaseDialog";
 dialog.className="bep-quick-expense-dialog bep-purchase-dialog";
 dialog.setAttribute("aria-labelledby","bepPurchaseDialogTitle");
 dialog.innerHTML='<div class="bep-quick-expense-panel"><header class="bep-quick-expense-head"><div><p class="eyebrow">MES ACHATS</p><h2 id="bepPurchaseDialogTitle">Enregistrer un achat</h2><p>Renseigne les informations de ton achat.</p></div><button type="button" class="bep-quick-expense-close" aria-label="Fermer">×</button></header><div class="bep-quick-expense-body"></div></div>';
 panel.appendChild(dialog);
 const body=dialog.querySelector(".bep-quick-expense-body");
 body.appendChild(entry);
 const heading=entry.querySelector("h2");
 if(heading)heading.textContent="Détails de mon achat";
 const open=()=>{
  if(dialog.open)return;
  $("purchaseSubmit")?.classList.remove("hidden");
  $("purchaseNew")?.classList.add("hidden");
  dialog.showModal();
  setTimeout(()=>$("merchant")?.focus(),80);
 };
 const close=()=>{if(dialog.open)dialog.close()};
 trigger.addEventListener("click",open);
 dialog.querySelector(".bep-quick-expense-close").addEventListener("click",close);
 dialog.addEventListener("click",event=>{if(event.target===dialog)close()});
 dialog.addEventListener("close",()=>trigger.focus());
 window.addEventListener("bep:expense-saved",close);
 window.BEP_OPEN_PURCHASE_DIALOG=open;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();