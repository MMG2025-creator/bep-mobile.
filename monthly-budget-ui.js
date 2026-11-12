(() => {
  "use strict";
  const API = String(window.BEP_API_BASE || "https://bep-v2-api.onrender.com").replace(/\/+$/, "");
  const DB = "bep-mobile-v1";
  const $ = id => document.getElementById(id);
  const card = $("monthlyHistoryCard");
  if (!card) return;

  let months = [];
  let current = null;
  let items = [];
  let actuals = { count: 0, actualExpenseTotal: "0.00", expenses: [] };
  let editingItemIndex = null;
  let loading = false;
  let authEpoch = 0;

  const money = value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
  const monthNow = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const status = (message, error = false) => {
    $("monthlyBudgetStatus").textContent = message;
    $("monthlyBudgetStatus").classList.toggle("warning", error);
  };
  const setBusy = value => {
    loading = value;
    card.querySelectorAll("button,input,select").forEach(el => { el.disabled = value; });
  };
  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "SERVICE_UNAVAILABLE");
    return data;
  }
  function legacyItems(sourceState) {
    let state = sourceState && typeof sourceState === "object" ? sourceState : {};
    if (!sourceState) { try { state = JSON.parse(localStorage.getItem(DB) || "{}"); } catch {} }
    const result = [];
    const incomes = Array.isArray(state.incomes) && state.incomes.length ? state.incomes : (Number(state.income) > 0 ? [{ label: "Revenu principal", type: "Autre revenu", amount: Number(state.income), id: "legacy-primary-income" }] : []);
    incomes.forEach(x => {
      if (!x || typeof x !== "object") return;
      const amount = Number(x.amount);
      if (x.label && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "income", sourceItemId: x.id == null ? null : String(x.id), label: String(x.label).slice(0, 160),
        category: typeof x.type === "string" ? x.type : null, plannedAmount: amount, metadata: { source: "legacy-income" }
      });
    });
    (Array.isArray(state.budgets) ? state.budgets : []).forEach(x => {
      if (!x || typeof x !== "object") return;
      const amount = Number(x.amount);
      if ((x.label || x.category) && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "charge", sourceItemId: x.id == null ? null : String(x.id), label: String(x.label || x.category).slice(0, 160),
        category: typeof x.category === "string" ? x.category : null, nature: typeof x.nature === "string" ? x.nature : null, plannedAmount: amount, metadata: { source: "legacy-budget" }
      });
    });
    (Array.isArray(state.goals) ? state.goals : []).filter(x => x && !x.archivedAt).forEach(x => {
      if (!x || typeof x !== "object") return;
      const amount = Number(x.monthly);
      if ((x.name || x.id) && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "savings", sourceItemId: x.id == null ? null : String(x.id), label: String(x.name || "Épargne programmée").slice(0, 160),
        plannedAmount: amount, metadata: { source: "legacy-savings-goal", rate: Number(x.rate) || 0, duration: Number(x.duration) || 3 }
      });
    });
    return result;
  }
  function renderMonths() {
    const select = $("monthlyBudgetMonth");
    const selected = current?.monthKey || select.value;
    select.innerHTML = months.map(x => '<option value="' + escapeHtml(x.monthKey) + '">' +
      new Date(x.monthKey + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) +
      (x.status === "closed" ? " · clôturé" : "") + "</option>").join("");
    if (selected && months.some(x => x.monthKey === selected)) select.value = selected;
    $("monthlyBudgetNoMonth").hidden = months.length > 0;
    $("monthlyBudgetWorkspace").hidden = !current;
    $("monthlyBudgetCreateForm").hidden = !window.bepSignedIn;
  }
  function renderActuals() {
    $("monthlyBudgetActualTotal").textContent = money(actuals.actualExpenseTotal);
    $("monthlyBudgetActualCount").textContent = actuals.count + (actuals.count === 1 ? " achat enregistré" : " achats enregistrés") + " · calculés selon la date réelle de l’achat";
    $("monthlyBudgetActualItems").innerHTML = actuals.expenses.length ? actuals.expenses.slice(0, 12).map(x =>
      '<div class="monthly-budget-actual-row"><span>' + escapeHtml(x.label) + '<small>' +
      new Date(x.at).toLocaleDateString("fr-FR") + (x.category ? " · " + escapeHtml(x.category) : "") +
      '</small></span><b>' + money(x.amount) + '</b></div>'
    ).join("") : '<p class="empty">Aucun achat enregistré pour ce mois.</p>';
  }
  function renderItems() {
    const labels = { income: "Revenu", charge: "Charge", savings: "Épargne" };
    $("monthlyBudgetItems").innerHTML = items.length ? items.map((x, index) =>
      '<div class="monthly-budget-row"><span><b>' + escapeHtml(x.label) + '</b><small>' +
      labels[x.itemType] + (x.category ? " · " + escapeHtml(x.category) : "") +
      '</small></span><b>' + money(x.plannedAmount) + '</b><span class="monthly-budget-row-actions">' +
      '<button type="button" data-edit-month-item="' + index + '" ' + (current.status === "closed" ? "disabled" : "") + '>Modifier</button>' +
      '<button type="button" data-remove-month-item="' + index + '" aria-label="Retirer cette ligne" ' +
      (current.status === "closed" ? "disabled" : "") + '>×</button></span></div>'
    ).join("") : '<p class="empty">Aucune ligne dans ce mois.</p>';
    $("monthlyBudgetItems").querySelectorAll("[data-edit-month-item]").forEach(button => {
      button.onclick = () => {
        editingItemIndex = Number(button.dataset.editMonthItem);
        const item = items[editingItemIndex];
        $("monthlyBudgetItemType").value = item.itemType;
        $("monthlyBudgetItemLabel").value = item.label;
        $("monthlyBudgetItemCategory").value = item.category || "";
        $("monthlyBudgetItemAmount").value = item.plannedAmount;
        $("monthlyBudgetItemSubmit").textContent = "Enregistrer les modifications";
        $("monthlyBudgetItemCancel").hidden = false;
        $("monthlyBudgetItemLabel").focus();
      };
    });
    $("monthlyBudgetItems").querySelectorAll("[data-remove-month-item]").forEach(button => {
      button.onclick = () => {
        items.splice(Number(button.dataset.removeMonthItem), 1);
        editingItemIndex = null;
        $("monthlyBudgetItemForm").reset();
        $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
        $("monthlyBudgetItemCancel").hidden = true;
        renderItems();
      };
    });
    const sum = type => items.filter(x => x.itemType === type).reduce((n, x) => n + Number(x.plannedAmount || 0), 0);
    $("monthlyBudgetIncomeTotal").textContent = money(sum("income"));
    $("monthlyBudgetChargesTotal").textContent = money(sum("charge"));
    $("monthlyBudgetSavingsTotal").textContent = money(sum("savings"));
    $("monthlyBudgetRemaining").textContent = money(sum("income") - sum("charge") - sum("savings"));
    $("monthlyBudgetSave").hidden = current.status === "closed";
    $("monthlyBudgetClose").hidden = current.status === "closed";
    $("monthlyBudgetReopen").hidden = current.status !== "closed";
    $("monthlyBudgetReason").hidden = current.status !== "closed";
    $("monthlyBudgetItemForm").hidden = current.status === "closed";
  }
  async function loadMonth(monthKey) {
    const epoch = authEpoch;
    setBusy(true);
    try {
      const [data, actualData] = await Promise.all([
        api("/api/budgets/months/" + encodeURIComponent(monthKey)),
        api("/api/budgets/months/" + encodeURIComponent(monthKey) + "/actuals?timeZone=" + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"))
      ]);
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      current = data.budget;
      actuals = actualData;
      editingItemIndex = null;
      $("monthlyBudgetItemForm").reset();
      $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
      $("monthlyBudgetItemCancel").hidden = true;
      items = current.items.map(x => ({
        itemType: x.itemType, sourceItemId: x.sourceItemId || x.id || null, label: x.label,
        category: x.category, nature: x.nature, plannedAmount: Number(x.plannedAmount), metadata: x.metadata || {}
      }));
      renderMonths();
      renderItems();
      renderActuals();
      if (current.status === "open" && current.monthKey === monthNow() && typeof window.BEP_APPLY_MONTHLY_ITEMS === "function") {
        try { await window.BEP_APPLY_MONTHLY_ITEMS(current.monthKey, items); }
        catch (syncError) { status("Budget mensuel chargé, mais synchronisation des autres modules impossible : " + syncError.message, true); }
      }
      status(current.status === "closed" ? "Mois clôturé — consultation seule." : "Mois ouvert · version " + current.version);
    } catch (error) {
      status("Impossible de charger ce mois : " + error.message, true);
    } finally { setBusy(false); }
  }
  async function refresh() {
    if (!window.bepSignedIn || loading) return;
    const epoch = authEpoch;
    setBusy(true);
    try {
      const data = await api("/api/budgets/months");
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      months = data.months || [];
      renderMonths();
      if (months.length) await loadMonth(months[0].monthKey);
      else {
        current = null; items = []; renderMonths();
        status("Aucun historique mensuel. Crée le premier mois à partir de ton budget actuel.");
      }
    } catch (error) {
      status(error.message === "MONTHLY_BUDGET_UNAVAILABLE"
        ? "Historique indisponible : migration non appliquée ou base temporairement inaccessible."
        : "Historique temporairement indisponible : " + error.message, true);
    } finally { setBusy(false); }
  }

  $("monthlyBudgetMonth").onchange = event => loadMonth(event.target.value);
  window.addEventListener("bep:legacy-budget-changed", syncLegacyBudget);
  $("monthlyBudgetCreateForm").onsubmit = async event => {
    event.preventDefault();
    if (loading) return;
    const monthKey = $("monthlyBudgetNewMonth").value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return status("Choisis un mois valide.", true);
    const epoch = authEpoch;
    const first = months.length === 0;
    const source = first ? "current" : "previous";
    const payload = { monthKey, source };
    if (first) {
      payload.items = legacyItems();
      if (payload.items.length > 200) return status("Le budget actuel contient plus de 200 lignes. Réduis-le ou importe-le par lots après contrôle.", true);
      if (!payload.items.length && !window.confirm("Aucun revenu, charge ou objectif n’a été trouvé dans le budget actuel. Créer un mois vide ?")) return;
    }
    setBusy(true);
    try {
      const data = await api("/api/budgets/months", { method: "POST", body: JSON.stringify(payload) });
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      months = [data.budget, ...months.filter(x => x.monthKey !== monthKey)].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      await loadMonth(monthKey);
      status(data.created ? "Mois créé. Les valeurs copiées sont indépendantes." : "Ce mois existait déjà ; aucune duplication effectuée.");
    } catch (error) { status("Création impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
  $("monthlyBudgetItemForm").onsubmit = event => {
    event.preventDefault();
    if (!current || current.status !== "open") return;
    const label = $("monthlyBudgetItemLabel").value.trim();
    const amount = Number($("monthlyBudgetItemAmount").value);
    if (!label || !Number.isFinite(amount) || amount < 0) return status("Libellé ou montant invalide.", true);
    const item = {
      itemType: $("monthlyBudgetItemType").value, label,
      category: $("monthlyBudgetItemCategory").value.trim() || null,
      plannedAmount: amount,
      sourceItemId: editingItemIndex === null ? crypto.randomUUID() : (items[editingItemIndex]?.sourceItemId || crypto.randomUUID()),
      metadata: editingItemIndex === null ? { source: "monthly-history" } : (items[editingItemIndex]?.metadata || { source: "monthly-history" })
    };
    if (editingItemIndex === null) items.push(item);
    else items[editingItemIndex] = item;
    editingItemIndex = null;
    $("monthlyBudgetItemForm").reset();
    $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
    $("monthlyBudgetItemCancel").hidden = true;
    renderItems();
  };
  $("monthlyBudgetItemCancel").onclick = () => {
    editingItemIndex = null;
    $("monthlyBudgetItemForm").reset();
    $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
    $("monthlyBudgetItemCancel").hidden = true;
  };
  $("monthlyBudgetSave").onclick = async () => {
    if (!current || loading) return;
    const epoch = authEpoch;
    setBusy(true);
    try {
      const data = await api("/api/budgets/months/" + current.monthKey, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: current.version, items })
      });
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      current = data.budget;
      items = current.items.map(x => ({ ...x, plannedAmount: Number(x.plannedAmount) }));
      renderItems();
      let syncWarning = null;
      if (current.monthKey === monthNow() && current.status === "open" && typeof window.BEP_APPLY_MONTHLY_ITEMS === "function") {
        try { await window.BEP_APPLY_MONTHLY_ITEMS(current.monthKey, items); }
        catch (syncError) { syncWarning = syncError.message; }
      }
      status(syncWarning
        ? "Budget mensuel enregistré · version " + current.version + ". Synchronisation des autres modules à reprendre : " + syncWarning
        : "Budget enregistré · version " + current.version, Boolean(syncWarning));
      try { await refreshMonthListOnly(); }
      catch (refreshError) {
        status("Budget mensuel enregistré · version " + current.version + ". Actualisation de la liste des mois impossible : " + refreshError.message, true);
      }
    } catch (error) { status(error.message === "VERSION_CONFLICT" ? "Ce budget a été modifié ailleurs. Recharge le mois avant de réessayer." : "Enregistrement impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
  async function syncLegacyBudget(event) {
    if (!window.bepSignedIn || !current || current.status !== "open" ||
        current.monthKey !== monthNow() || loading) return;
    const incoming = legacyItems(event.detail || {});
    const managed = new Set(["legacy-income", "legacy-budget", "legacy-savings-goal"]);
    const custom = items.filter(x => !managed.has(x.metadata?.source));
    const merged = [...incoming, ...custom];
    const signature = rows => JSON.stringify(rows.map(x => ({
      itemType: x.itemType, sourceItemId: x.sourceItemId || null, label: x.label,
      category: x.category || null, nature: x.nature || null,
      plannedAmount: Number(x.plannedAmount), metadata: x.metadata || {}
    })));
    if (signature(merged) === signature(items)) return;
    setBusy(true);
    try {
      const data = await api("/api/budgets/months/" + current.monthKey, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: current.version, items: merged })
      });
      current = data.budget;
      items = current.items.map(x => ({
        itemType: x.itemType, sourceItemId: x.sourceItemId || x.id || null, label: x.label,
        category: x.category, nature: x.nature, plannedAmount: Number(x.plannedAmount), metadata: x.metadata || {}
      }));
      renderItems();
      await refreshMonthListOnly();
      status("Budget mensuel synchronisé avec les modules Revenus, Charges et Épargne.");
    } catch (error) {
      status(error.message === "VERSION_CONFLICT"
        ? "Le budget mensuel a changé en parallèle. Recharge le mois avant de modifier les deux vues."
        : "Synchronisation du budget mensuel impossible : " + error.message, true);
    } finally { setBusy(false); }
  }

  async function refreshMonthListOnly() {
    const data = await api("/api/budgets/months");
    months = data.months || [];
    renderMonths();
  }
  $("monthlyBudgetClose").onclick = async () => {
    if (!current || loading) return;
    const epoch = authEpoch;
    setBusy(true);
    try {
      const data = await api("/api/budgets/months/" + current.monthKey + "/close", {
        method: "POST", body: JSON.stringify({ expectedVersion: current.version })
      });
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      await loadMonth(current.monthKey);
      status(data.changed ? "Mois clôturé. Il reste consultable." : "Ce mois était déjà clôturé.");
      await refreshMonthListOnly();
    } catch (error) { status("Clôture impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
  $("monthlyBudgetReopen").onclick = async () => {
    if (!current || loading) return;
    const epoch = authEpoch;
    const reason = $("monthlyBudgetReasonInput").value.trim();
    if (!reason) return status("Indique le motif de la correction avant de rouvrir le mois.", true);
    setBusy(true);
    try {
      await api("/api/budgets/months/" + current.monthKey + "/reopen", {
        method: "POST", body: JSON.stringify({ expectedVersion: current.version, reason })
      });
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      $("monthlyBudgetReasonInput").value = "";
      await loadMonth(current.monthKey);
      status("Mois rouvert. La réouverture est inscrite dans le journal d’audit.");
      await refreshMonthListOnly();
    } catch (error) { status("Réouverture impossible : " + error.message, true); }
    finally { setBusy(false); }
  };

  $("monthlyBudgetNewMonth").value = monthNow();
  window.addEventListener("bep:auth-ready", () => {
    authEpoch++;
    if (window.bepSignedIn) refresh();
    else { months = []; current = null; items = []; actuals = { count: 0, actualExpenseTotal: "0.00", expenses: [] }; renderMonths(); renderActuals(); setBusy(false); status("Connecte-toi pour consulter ton historique mensuel."); }
  });
  if (window.bepSignedIn) refresh();
})();
