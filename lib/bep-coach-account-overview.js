"use strict";

const MONEY = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function isAccountOverviewQuestion(question) {
  const q = String(question || "").toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (/\b(regarde|regarder|analyse|analyser|fais|faire|voir|consulte|consulter)\b.{0,35}\b(mes?\s+)?(comptes?|finances?|situation)\b/.test(q))
    || /\b(point|bilan|situation)\b.{0,30}\b(financier|financiere|comptes?|budget)\b/.test(q)
    || /\b(mes?\s+comptes?|ma\s+situation financiere)\b/.test(q);
}

function finite(value) {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? null : n;
}

function currentMonthExpenses(expenses, now) {
  const month = now.getMonth();
  const year = now.getFullYear();
  return (Array.isArray(expenses) ? expenses : []).filter(item => {
    const date = new Date(item?.at || item?.date || "");
    return Number.isFinite(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
  });
}

function buildAccountOverview(context, now = new Date()) {
  const c = context && typeof context === "object" ? context : {};
  const rawIncome = finite(c.income);
  const rawCharges = finite(c.charges);
  const rawAvailable = finite(c.available);
  const incomes = Array.isArray(c.incomes) ? c.incomes : [];
  const budgets = Array.isArray(c.budgets) ? c.budgets : [];
  const monthlyHistory = Array.isArray(c.monthlyHistory) ? c.monthlyHistory : [];
  const income = rawIncome !== null && (rawIncome > 0 || incomes.length > 0) ? rawIncome : null;
  const chargesKnown = rawCharges !== null && (rawCharges > 0 || budgets.length > 0 || monthlyHistory.length > 0 || (Array.isArray(c.monthlyBudget?.items) && c.monthlyBudget.items.length > 0));
  const charges = chargesKnown ? rawCharges : null;
  const available = income !== null && charges !== null ? rawAvailable : null;
  const expenses = currentMonthExpenses(c.expenses, now);
  const expenseTotal = expenses.reduce((sum, item) => sum + Math.max(0, finite(item?.amount) || 0), 0);
  const goals = Array.isArray(c.goals) ? c.goals : [];
  const warnings = Array.isArray(c.dataWarnings) ? c.dataWarnings.filter(Boolean) : [];
  const lines = [
    "J’ai analysé les données financières enregistrées dans BEP. Je peux lire les informations saisies ou synchronisées dans l’application, mais pas consulter directement un compte bancaire externe."
  ];

  if (income !== null) lines.push("Revenus mensuels enregistrés : " + MONEY.format(income) + ".");
  else lines.push("Revenus mensuels : information manquante.");
  if (charges !== null) lines.push("Charges prévues dans ton budget : " + MONEY.format(charges) + ".");
  else lines.push("Charges prévues : information manquante.");
  if (available !== null) lines.push("Reste disponible estimé : " + MONEY.format(available) + ".");
  else lines.push("Reste disponible : non calculable avec les données actuelles.");

  if (expenses.length) {
    lines.push("Dépenses saisies pour le mois en cours : " + MONEY.format(expenseTotal) + " sur " + expenses.length + " mouvement(s).");
  } else {
    lines.push("Aucune dépense datée du mois en cours n’est disponible dans l’historique transmis.");
  }
  if (goals.length) lines.push("Objectifs d’épargne suivis : " + goals.length + ".");
  if (warnings.length) lines.push("Certaines données n’ont pas pu être vérifiées : " + warnings.slice(0, 2).join(" "));

  let recommendation;
  if (income === null || charges === null || available === null) {
    recommendation = "Ma priorité : compléter les revenus et les charges mensuelles pour établir un diagnostic fiable.";
  } else if (income <= 0) {
    recommendation = "Ma priorité : renseigner un revenu mensuel fiable avant de fixer un objectif d’épargne.";
  } else if (available < 0) {
    recommendation = "Ma priorité : repérer la charge ajustable la plus importante et vérifier les échéances à venir. Le budget présente actuellement un déficit estimé.";
  } else if (available / income < 0.1) {
    recommendation = "Ma priorité : protéger ta trésorerie. La marge estimée est inférieure à 10 % des revenus ; évite d’ajouter un engagement avant d’avoir vérifié les dépenses à venir.";
  } else {
    recommendation = "Ma priorité : vérifier que les dépenses réellement saisies et les provisions annuelles sont bien à jour avant d’augmenter l’épargne ou les dépenses libres.";
  }
  lines.push(recommendation);
  return lines.join("\n\n");
}

module.exports = { isAccountOverviewQuestion, currentMonthExpenses, buildAccountOverview };
