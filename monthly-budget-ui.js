(() => {
  "use strict";
  const API = "https://bep-v2-api.onrender.com";
  const DB = "bep-mobile-v1";
  const $ = id => document.getElementById(id);
  const card = $("monthlyHistoryCard");
  if (!card) return;

  let months = [];
  let current = null;
  let items = [];
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
  function legacyItems() {
    let state = {};
    try { state = JSON.parse(localStorage.getItem(DB) || "{}"); } catch {}
    const result = [];
    (Array.isArray(state.incomes) ? state.incomes : []).forEach(x => {
      const amount = Number(x.amount);
      if (x && x.label && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "income", sourceItemId: x.id || null, label: String(x.label).slice(0, 160),
        category: x.type || null, plannedAmount: amount, metadata: { source: "legacy-income" }
      });
    });
    (Array.isArray(state.budgets) ? state.budgets : []).forEach(x => {
      const amount = Number(x.amount);
      if (x && (x.label || x.category) && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "charge", sourceItemId: x.id || null, label: String(x.label || x.category).slice(0, 160),
        category: x.category || null, nature: x.nature || null, plannedAmount: amount, metadata: { source: "legacy-budget" }
      });
    });
    (Array.isArray(state.goals) ? state.goals : []).forEach(x => {
      const amount = Number(x.monthly);
      if (x && (x.name || x.id) && Number.isFinite(amount) && amount >= 0) result.push({
        itemType: "savings", sourceItemId: x.id || null, label: String(x.name || "Épargne programmée").slice(0, 160),
        plannedAmount: amount, metadata: { source: "legacy-savings-goal" }
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
    $("monthlyBudgetCreateForm").hidden = false;
  }
  function renderItems() {
    const labels = { income: "Revenu", charge: "Charge", savings: "Épargne" };
    $("monthlyBudgetItems").innerHTML = items.length ? items.map((x, index) =>
      '<div class="monthly-budget-row"><span><b>' + escapeHtml(x.label) + '</b><small>' +
      labels[x.itemType] + (x.category ? " · " + escapeHtml(x.category) : "") +
      '</small></span><b>' + money(x.plannedAmount) + '</b><button type="button" data-remove-month-item="' + index +
      '" aria-label="Retirer cette ligne" ' + (current.status === "closed" ? "disabled" : "") + '>×</button></div>'
    ).join("") : '<p class="empty">Aucune ligne dans ce mois.</p>';
    $("monthlyBudgetItems").querySelectorAll("[data-remove-month-item]").forEach(button => {
      button.onclick = () => {
        items.splice(Number(button.dataset.removeMonthItem), 1);
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
      const data = await api("/api/budgets/months/" + encodeURIComponent(monthKey));
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      current = data.budget;
      items = current.items.map(x => ({
        itemType: x.itemType, sourceItemId: x.sourceItemId, label: x.label,
        category: x.category, nature: x.nature, plannedAmount: Number(x.plannedAmount), metadata: x.metadata || {}
      }));
      renderMonths();
      renderItems();
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
        ? "Le module historique attend l’activation de sa migration de base de données."
        : "Historique temporairement indisponible : " + error.message, true);
    } finally { setBusy(false); }
  }

  $("monthlyBudgetMonth").onchange = event => loadMonth(event.target.value);
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
    items.push({
      itemType: $("monthlyBudgetItemType").value, label,
      category: $("monthlyBudgetItemCategory").value.trim() || null,
      plannedAmount: amount, metadata: {}
    });
    $("monthlyBudgetItemLabel").value = "";
    $("monthlyBudgetItemAmount").value = "";
    $("monthlyBudgetItemCategory").value = "";
    renderItems();
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
      renderItems(); status("Budget enregistré · version " + current.version);
      await refreshMonthListOnly();
    } catch (error) { status(error.message === "VERSION_CONFLICT" ? "Ce budget a été modifié ailleurs. Recharge le mois avant de réessayer." : "Enregistrement impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
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
    else { months = []; current = null; items = []; renderMonths(); setBusy(false); status("Connecte-toi pour consulter ton historique mensuel."); }
  });
  if (window.bepSignedIn) refresh();
})();
