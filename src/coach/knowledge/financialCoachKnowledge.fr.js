/**
 * BEP — Local Financial Coach Knowledge Base
 * Version: 1.0.0 | Locale: fr-FR | Jurisdiction: France
 * Purpose: deterministic knowledge/rule data; no network/API required.
 * IMPORTANT: thresholds that vary by year belong in dated reference data, never hard-coded as universal truths.
 */
export const FINANCIAL_COACH_KB = {
  meta: {
    id: "bep-financial-coach-fr",
    version: "1.0.0",
    updatedAt: "2026-11-11",
    locale: "fr-FR",
    jurisdiction: "FR",
    disclaimer: "Information générale et aide à la décision. Ne remplace pas un conseil juridique, fiscal, bancaire ou financier individualisé.",
    confidenceLevels: ["high", "medium", "low"],
    sourcePolicy: "Every legal/tax/rate assertion must carry sourceIds and validFrom/validUntil or checkedAt."
  },

  // Text normalization and semantic tokens. Preserve original utterance and numeric spans.
  tokenizer: {
    normalize: ["lowercase", "unicode-nfd-strip-diacritics", "normalize-apostrophes", "collapse-whitespace"],
    money: {
      currency: "EUR",
      patterns: ["1200€", "1 200 euros", "1,2k", "1200 balles", "mille deux cents euros", "1.200,50 €"],
      multipliers: { k: 1000, mille: 1000, m: 1000000, million: 1000000 },
      decimalSeparators: [",", "."],
      ambiguityPolicy: "Never infer currency or magnitude when ambiguous; ask a clarification."
    },
    periods: ["today", "this_week", "this_month", "monthly", "annual", "one_off", "future_due_date", "overdue"],
    intents: {
      income: ["salaire", "paie", "revenu", "prime", "freelance", "chomage", "are", "retraite", "pension", "allocation", "loyer percu"],
      expense: ["depense", "achat", "facture", "abonnement", "courses", "loyer", "essence", "assurance", "impot"],
      debt: ["dette", "credit", "mensualite", "retard", "impaye", "decouvert", "agios", "huissier", "saisie", "recouvrement"],
      savings: ["epargne", "livret", "lep", "ldds", "livret a", "precaution", "mettre de cote"],
      investment: ["investir", "pea", "assurance vie", "actions", "obligation", "crypto", "placement", "rendement"],
      housing: ["loyer", "charges", "energie", "electricite", "gaz", "eau", "copropriete", "credit immobilier"],
      tax: ["impot", "prelevement a la source", "declaration", "frais reels", "taxe fonciere"],
      family: ["pension alimentaire", "garde", "enfant", "separation", "divorce", "frais scolaires"],
      emergency: ["expulsion", "coupure", "saisie", "plus de nourriture", "sans logement", "compte bloque", "fraude"]
    },
    sentimentSignals: {
      distress: ["je n'y arrive plus", "impossible de payer", "je suis a decouvert", "je panique", "menace", "huissier"],
      impulsivity: ["achat compulsif", "craque", "sur un coup de tete", "je me refais", "pari", "all in"],
      urgency: ["aujourd'hui", "demain", "mise en demeure", "dernier delai", "coupure", "expulsion"]
    },
    outputTokens: ["{amount}", "{currency}", "{period}", "{remaining_budget}", "{due_date}", "{debt_total}", "{monthly_payment}", "{savings_rate}", "{confidence}", "{next_action}"]
  },

  // User financial state schema used by the inference engine.
  profileSchema: {
    household: ["adults", "children", "dependants", "maritalStatus", "custodyPattern", "city", "housingStatus"],
    income: ["netSalary", "variableIncome", "benefits", "pensions", "rentalIncome", "otherIncome", "frequency", "nextPaymentDate", "stability"],
    expenses: ["housing", "utilities", "food", "transport", "insurance", "telecom", "health", "childcare", "taxes", "subscriptions", "other"],
    debts: ["type", "creditor", "principalRemaining", "monthlyPayment", "interestRate", "arrears", "dueDate", "secured", "guarantor", "legalStage"],
    assets: ["currentAccounts", "cashSavings", "regulatedSavings", "investments", "property", "vehicles"],
    goals: ["emergencyFund", "purchase", "debtReduction", "move", "retirement", "education", "other"],
    constraints: ["incomeVolatility", "healthShock", "jobLoss", "separation", "disability", "legalProceedings", "bankingRestrictions"],
    privacy: "Collect only fields necessary for the current advice; never infer sensitive facts."
  },

  // Ordered decision priorities. Higher priority wins over optimization or investment advice.
  priorities: [
    { id: "P0_SAFETY", order: 0, when: ["food_or_housing_insecurity", "imminent_utility_cutoff", "eviction_deadline", "fraud_in_progress", "account_takeover"], action: "stabilize_and_refer", forbid: ["investment_pitch", "new_credit_recommendation"] },
    { id: "P1_ESSENTIALS", order: 1, when: ["essential_bills_at_risk", "negative_cashflow", "unpaid_rent", "unpaid_energy", "overdraft_spiral"], action: "protect_essentials_and_cashflow" },
    { id: "P2_ARREARS", order: 2, when: ["missed_payment", "collection_notice", "multiple_consumer_debts"], action: "map_debts_contact_creditors_check_rights" },
    { id: "P3_BUFFER", order: 3, when: ["positive_cashflow_but_no_liquid_buffer"], action: "build_small_cash_buffer" },
    { id: "P4_OPTIMIZE", order: 4, when: ["stable_cashflow"], action: "optimize_contracts_tax_and_savings" },
    { id: "P5_GROW", order: 5, when: ["emergency_buffer_sufficient", "high_cost_debt_controlled", "horizon_known"], action: "goal_based_long_term_planning" }
  ],

  // Scenarios are composable: one user message may activate multiple scenarios.
  scenarios: [
    { id: "cashflow_month_end", category: "budget", triggers: ["fin_de_mois", "reste_combien", "tenir_jusqua_paie"], required: ["currentBalance", "nextIncomeDate", "essentialExpensesBeforeIncome"], calculations: ["available_cash = currentBalance + confirmed_inflows - essential_outflows_before_next_income"], advice: ["reserve essentials first", "divide remaining safe amount by days remaining", "pause non-essential spending"], askIfMissing: ["date de prochaine rentrée", "prélèvements restant à venir"], severity: "dynamic" },
    { id: "small_purchase", category: "spending", triggers: ["achat", "petit_plaisir", "abonnement"], required: ["amount", "availableMonthlyCashflow"], calculations: ["post_purchase_cash = available_cash - amount"], advice: ["check upcoming bills", "compare one-off cost with recurring costs", "apply 24-hour pause if impulsive"], severity: "low_to_high_by_context" },
    { id: "large_purchase", category: "spending", triggers: ["voiture", "travaux", "voyage", "electromenager", "achat important"], required: ["amount", "savings", "monthlyCashflow", "financingCost"], calculations: ["total_cost = purchase_price + fees + insurance + maintenance + financing_interest"], advice: ["compare cash purchase versus financing total cost", "protect emergency reserve", "obtain competing quotes", "check cancellation/withdrawal rights"], severity: "medium" },
    { id: "subscription_audit", category: "expenses", triggers: ["abonnement", "prelevement recurrent", "je paie tous les mois"], required: ["amount", "frequency"], calculations: ["annual_cost = recurring_amount * periods_per_year"], advice: ["annualize recurring fees", "check use and cancellation terms", "avoid overdraft or penalty before cancelling essential cover"], severity: "low" },
    { id: "income_drop", category: "income", triggers: ["perte_emploi", "baisse_salaire", "fin_are", "arret_maladie"], required: ["oldIncome", "newIncome", "fixedExpenses", "dateOfChange"], calculations: ["income_gap = oldIncome - newIncome", "new_savings_rate = (newIncome - expenses) / newIncome"], advice: ["rebuild budget using confirmed net income", "check benefits and eligibility with official simulators", "contact lenders/landlord early if payment risk"], severity: "high" },
    { id: "overdraft", category: "banking", triggers: ["decouvert", "agios", "solde negatif"], required: ["overdraftAmount", "daysOverdrawn", "bankFees"], calculations: ["overdraft_cost = interest + incident_fees"], advice: ["stop non-essential debits", "identify rejected direct debits", "ask bank for fee review and suitable offer", "avoid replacing overdraft with expensive revolving credit"], severity: "high" },
    { id: "consumer_credit", category: "debt", triggers: ["credit consommation", "pret personnel", "credit renouvelable", "mensualite"], required: ["principalRemaining", "monthlyPayment", "APR", "remainingTerm"], calculations: ["remaining_total_cost = sum(future_payments) - principal_remaining"], advice: ["compare TAEG and total amount due", "check 14-day withdrawal period where applicable", "review early repayment terms", "do not stack loans to mask structural deficit"], severity: "medium_to_high" },
    { id: "mortgage_stress", category: "housing_debt", triggers: ["credit immobilier", "mensualite maison", "retard pret immobilier"], required: ["monthlyPayment", "income", "arrears", "loanInsurance"], calculations: ["housing_debt_ratio = monthly_housing_cost / net_household_income"], advice: ["contact lender before missed instalment", "check borrower insurance cover", "review contractual deferral/modulation clauses", "seek qualified debt/housing support if arrears persist"], severity: "high" },
    { id: "debt_overload", category: "debt", triggers: ["trop de dettes", "plusieurs credits", "je ne peux plus payer"], required: ["allDebts", "income", "essentialExpenses", "arrears"], calculations: ["monthly_debt_service = sum(monthly_payments)", "disposable_income = income - essential_expenses - debt_service"], advice: ["make complete creditor inventory", "protect food/housing/energy", "contact Banque de France/Point Conseil Budget if inability to repay", "assess overindebtedness procedure rather than take another loan"], severity: "critical_if_essentials_unpaid" },
    { id: "savings_first_steps", category: "savings", triggers: ["commencer epargner", "mettre 20 euros de cote", "petit montant"], required: ["monthlySurplus", "liquidSavings"], calculations: ["monthly_savings_capacity = max(0, income - essential_expenses - minimum_debt_payments)"], advice: ["start with sustainable automatic amount, even small", "keep short-term reserve liquid and low-risk", "check LEP eligibility before other regulated accounts"], severity: "low" },
    { id: "emergency_fund", category: "savings", triggers: ["epargne de precaution", "fonds urgence", "combien garder"], required: ["essentialMonthlyExpenses", "incomeStability", "dependants"], calculations: ["reserve_target = essential_monthly_expenses * scenario_months"], advice: ["set a staged target, not an absolute universal rule", "use accessible low-risk savings for near-term needs", "adjust target for variable income, dependants and job insecurity"], severity: "medium" },
    { id: "regulated_savings", category: "savings", triggers: ["livret a", "lep", "ldds", "livret jeune"], required: ["taxResidence", "referenceTaxIncome", "householdTaxParts", "age"], calculations: ["compare_after_tax_yield_and_liquidity"], advice: ["check current eligibility, ceiling, rate and date from official source", "do not hardcode current rate in evergreen rules"], severity: "medium" },
    { id: "investment_readiness", category: "investment", triggers: ["investir", "pea", "assurance vie", "bourse", "crypto"], required: ["horizon", "riskTolerance", "lossCapacity", "liquidReserve", "debtCost"], calculations: ["risk_capacity = function(horizon, reserve, income_stability, debt)"], advice: ["never invest money needed for bills or short-term goals", "explain capital-loss risk and fees", "diversify and avoid concentration", "verify provider authorization and scam signals"], severity: "high_if_no_buffer" },
    { id: "tax_review", category: "tax", triggers: ["impot", "declaration", "frais reels", "pension alimentaire"], required: ["taxYear", "incomeTypes", "householdStatus"], calculations: ["compare_flat_allowance_vs_eligible_actual_expenses"], advice: ["use tax-year-specific rules", "keep supporting records", "compare standard deduction and actual expenses", "refer complex household/property/capital situations to tax authority or professional"], severity: "medium" },
    { id: "family_budget_change", category: "family", triggers: ["separation", "divorce", "garde alternee", "pension alimentaire", "naissance"], required: ["householdChangeDate", "income", "newExpenses"], calculations: ["revised_household_cashflow"], advice: ["rebuild budget for each household", "identify benefit/tax/childcare changes", "separate agreed costs from disputed or legally determined obligations"], severity: "medium_to_high" },
    { id: "fraud_suspicion", category: "fraud", triggers: ["faux conseiller", "virement suspect", "arnaque", "crypto garantie", "code sms"], required: [], calculations: [], advice: ["do not transfer more money", "contact bank immediately using official number", "block card/access if needed", "preserve messages and evidence", "report to official channels"], severity: "critical" },
    { id: "windfall", category: "one_off_income", triggers: ["heritage", "donation", "prime exceptionnelle", "vente", "grosse somme"], required: ["netAmount", "taxStatus", "liabilities", "goals", "timeHorizon"], calculations: ["net_available = amount - taxes_due - urgent_liabilities - planned_near_term_costs"], advice: ["do not commit immediately", "secure funds temporarily", "check tax/legal implications", "prioritize expensive debt and liquidity before risky investment"], severity: "medium_to_high" }
  ],

  amountBands: [
    { id: "micro", min: 0, max: 49.99, label: "très petit montant", focus: ["frequency", "cash_available", "recurrence"] },
    { id: "small", min: 50, max: 249.99, label: "petit montant", focus: ["monthly_impact", "upcoming_bills"] },
    { id: "medium", min: 250, max: 999.99, label: "montant intermédiaire", focus: ["budget_tradeoff", "alternatives", "reserve"] },
    { id: "large", min: 1000, max: 4999.99, label: "montant important", focus: ["total_cost", "quotes", "financing", "risk"] },
    { id: "very_large", min: 5000, max: 24999.99, label: "montant élevé", focus: ["written_offers", "tax", "contract", "liquidity"] },
    { id: "major", min: 25000, max: 99999.99, label: "montant majeur", focus: ["professional_review", "tax_legal", "capital_preservation"] },
    { id: "exceptional", min: 100000, max: null, label: "patrimoine / opération exceptionnelle", focus: ["regulated_advice", "estate_tax", "diversification", "fraud_controls"] }
  ],

  crossSignals: [
    { id: "low_income_high_fixed_costs", if: ["income_low_or_falling", "fixed_cost_ratio_high"], effect: "prioritize_cashflow_and_entitlements", doNot: ["recommend_market_investment"] },
    { id: "small_amount_recurring", if: ["amount_small", "frequency_recurring"], effect: "annualize_and_rank_by_cumulative_cost" },
    { id: "large_amount_low_liquidity", if: ["amount_large", "cash_reserve_low"], effect: "warn_about_liquidity_and_payment_timing" },
    { id: "high_interest_debt_and_cash_savings", if: ["high_cost_debt", "cash_savings_available"], effect: "compare_guaranteed_interest_saved_vs_net_savings_return_after_fees_and_tax" },
    { id: "variable_income", if: ["income_variable"], effect: "budget_on_conservative_confirmed_income_and_build_larger_buffer" },
    { id: "near_due_date", if: ["due_date_within_7_days"], effect: "prioritize_immediate_cash_availability" },
    { id: "multiple_risk_signals", if: ["distress", "urgency", "arrears"], effect: "escalate_severity_and_reduce_advice_complexity" }
  ],

  calculations: {
    monthlyNetCashflow: "sum(net_recurring_income) - sum(recurring_expenses) - sum(minimum_debt_payments)",
    remainingToNextIncome: "current_balance + confirmed_inflows_before_next_income - essential_outflows_before_next_income",
    fixedCostRatio: "fixed_monthly_costs / net_monthly_household_income",
    debtServiceRatio: "monthly_debt_payments / net_monthly_household_income",
    savingsRate: "monthly_savings / net_monthly_income",
    annualizedRecurringCost: "amount_per_period * periods_per_year",
    purchaseAffordability: "liquid_cash - essential_reserve - committed_near_term_expenses - purchase_total_cost",
    debtPriority: "consider effective_rate, arrears, legal consequences, secured status, essential-service impact; never sort by interest rate alone",
    rules: [
      "Use net amounts and align all periods before comparison.",
      "Never divide by zero; handle missing or irregular income explicitly.",
      "Do not treat credit limit as income or available wealth.",
      "Do not count the same expense twice.",
      "Do not assume a bank balance equals spendable cash before pending transactions.",
      "Show assumptions and calculation steps to the user."
    ]
  },

  guardrails: [
    { id: "G_NO_GUARANTEE", rule: "Never promise investment returns or capital protection unless the product guarantee is verified and its scope explained." },
    { id: "G_NO_UNLICENSED_PERSONAL_INVESTMENT_ORDER", rule: "Do not give personalized buy/sell orders for financial instruments; provide education, risk framing and suggest authorized advice where needed." },
    { id: "G_NO_NEW_DEBT_AS_DEFAULT", rule: "Never recommend new borrowing as the default fix for recurring negative cashflow." },
    { id: "G_NO_LEGAL_CERTAINTY", rule: "For enforcement, limitation, eviction, tax disputes and family obligations, identify jurisdiction/date and refer to authoritative advice; do not infer deadlines." },
    { id: "G_ASK_WHEN_AMBIGUOUS", rule: "If amount, period, gross/net, household unit or due date is ambiguous and changes the answer, ask one targeted question." },
    { id: "G_SOURCE_VOLATILE_FACTS", rule: "Rates, thresholds, benefits, ceilings, tax rules and legal changes require current dated source records." },
    { id: "G_PRIVACY", rule: "Do not request full card numbers, passwords, authentication codes, bank login credentials or unnecessary identity data." },
    { id: "G_DISTRESS", rule: "When essential needs are at risk, keep the response short, practical and action-oriented; prioritize official free human support." }
  ],

  responseBlueprint: {
    sections: ["understanding", "diagnosis", "numbers", "priority", "recommended_actions", "what_to_avoid", "one_clarifying_question_if_needed", "sources_and_confidence"],
    style: "plain French, specific numbers, empathetic but non-judgmental, no generic filler",
    amountHandling: "Always relate amount to income, remaining cash, recurrence, due dates, household size and debt burden; never judge by nominal amount alone."
  },

  sourceIds: [
    "SP_OVERINDEBTEDNESS", "BF_DIFFICULTIES", "SP_CREDIT_OBLIGATIONS", "SP_CREDIT_WITHDRAWAL", "SP_CREDIT_EARLY_REPAYMENT",
    "SP_SAVINGS_COMPARISON", "SP_LEP", "SP_TAX_SAVINGS", "TAX_INCOME_DECLARATION", "TAX_ACTUAL_EXPENSES",
    "SP_MORTGAGE_EARLY_REPAYMENT", "SP_CREDIT_DIFFICULTIES", "BF_BANKING_FILES", "SP_OVERDRAFT"
  ]
};
