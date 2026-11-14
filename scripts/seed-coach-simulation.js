"use strict";
// Seed idempotent du corpus de recette. Refuse toute base autre que bep_test_db.
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

if (process.env.BEP_SIMULATION_ENABLED !== "true") throw new Error("BEP_SIMULATION_ENABLED=true is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const dbUrl = new URL(process.env.DATABASE_URL);
if (decodeURIComponent(dbUrl.pathname.replace(/^\//, "")) !== "bep_test_db") throw new Error("Refusing to seed a database other than bep_test_db");
if (/bep-v2-db|prod/i.test(dbUrl.hostname)) throw new Error("Refusing a production-like database host");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
let seed = 20261114;
function rand() { seed = (seed * 48271) % 2147483647; return (seed - 1) / 2147483646; }
function between(min, max) { return min + rand() * (max - min); }
function money(n) { return Math.round(n * 100) / 100; }
function pick(xs) { return xs[Math.floor(rand() * xs.length)]; }
function monthDate(y, m) { return new Date(Date.UTC(y, m - 1, 1)); }
function isoDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d, 9 + Math.floor(rand() * 10), Math.floor(rand() * 60))).toISOString(); }

const profiles = [
 {id:"SIM-001",name:"Camille D.",csp:"Employée administrative",income:1500,children:1,rent:520,rate:8},
 {id:"SIM-002",name:"Yanis R.",csp:"Agent de logistique",income:1850,children:2,rent:640,rate:7},
 {id:"SIM-003",name:"Sarah L.",csp:"Aide-soignante",income:2200,children:1,rent:690,rate:9},
 {id:"SIM-004",name:"Thomas B.",csp:"Technicien de maintenance",income:2750,children:2,rent:790,rate:10},
 {id:"SIM-005",name:"Nadia K.",csp:"Assistante commerciale",income:3300,children:2,rent:880,rate:12},
 {id:"SIM-006",name:"Julien P.",csp:"Enseignant",income:3900,children:1,rent:980,rate:13},
 {id:"SIM-007",name:"Élodie M.",csp:"Infirmière coordinatrice",income:4600,children:2,rent:1120,rate:14},
 {id:"SIM-008",name:"Karim A.",csp:"Cadre informatique",income:5400,children:2,rent:1320,rate:16},
 {id:"SIM-009",name:"Claire V.",csp:"Responsable RH",income:6600,children:3,rent:1580,rate:18},
 {id:"SIM-010",name:"Antoine G.",csp:"Directeur commercial",income:8000,children:2,rent:1850,rate:20}
];
const months = [{y:2026,m:9},{y:2026,m:10},{y:2026,m:11}];
const fixedLabels = [
 ["Électricité et gaz","Energie"],["Eau","Energie"],["Internet et mobile","Télécoms"],
 ["Assurances","Assurances"],["Transport","Transport"],["Cantine et activités enfants","Enfants"],
 ["Mutuelle","Santé"],["Crédit / engagements récurrents","Engagements"]
];
const scenarios = [
 {intent:"budget",user:"J'ai l'impression que mon budget part dans tous les sens. Peux-tu m'aider à voir où je peux reprendre la main ?",coach:"On va repartir des chiffres du mois, sans jugement. Ton loyer et tes charges fixes sont prioritaires. Ensuite, on distingue les dépenses variables et l'épargne réellement disponible. Quelle dépense variable te semble la moins maîtrisée ?",signals:["prise_de_conscience","besoin_de_structure"]},
 {intent:"spending",user:"J'ai eu plusieurs dépenses imprévues cette semaine et je culpabilise.",coach:"Une dépense imprévue n'est pas un échec. Vérifions son montant, son caractère exceptionnel et ce qu'il reste jusqu'à la fin du mois. On ajustera d'abord les postes flexibles, sans toucher aux dépenses indispensables.",signals:["culpabilite","depense_imprevue"]},
 {intent:"savings",user:"Je n'ai pas atteint mon objectif d'épargne ce mois-ci. Je suis déçu.",coach:"L'objectif est un repère, pas une obligation qui doit fragiliser ton quotidien. Comparons le montant prévu au montant réellement mis de côté. Un taux d'atteinte plus faible peut simplement signaler un mois plus contraint.",signals:["deception","objectif_epargne"]},
 {intent:"planning",user:"Les dépenses liées aux enfants augmentent et je n'avais pas anticipé.",coach:"Ajoutons ces dépenses dans une enveloppe dédiée pour mieux les anticiper le mois prochain. On regarde leur fréquence et leur montant moyen, puis on vérifie que le budget conserve une marge de sécurité.",signals:["charge_familiale","anticipation"]},
 {intent:"behavior",user:"J'ai fait un achat impulsif alors que je m'étais promis de faire attention.",coach:"Repérons le déclencheur sans te juger : fatigue, envie de te faire plaisir, pression ou promotion. Pour le prochain achat non essentiel, tu peux instaurer une pause de 24 heures et vérifier le reste disponible avant de décider.",signals:["achat_impulsif","auto_observation"]},
 {intent:"budget",user:"La fin du mois risque d'être compliquée avec les prélèvements qui arrivent.",coach:"On établit l'ordre des échéances : loyer, énergie, assurances, alimentation et besoins des enfants. Puis on calcule le disponible après ces charges. Ne programme pas un virement d'épargne qui ferait passer le compte sous son seuil de sécurité.",signals:["anticipation_tension","risque_tresorerie"]},
 {intent:"savings",user:"J'aimerais augmenter mon épargne, mais je ne veux pas me retrouver à découvert.",coach:"La priorité est de garder un budget soutenable. On peut tester une hausse modeste uniquement si les dépenses essentielles et une marge de sécurité sont couvertes. Le montant doit rester ajustable selon les mois.",signals:["motivation","prudence"]},
 {intent:"spending",user:"J'ai dépassé mon enveloppe sorties et loisirs.",coach:"Regardons le dépassement et les jours restants. Tu peux réduire temporairement les sorties restantes ou réallouer une enveloppe non utilisée. Évitons de compenser en supprimant une dépense essentielle.",signals:["depassement","arbitrage"]},
 {intent:"learning",user:"Je ne comprends pas pourquoi mon taux d'épargne est si bas alors que je gagne correctement ma vie.",coach:"Le revenu ne suffit pas à expliquer la capacité d'épargne. Le loyer, les charges, la composition du foyer et les dépenses irrégulières comptent aussi. Regardons le reste à vivre et les dépenses réelles avant de conclure.",signals:["incomprehension","besoin_pedagogie"]},
 {intent:"debt",user:"J'ai peur de ne pas réussir à payer toutes mes charges ce mois-ci.",coach:"On va hiérarchiser les échéances et identifier rapidement les postes à risque. Si une échéance essentielle est menacée, contacte le créancier ou le fournisseur avant la date prévue pour connaître les solutions possibles. Ne prends pas un nouvel engagement pour masquer le manque.",signals:["anxiete_financiere","risque_impaye"]}
];

async function main() {
 const client = await pool.connect();
 try {
  await client.query("BEGIN");
  const agentMigration = fs.readFileSync(path.join(__dirname,"..","database","migrations","20261114_bep_gemini_agent.sql"),"utf8");
  await client.query(agentMigration);
  const migration = fs.readFileSync(path.join(__dirname,"..","database","migrations","20261114_bep_coach_simulation.sql"),"utf8");
  await client.query(migration);
  // Idempotence limitée aux identifiants réservés au corpus SIM-*.
  await client.query("DELETE FROM bep_simulation_profiles WHERE profile_id LIKE 'SIM-%'");
  let monthCount=0, conversationCount=0;
  for (const p of profiles) {
   const fixed = fixedLabels.map(([label,category],i)=>({label,category,amount:money([between(35,95),between(12,35),between(35,65),between(45,100),between(35,110),between(45,110)*p.children,between(25,85),between(0,120)][i])}));
   const fixedTotal = fixed.reduce((s,x)=>s+x.amount,0);
   await client.query(
    "INSERT INTO bep_simulation_profiles(profile_id,display_name,socio_professional_category,monthly_income,household,fixed_charges,savings_target_rate,metadata) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb)",
    [p.id,p.name,p.csp,p.income,JSON.stringify({status:"locataire",children:p.children,householdType:p.children===1?"parent avec enfant(s)":"foyer avec enfant(s)"}),JSON.stringify([{label:"Loyer",category:"Logement",amount:p.rent},...fixed]),p.rate,JSON.stringify({synthetic:true,source:"BEP simulation corpus",incomeBand:"1500-8000 EUR"})]
   );
   for (const mo of months) {
    const key = monthDate(mo.y,mo.m).toISOString().slice(0,10);
    const variable = money(between(0.12,0.25)*p.income + p.children*between(55,105));
    const plannedSavings = money(Math.max(30,(p.income-p.rent-fixedTotal-variable)*p.rate/100));
    const attainment = Math.round(between(10,90)*10)/10;
    const actualSavings = money(plannedSavings*attainment/100);
    const statuses=["on_track","under_pressure","overspend","recovery"];
    const status=attainment>=70?"on_track":attainment>=45?"recovery":attainment>=25?"under_pressure":"overspend";
    const events=[
     {type:pick(["school_expense","transport","health","home"]),amount:money(between(25,180)),note:"Événement synthétique"},
     {type:pick(["unexpected_bill","family_activity","car_repair","annual_payment"]),amount:money(between(30,220)),note:"Événement synthétique"}
    ];
    await client.query(
     "INSERT INTO bep_simulation_months(profile_id,month_key,income,rent,fixed_charges_total,variable_expenses,planned_savings,actual_savings,savings_attainment_pct,month_status,events) VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
     [p.id,key,p.income,p.rent,fixedTotal,variable,plannedSavings,actualSavings,attainment,status,JSON.stringify(events)]
    );
    monthCount++;
    for(let i=0;i<4;i++){
     const sc=pick(scenarios),day=3+i*6+Math.floor(rand()*3);
     const occurred=isoDate(mo.y,mo.m,Math.min(day,28));
     const context={income:p.income,rent:p.rent,fixedCharges:fixedTotal,variableExpenses:variable,plannedSavings,actualSavings,savingsAttainmentPct:attainment,children:p.children,month:key,status};
     await client.query(
      "INSERT INTO bep_simulation_conversations(conversation_id,profile_id,month_key,sequence_no,occurred_at,user_message,coach_response,intent,behavioral_signals,financial_context,synthetic) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,TRUE)",
      [p.id+"-"+key.slice(0,7)+"-"+String(i+1).padStart(2,"0"),p.id,key,i+1,occurred,sc.user,sc.coach,sc.intent,JSON.stringify(sc.signals),JSON.stringify(context)]
     );
     conversationCount++;
    }
   }
  }
  await client.query("INSERT INTO bep_agent_jobs(job_type,payload) VALUES('coach_quality_review',$1::jsonb) ON CONFLICT DO NOTHING",[JSON.stringify({source:"synthetic_simulation",range:"2026-09/2026-11"})]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ok:true,profiles:profiles.length,months:monthCount,conversations:conversationCount,qualityReviewQueued:true,syntheticOnly:true,range:"2026-09 to 2026-11",database:"bep_test_db"}));
 } catch(e) { await client.query("ROLLBACK").catch(()=>{}); throw e; }
 finally { client.release(); await pool.end(); }
}
main().catch(async e=>{console.error("Simulation seed failed:",e.message);await pool.end();process.exitCode=1;});
