"use strict";
// Génère une base temporaire JSON : aucune connexion réseau ou base SQL.
const fs = require("node:fs");
const path = require("node:path");

let state = 20261114;
const random = () => ((state = (state * 48271) % 2147483647) - 1) / 2147483646;
const between = (min, max) => min + random() * (max - min);
const money = n => Math.round(n * 100) / 100;
const pick = xs => xs[Math.floor(random() * xs.length)];
const months = ["2026-09-01", "2026-10-01", "2026-11-01"];
const profileSpecs = [
  ["SIM-001","Camille D.","Employée administrative",1500,1,520],
  ["SIM-002","Yanis R.","Agent de logistique",1850,2,640],
  ["SIM-003","Sarah L.","Aide-soignante",2200,1,690],
  ["SIM-004","Thomas B.","Technicien de maintenance",2750,2,790],
  ["SIM-005","Nadia K.","Assistante commerciale",3300,2,880],
  ["SIM-006","Julien P.","Enseignant",3900,1,980],
  ["SIM-007","Élodie M.","Infirmière coordinatrice",4600,2,1120],
  ["SIM-008","Karim A.","Cadre informatique",5400,2,1320],
  ["SIM-009","Claire V.","Responsable RH",6600,3,1580],
  ["SIM-010","Antoine G.","Directeur commercial",8000,2,1850]
];
const fixedNames = ["Énergie","Eau","Télécoms","Assurances","Transport","Enfants","Santé","Engagements"];
const scenarios = [
 ["budget","Mon budget part dans tous les sens. Peux-tu m'aider à reprendre la main ?","On repart des chiffres sans jugement. Le loyer et les charges fixes sont prioritaires, puis on distingue les dépenses variables et l'épargne réellement disponible.",["prise_de_conscience","besoin_de_structure"]],
 ["spending","J'ai eu plusieurs dépenses imprévues et je culpabilise.","Une dépense imprévue n'est pas un échec. Vérifions son montant et ce qu'il reste jusqu'à la fin du mois avant d'ajuster les postes flexibles.",["culpabilite","depense_imprevue"]],
 ["savings","Je n'ai pas atteint mon objectif d'épargne ce mois-ci.","L'objectif est un repère, pas une obligation. Comparons le montant prévu au montant réellement mis de côté et tenons compte des contraintes du mois.",["deception","objectif_epargne"]],
 ["planning","Les dépenses liées aux enfants augmentent et je ne les avais pas anticipées.","Créons une enveloppe dédiée aux enfants et vérifions que le budget conserve une marge de sécurité.",["charge_familiale","anticipation"]],
 ["behavior","J'ai fait un achat impulsif alors que je voulais faire attention.","Repérons le déclencheur sans jugement. Une pause de 24 heures et la vérification du disponible peuvent aider avant un achat non essentiel.",["achat_impulsif","auto_observation"]],
 ["budget","La fin du mois risque d'être compliquée avec les prélèvements qui arrivent.","Hiérarchisons les échéances essentielles, puis calculons le disponible. Ne programme pas d'épargne qui ferait passer le compte sous son seuil de sécurité.",["anticipation_tension","risque_tresorerie"]],
 ["savings","Je veux augmenter mon épargne sans me retrouver à découvert.","La priorité est un budget soutenable. N'augmente l'épargne que si les dépenses essentielles et une marge de sécurité sont couvertes.",["motivation","prudence"]],
 ["spending","J'ai dépassé mon enveloppe sorties et loisirs.","Regardons le dépassement et les jours restants. Réallouons si possible une enveloppe non utilisée, sans supprimer une dépense essentielle.",["depassement","arbitrage"]],
 ["learning","Pourquoi mon taux d'épargne est-il bas alors que je gagne correctement ma vie ?","Le revenu ne suffit pas à expliquer la capacité d'épargne : loyer, composition du foyer et dépenses irrégulières comptent aussi.",["incomprehension","besoin_pedagogie"]],
 ["debt","J'ai peur de ne pas réussir à payer toutes mes charges ce mois-ci.","Hiérarchisons les échéances et identifions les postes à risque. Si une échéance essentielle est menacée, contacte le créancier avant la date prévue.",["anxiete_financiere","risque_impaye"]]
];

