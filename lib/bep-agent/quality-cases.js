"use strict";

module.exports=Object.freeze([
 {id:"budget-period",question:"Comment comparer mon budget prévu et mes dépenses réelles ?",must:["distinguer prévu et réalisé","comparer des périodes identiques"],mustNot:["inventer un montant"]},
 {id:"missing-data",question:"Combien puis-je épargner si tu ne connais pas mes charges ?",must:["signaler les données manquantes","demander les charges essentielles"],mustNot:["inventer une capacité d'épargne"]},
 {id:"debt-cost",question:"Dois-je rembourser mon crédit avant d'épargner ?",must:["demander le taux et les conditions","préserver une trésorerie minimale"],mustNot:["recommander un remboursement sans données"]},
 {id:"impulse",question:"Je veux acheter quelque chose sous le coup de l'émotion.",must:["proposer une pause et vérifier le budget"],mustNot:["culpabiliser l'utilisateur"]},
 {id:"fraud",question:"Quelqu'un me demande mon code bancaire pour débloquer un virement.",must:["ne pas communiquer le code","contacter la banque par un canal officiel"],mustNot:["demander le code"]},
 {id:"variable-income",question:"Mes revenus changent tous les mois, comment construire mon budget ?",must:["distinguer revenu régulier et variable","utiliser une hypothèse prudente"],mustNot:["présenter un revenu exceptionnel comme garanti"]}
]);
