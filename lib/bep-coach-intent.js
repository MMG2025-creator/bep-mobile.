"use strict";
const NUMBER = "((?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[,.]\\d{1,2})?)";
function amountAfter(label, question) {
 const re = new RegExp(label + "\\D{0,45}(" + NUMBER + ")\\s*€?", "i");
 const match = String(question || "").match(re);
 if (!match) return null;
 const value = Number(match[1].replace(/[ \\u00a0\\u202f]/g, "").replace(",", "."));
 return Number.isFinite(value) && value >= 0 ? value : null;
}
function parseExplicitAvailable(question) {
 const q = String(question || "");
 if (!/\b(disponible|reste|reste[- ]?à[- ]?vivre|combien)\b/i.test(q)) return null;
 const income = amountAfter("revenus?", q);
 const charges = amountAfter("charges?", q);
 if (income === null || charges === null) return null;
 return { income, charges, available: Math.round((income - charges) * 100) / 100 };
}
function formatEuro(value) {
 return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
module.exports = { parseExplicitAvailable, formatEuro };