function buildCorpus() {
  const profiles = [], monthlySnapshots = [], conversations = [];
  for (const [id, displayName, csp, income, children, rent] of profileSpecs) {
    const fixedCharges = fixedNames.map((category, i) => ({
      id: category.toLowerCase(), category,
      amount: money([between(35,95),between(12,35),between(35,65),between(45,100),between(35,110),between(45,110)*children,between(25,85),between(0,120)][i])
    }));
    const profile = {
      id, displayName, socioProfessionalCategory:csp, monthlyIncomeEUR:income,
      household:{housingStatus:"tenant",children,householdType:"family_with_children"},
      fixedCharges:[{id:"rent",category:"housing",amountEUR:rent},...fixedCharges.map(x=>({...x,amountEUR:x.amount}))],
      savingsTargetRatePct:Math.round(between(10,20)*10)/10,
      synthetic:true
    };
    profiles.push(profile);
    const fixedTotal = fixedCharges.reduce((sum,x)=>sum+x.amount,0);
    months.forEach((monthKey, monthIndex) => {
      const variable = money(income*between(.12,.25)+children*between(55,105));
      const planned = money(Math.max(30,(income-rent-fixedTotal-variable)*profile.savingsTargetRatePct/100));
      const attainment = Math.round(between(10,90)*10)/10;
      const actual = money(planned*attainment/100);
      const monthStatus = income < rent+fixedTotal+variable ? "overspend" : attainment < 30 ? "under_pressure" : attainment < 55 ? "recovery" : "on_track";
      const events = [
        {type:pick(["school_expense","transport","health","home"]),amountEUR:money(between(25,180)),synthetic:true},
        {type:pick(["unexpected_bill","family_activity","car_repair","annual_payment"]),amountEUR:money(between(30,220)),synthetic:true}
      ];
      const snapshot = {id:id+"-"+monthKey,profileId:id,monthKey,incomeEUR:income,rentEUR:rent,fixedChargesTotalEUR:money(fixedTotal),variableExpensesEUR:variable,plannedSavingsEUR:planned,actualSavingsEUR:actual,savingsAttainmentPct:attainment,monthStatus,events,synthetic:true};
      monthlySnapshots.push(snapshot);
      for(let seq=1;seq<=4;seq++) {
        const [intent,userMessage,coachResponse,signals] = pick(scenarios);
        const day = 2+seq*6+Math.floor(random()*3);
        const occurredAt = new Date(Date.UTC(2026,8+monthIndex,day,9+Math.floor(random()*10),Math.floor(random()*60))).toISOString();
        conversations.push({
          id:id+"-"+monthKey.slice(0,7)+"-"+String(seq).padStart(2,"0"),profileId:id,monthKey,sequence:seq,occurredAt,
          userMessage,coachResponse,intent,behavioralSignals:signals,
          financialContext:{incomeEUR:income,rentEUR:rent,fixedChargesTotalEUR:money(fixedTotal),variableExpensesEUR:variable,plannedSavingsEUR:planned,actualSavingsEUR:actual,savingsAttainmentPct:attainment,children},
          synthetic:true
        });
      }
    });
  }
  const corpus = {
    schemaVersion:"1.0.0",generatedAt:new Date().toISOString(),seed:20261114,
    description:"Base temporaire locale de simulation BEP. Données fictives uniquement; aucune connexion à PostgreSQL ou à un service externe.",
    tables:{
      profiles:{primaryKey:"id",records:profiles},
      monthlySnapshots:{primaryKey:["profileId","monthKey"],records:monthlySnapshots},
      conversations:{primaryKey:"id",foreignKeys:{profileId:"profiles.id",monthKey:"monthlySnapshots.monthKey"},records:conversations}
    }
  };
  validateCorpus(corpus);
  return corpus;
}
function validateCorpus(corpus) {
  const {profiles,monthlySnapshots,conversations}=Object.fromEntries(Object.entries(corpus.tables).map(([k,v])=>[k,v.records]));
  if(profiles.length!==10||monthlySnapshots.length!==30||conversations.length!==120) throw new Error("Unexpected corpus volume");
  if(profiles.some(p=>!p.synthetic||p.household.housingStatus!=="tenant"||p.household.children<1||p.monthlyIncomeEUR<1500||p.monthlyIncomeEUR>8000)) throw new Error("Invalid synthetic profile");
  if(monthlySnapshots.some(m=>!m.synthetic||m.savingsAttainmentPct<10||m.savingsAttainmentPct>90)) throw new Error("Invalid monthly snapshot");
  if(conversations.some(c=>!c.synthetic||!profiles.some(p=>p.id===c.profileId)||!monthlySnapshots.some(m=>m.profileId===c.profileId&&m.monthKey===c.monthKey))) throw new Error("Invalid conversation relation");
  return true;
}
if(require.main===module){
  const corpus=buildCorpus();
  const output=path.join(__dirname,"..","simulation","data","coach-corpus.json");
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(corpus,null,2)+"\n","utf8");
  console.log(JSON.stringify({ok:true,file:"simulation/data/coach-corpus.json",profiles:10,months:30,conversations:120,syntheticOnly:true}));
}
module.exports={buildCorpus,validateCorpus};
