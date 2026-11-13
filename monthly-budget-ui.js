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
  let actuals = { expenses: [], actualExpenseTotal: "0.00", count: 0 };
  let actualsError = "";
  let editingItemId = null;
  let monthSelectionMode = false;
  const monthSelection = new Set();
  function attachMonthLongPress() {
    const container = $("monthlyBudgetItems"); if (!container) return;
    const rows = Array.from(container.querySelectorAll("[data-month-row]"));
    let toolbar = $("monthlyBudgetItemsBulkToolbar");
    if (!toolbar) { toolbar = document.createElement("div"); toolbar.id = "monthlyBudgetItemsBulkToolbar"; toolbar.className = "multi-select-toolbar hidden"; container.before(toolbar); }
    toolbar.classList.toggle("hidden", !monthSelectionMode);
    toolbar.innerHTML = monthSelectionMode ? '<span>' + monthSelection.size + ' ligne(s) sélectionnée(s)</span><button type="button" data-month-all>Tout sélectionner</button><button type="button" data-month-delete>Supprimer la sélection</button><button type="button" data-month-cancel>Annuler</button>' : "";
    rows.forEach(row => {
      const index = Number(row.dataset.monthRow);
      row.classList.toggle("is-selected", monthSelectionMode && monthSelection.has(index));
      let check = row.querySelector("[data-month-check]");
      if (monthSelectionMode) {
        if (!check) { check = document.createElement("input"); check.type = "checkbox"; check.dataset.monthCheck = ""; check.className = "multi-select-check"; check.setAttribute("aria-label", "Sélectionner cette ligne"); row.prepend(check); }
        check.checked = monthSelection.has(index);
        check.onchange = () => { if (check.checked) monthSelection.add(index); else monthSelection.delete(index); attachMonthLongPress(); };
      } else check?.remove();
      if (row.dataset.monthLongPressBound === "1") return;
      row.dataset.monthLongPressBound = "1";
      let timer = null;
      const clear = () => { if (timer) clearTimeout(timer); timer = null; };
      const start = event => {
        if (event.target.closest("button,input") || current?.status !== "open" || event.button === 2) return;
        clear();
        timer = setTimeout(() => { timer = null; monthSelectionMode = true; monthSelection.add(index); attachMonthLongPress(); }, 600);
      };
      row.addEventListener("pointerdown", start, { passive: true });
      ["pointerup", "pointerleave", "pointercancel"].forEach(type => row.addEventListener(type, clear, { passive: true }));
      row.addEventListener("contextmenu", event => event.preventDefault());
      row.addEventListener("click", event => {
        if (!monthSelectionMode || event.target.closest("button,input")) return;
        event.preventDefault(); event.stopPropagation();
        if (monthSelection.has(index)) monthSelection.delete(index); else monthSelection.add(index);
        attachMonthLongPress();
      });
      row.querySelectorAll("button").forEach(button => {
        const original = button.onclick;
        button.onclick = event => { if (monthSelectionMode) { event.preventDefault(); event.stopPropagation(); return; } original?.call(button,event); };
      });
    });
    toolbar.querySelector("[data-month-all]")?.addEventListener("click", () => { if (monthSelection.size === rows.length) monthSelection.clear(); else rows.forEach(row => monthSelection.add(Number(row.dataset.monthRow))); attachMonthLongPress(); });
    toolbar.querySelector("[data-month-cancel]")?.addEventListener("click", () => { monthSelection.clear(); monthSelectionMode = false; attachMonthLongPress(); });
    toolbar.querySelector("[data-month-delete]")?.addEventListener("click", async () => {
      if (!monthSelection.size || current?.status !== "open") return;
      const accepted = window.BEP_CONFIRM_ACTION ? await window.BEP_CONFIRM_ACTION("Retirer les " + monthSelection.size + " lignes sélectionnées de ce mois ?", "Suppression multiple") : window.confirm("Retirer les lignes sélectionnées de ce mois ?");
      if (!accepted) return;
      items = items.filter((_, index) => !monthSelection.has(index)); monthSelection.clear(); monthSelectionMode = false; editingItemId = null;
      $("monthlyBudgetItemForm").reset(); $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne"; $("monthlyBudgetItemCancel").hidden = true; renderItems();
      status("Lignes retirées. Enregistre ce mois pour confirmer les modifications.");
    });
  }
  let loading = false;
  let authEpoch = 0;
  let cacheOnlyMode = false;
  const CACHE_DB = "bep-monthly-history-cache-v1";
  const CACHE_STORE = "snapshots";
  const CACHE_USER_KEY = "bep-last-authenticated-user";
  let cacheDbPromise = null;
  function cacheIdentity() {
    try { return String(localStorage.getItem(CACHE_USER_KEY) || ""); } catch { return ""; }
  }
  function openCacheDb() {
    if (cacheDbPromise) return cacheDbPromise;
    cacheDbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponible"));
      const request = indexedDB.open(CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CACHE_STORE)) request.result.createObjectStore(CACHE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Ouverture du cache impossible"));
    });
    return cacheDbPromise;
  }
  async function readHistoryCache() {
    const user = cacheIdentity();
    if (!user) return null;
    const key = "monthly-history:" + user;
    try {
      const db = await openCacheDb();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      try { return JSON.parse(localStorage.getItem("bep-monthly-history-cache:" + user) || "null"); } catch { return null; }
    }
  }
  async function writeHistoryCache(snapshot) {
    const user = cacheIdentity();
    if (!user || !snapshot || !Array.isArray(snapshot.months)) return false;
    const key = "monthly-history:" + user;
    const value = { ...snapshot, user, savedAt: new Date().toISOString() };
    try {
      const db = await openCacheDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, "readwrite");
        tx.objectStore(CACHE_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Écriture du cache interrompue"));
      });
      return true;
    } catch {
      try { localStorage.setItem("bep-monthly-history-cache:" + user, JSON.stringify(value)); return true; } catch { return false; }
    }
  }
  async function cacheMonthList(nextMonths) {
    const previous = await readHistoryCache();
    return writeHistoryCache({ months: nextMonths, budgets: previous?.budgets || {} });
  }
  async function cacheMonthBudget(budget) {
    if (!budget?.monthKey || !Array.isArray(budget.items)) return;
    const previous = await readHistoryCache();
    const budgets = { ...(previous?.budgets || {}), [budget.monthKey]: budget };
    await writeHistoryCache({ months: months.length ? months : (previous?.months || []), budgets });
  }
  function applyOfflineReadOnly() {
    const offline = !navigator.onLine || cacheOnlyMode;
    const create = $("monthlyBudgetCreateForm");
    const itemForm = $("monthlyBudgetItemForm");
    const save = $("monthlyBudgetSave");
    const close = $("monthlyBudgetClose");
    const reopen = $("monthlyBudgetReopen");
    if (create) create.hidden = offline || !window.bepSignedIn;
    if (itemForm) itemForm.hidden = offline || !current || current.status === "closed";
    if (save) save.hidden = offline || !current || current.status === "closed";
    if (close) close.hidden = offline || !current || current.status === "closed";
    if (reopen) reopen.hidden = offline || !current || current.status !== "closed";
    const trigger = document.querySelector('[data-entry-dialog="monthly-item"]');
    if (trigger) trigger.hidden = offline || !current || current.status === "closed";
    card.querySelectorAll("[data-edit-month-item],[data-remove-month-item]").forEach(el => {
      el.disabled = offline || loading || current?.status === "closed";
    });
  }

  const money = value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
  function financialPosition() {
    return window.BEPFinancialEngine.calculate({
      incomes: items.filter(x => x.itemType === "income").map(x => ({ amount: x.plannedAmount })),
      budgets: items.filter(x => x.itemType === "charge").map(x => ({ amount: x.plannedAmount, category: x.category, nature: x.nature })),
      goals: items.filter(x => x.itemType === "savings").map(x => ({ monthly: x.plannedAmount })),
      expenses: actuals.expenses || [], monthKey: current?.monthKey, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }
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
    applyOfflineReadOnly();
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
    const itemTrigger = document.querySelector('[data-entry-dialog="monthly-item"]');
    if (itemTrigger) itemTrigger.hidden = !current || current.status === "closed" || !navigator.onLine || cacheOnlyMode;
    applyOfflineReadOnly();
  }
  function renderItems() {
    const labels = { income: "Revenus prévus", charge: "Charges prévues", savings: "Épargne prévue" };
    const query = String($("monthlyBudgetSearch")?.value || "").trim().toLocaleLowerCase("fr-FR");
    const sections = ["income", "charge", "savings"].map(type => {
      const rows = items.map((x, index) => ({ ...x, index })).filter(x => x.itemType === type &&
        (!query || (x.label + " " + (x.category || "")).toLocaleLowerCase("fr-FR").includes(query)));
      const total = rows.reduce((n, x) => n + Number(x.plannedAmount || 0), 0);
      return '<details class="monthly-budget-group"><summary><span>' + labels[type] +
        ' <small>' + rows.length + ' ligne(s)</small></span><b>' + money(total) + '</b></summary><div class="monthly-budget-group-rows">' +
        (rows.length ? rows.map(x => '<div class="monthly-budget-row" data-month-row="' + x.index + '"><span><b>' + escapeHtml(x.label) + '</b><small>' +
          (x.category ? escapeHtml(x.category) : labels[type]) + '</small></span><b>' + money(x.plannedAmount) + '</b><span class="monthly-budget-row-actions">' +
          '<button type="button" class="record-action edit-action" data-edit-month-item="' + x.index + '" aria-label="Modifier cette ligne" title="Modifier" ' + (current.status === "closed" || !navigator.onLine || cacheOnlyMode ? "disabled" : "") + '>✎</button>' +
          '<button type="button" class="record-action delete-action" data-remove-month-item="' + x.index + '" aria-label="Supprimer cette ligne" title="Supprimer" ' +
          (current.status === "closed" || !navigator.onLine || cacheOnlyMode ? "disabled" : "") + '>×</button></span></div>').join("") : '<p class="empty">Aucune ligne' +
          (query ? ' correspondant à la recherche.' : '.') + '</p>') + '</div></details>';
    }).join("");
    $("monthlyBudgetItems").innerHTML = sections || '<p class="empty">Aucune ligne dans ce mois.</p>';
    $("monthlyBudgetItems").querySelectorAll("[data-edit-month-item]").forEach(button => {
      button.onclick = () => {
        const item = items[Number(button.dataset.editMonthItem)];
        if (!item) return;
        editingItemId = item.clientId;
        $("monthlyBudgetItemType").value = item.itemType;
        $("monthlyBudgetItemLabel").value = item.label;
        $("monthlyBudgetItemCategory").value = item.category || "";
        $("monthlyBudgetItemAmount").value = item.plannedAmount;
        $("monthlyBudgetItemSubmit").textContent = "Enregistrer les modifications";
        $("monthlyBudgetItemCancel").hidden = false;
        if (window.BEP_OPEN_ENTRY_DIALOG) window.BEP_OPEN_ENTRY_DIALOG("monthly-item");
        else $("monthlyBudgetItemLabel").focus();
      };
    });
    attachMonthLongPress();
    $("monthlyBudgetItems").querySelectorAll("[data-remove-month-item]").forEach(button => {
      button.onclick = async () => {
        const index = Number(button.dataset.removeMonthItem);
        const accepted = window.BEP_CONFIRM_ACTION
          ? await window.BEP_CONFIRM_ACTION("Cette ligne sera retirée du budget mensuel. Enregistre ensuite le mois pour confirmer la modification.", "Retirer cette ligne")
          : window.confirm("Retirer cette ligne du budget mensuel ?");
        if (!accepted) return;
        items.splice(index, 1);
        editingItemId = null;
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
    const position = financialPosition();
    $("monthlyBudgetRemaining").textContent = money(position.available);
    $("monthlyBudgetActualTotal").textContent = money(position.actualExpenseTotal);
    $("monthlyBudgetActualCount").textContent = position.expenseCount + " ligne(s)";
    $("monthlyBudgetActualImpact").textContent = "Impact sur le disponible : " + money(position.actualImpact);
    $("monthlyBudgetActualError").hidden = !actualsError;
    $("monthlyBudgetActualError").textContent = actualsError;
    const actualRows = (actuals.expenses || []).filter(x => !query || (x.label + " " + (x.category || "")).toLocaleLowerCase("fr-FR").includes(query));
    $("monthlyBudgetActualRows").innerHTML = actualRows.length ? actualRows.map(x =>
      '<div class="monthly-budget-actual-row"><span><b>' + escapeHtml(x.label || "Dépense") + '</b><small>' +
      escapeHtml(x.category || "Sans catégorie") + ' · ' + new Date(x.at).toLocaleDateString("fr-FR") +
      '</small></span><b>' + money(x.amount) + '</b></div>').join("") : '<p class="empty">' +
      (query ? "Aucune dépense correspondant à la recherche." : "Aucune dépense réelle enregistrée pour ce mois.") + '</p>';
    $("monthlyBudgetSave").hidden = current.status === "closed";
    $("monthlyBudgetClose").hidden = current.status === "closed";
    $("monthlyBudgetReopen").hidden = current.status !== "closed";
    $("monthlyBudgetReason").hidden = current.status !== "closed";
    $("monthlyBudgetItemForm").hidden = current.status === "closed";
    const itemTrigger = document.querySelector('[data-entry-dialog="monthly-item"]');
    if (itemTrigger) itemTrigger.hidden = current.status === "closed";
  }
  async function loadMonth(monthKey, options = {}) {
    const epoch = authEpoch;
    setBusy(true);
    try {
      const timeZone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris");
      const actualRequest = api("/api/budgets/months/" + encodeURIComponent(monthKey) + "/actuals?timeZone=" + timeZone)
        .catch(error => ({ __error: error.message, expenses: [], actualExpenseTotal: "0.00", count: 0 }));
      let budget = options.budget || null;
      let fromCache = false;
      if (!budget && navigator.onLine && window.bepSignedIn) {
        try {
          budget = (await api("/api/budgets/months/" + encodeURIComponent(monthKey))).budget;
          cacheOnlyMode = false;
          await cacheMonthBudget(budget);
        } catch (networkError) {
          const cached = await readHistoryCache();
          budget = cached?.budgets?.[monthKey] || null;
          fromCache = Boolean(budget);
          cacheOnlyMode = fromCache;
          if (!budget) throw networkError;
        }
      } else if (!budget) {
        const cached = await readHistoryCache();
        budget = cached?.budgets?.[monthKey] || null;
        fromCache = Boolean(budget);
        cacheOnlyMode = fromCache;
        if (!budget) throw new Error("Ce mois n’est pas encore enregistré sur cet appareil. Reconnecte-toi pour le télécharger.");
      }
      const actualData = await actualRequest;
      if (epoch !== authEpoch || (!window.bepSignedIn && navigator.onLine)) return;
      actuals = actualData;
      actualsError = actualData.__error ? "Dépenses réelles indisponibles : " + actualData.__error : "";
      current = budget;
      editingItemId = null; monthSelection.clear(); monthSelectionMode = false;
      $("monthlyBudgetItemForm").reset();
      $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
      $("monthlyBudgetItemCancel").hidden = true;
      items = current.items.map(x => ({
        clientId: crypto.randomUUID(), itemType: x.itemType, sourceItemId: x.sourceItemId || x.id || null, label: x.label,
        category: x.category, nature: x.nature, plannedAmount: Number(x.plannedAmount), metadata: x.metadata || {}
      }));
      renderMonths();
      renderItems();
      status(fromCache
        ? "Copie locale consultée hors ligne · " + new Date((await readHistoryCache())?.savedAt || Date.now()).toLocaleString("fr-FR") + " · lecture seule."
        : (current.status === "closed" ? "Mois clôturé — consultation seule." : "Mois ouvert · version " + current.version));
    } catch (error) {
      status("Impossible de charger ce mois : " + error.message, true);
    } finally { setBusy(false); }
  }
  async function refresh() {
    if (loading) return;
    const epoch = authEpoch;
    setBusy(true);
    try {
      if (navigator.onLine && window.bepSignedIn) {
        const data = await api("/api/budgets/months");
        if (epoch !== authEpoch) return;
        months = data.months || [];
        await cacheMonthList(months);
        renderMonths();
        if (months.length) {
          await loadMonth(months[0].monthKey);
          const missing = months.filter(month => month.monthKey !== months[0].monthKey);
          for (let offset = 0; offset < missing.length; offset += 3) {
            await Promise.all(missing.slice(offset, offset + 3).map(async month => {
              try {
                const detail = await api("/api/budgets/months/" + encodeURIComponent(month.monthKey));
                await cacheMonthBudget(detail.budget);
              } catch { /* preserve last known snapshot */ }
            }));
          }
        } else {
          current = null; items = []; actuals = { expenses: [], actualExpenseTotal: "0.00", count: 0 }; actualsError = ""; renderMonths();
          status("Aucun historique mensuel. Crée le premier mois à partir de ton budget actuel.");
        }
      } else {
        const cached = await readHistoryCache();
        if (!cached || !Array.isArray(cached.months)) throw new Error("Aucun historique mensuel n’a encore été téléchargé sur cet appareil. Connecte-toi une fois pour le rendre disponible hors ligne.");
        months = cached.months;
        renderMonths();
        if (months.length) await loadMonth(months[0].monthKey);
        else {
          current = null; items = []; renderMonths();
          status("Aucun mois enregistré dans la copie locale.");
        }
      }
    } catch (error) {
      const cached = await readHistoryCache();
      if (cached && Array.isArray(cached.months) && cached.months.length) {
        months = cached.months;
        renderMonths();
        await loadMonth(months[0].monthKey);
        status("Serveur indisponible : dernière photographie du budget mensuel affichée en lecture seule.", true);
      } else {
        status(error.message === "MONTHLY_BUDGET_UNAVAILABLE"
          ? "Historique indisponible : migration non appliquée ou base temporairement inaccessible."
          : error.message || "Historique temporairement indisponible.", true);
      }
    } finally { setBusy(false); applyOfflineReadOnly(); }
  }

  $("monthlyBudgetMonth").onchange = event => loadMonth(event.target.value);
  $("monthlyBudgetSearch").oninput = () => { if (current) renderItems(); };
  $("monthlyBudgetCreateForm").onsubmit = async event => {
    event.preventDefault();
    if (loading || !navigator.onLine) return status("La création d’un budget mensuel nécessite une connexion.", true);
    const monthKey = $("monthlyBudgetNewMonth").value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return status("Choisis un mois valide.", true);
    const epoch = authEpoch;
    const first = months.length === 0;
    const source = first ? "current" : "previous";
    const payload = { monthKey, source };
    if (first) {
      payload.items = legacyItems();
      if (payload.items.length > 200) return status("Le budget actuel contient plus de 200 lignes. Réduis-le ou importe-le par lots après contrôle.", true);
      const confirmation = payload.items.length
        ? "Importer " + payload.items.length + " lignes de ton budget actuel dans " + monthKey + " ? Cette copie sera indépendante ; tes données actuelles ne seront pas supprimées."
        : "Aucun revenu, charge ou objectif n’a été trouvé dans le budget actuel. Créer un mois vide ?";
      const accepted = window.BEP_CONFIRM_ACTION
        ? await window.BEP_CONFIRM_ACTION(confirmation, "Confirmer la création du mois")
        : window.confirm(confirmation);
      if (!accepted) return;
    }
    setBusy(true);
    try {
      const data = await api("/api/budgets/months", { method: "POST", body: JSON.stringify(payload) });
      if (epoch !== authEpoch || !window.bepSignedIn) return;
      months = [data.budget, ...months.filter(x => x.monthKey !== monthKey)].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      await loadMonth(monthKey, { budget: data.budget });
      status(data.created ? "Mois créé. Les valeurs copiées sont indépendantes." : "Ce mois existait déjà ; aucune duplication effectuée.");
      window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"monthly-create"}}));
    } catch (error) { status("Création impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
  $("monthlyBudgetItemForm").onsubmit = event => {
    event.preventDefault();
    if (!navigator.onLine || cacheOnlyMode) return status("La modification d’un budget mensuel nécessite une connexion.", true);
    if (!current || current.status !== "open") return;
    const label = $("monthlyBudgetItemLabel").value.trim();
    const amount = Number($("monthlyBudgetItemAmount").value);
    if (!label || !Number.isFinite(amount) || amount < 0) return status("Libellé ou montant invalide.", true);
    const item = {
      itemType: $("monthlyBudgetItemType").value, label,
      category: $("monthlyBudgetItemCategory").value.trim() || null,
      plannedAmount: amount,
      clientId: editingItemId,
      sourceItemId: editingItemId === null ? crypto.randomUUID() : (items.find(x => x.clientId === editingItemId)?.sourceItemId || crypto.randomUUID()),
      metadata: editingItemId === null ? { source: "monthly-history" } : (items.find(x => x.clientId === editingItemId)?.metadata || { source: "monthly-history" })
    };
    if (editingItemId === null) {
      item.clientId = crypto.randomUUID();
      items.push(item);
    } else {
      const targetIndex = items.findIndex(x => x.clientId === editingItemId);
      if (targetIndex < 0) {
        editingItemId = null;
        return status("La ligne à modifier n’existe plus. Recharge le mois avant de réessayer.", true);
      }
      items[targetIndex] = item;
    }
    editingItemId = null;
    $("monthlyBudgetItemForm").reset();
    $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
    $("monthlyBudgetItemCancel").hidden = true;
    renderItems();
    window.dispatchEvent(new CustomEvent("bep:entry-saved",{detail:{id:"monthly-item"}}));
  };
  $("monthlyBudgetItemCancel").onclick = () => {
    editingItemId = null;
    $("monthlyBudgetItemForm").reset();
    $("monthlyBudgetItemSubmit").textContent = "Ajouter la ligne";
    $("monthlyBudgetItemCancel").hidden = true;
  };
  $("monthlyBudgetSave").onclick = async () => {
    if (!navigator.onLine || cacheOnlyMode) return status("L’enregistrement d’un budget mensuel nécessite une connexion.", true);
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
      await cacheMonthBudget(current);
      items = current.items.map(x => ({ ...x, clientId: crypto.randomUUID(), plannedAmount: Number(x.plannedAmount) }));
      renderItems();
      status("Budget enregistré · version " + current.version);
      try { await refreshMonthListOnly(); }
      catch (refreshError) {
        status("Budget mensuel enregistré · version " + current.version + ". Actualisation de la liste des mois impossible : " + refreshError.message, true);
      }
    } catch (error) { status(error.message === "VERSION_CONFLICT" ? "Ce budget a été modifié ailleurs. Recharge le mois avant de réessayer." : "Enregistrement impossible : " + error.message, true); }
    finally { setBusy(false); }
  };
  async function refreshMonthListOnly() {
    const data = await api("/api/budgets/months");
    months = data.months || [];
    renderMonths();
  }
  $("monthlyBudgetClose").onclick = async () => {
    if (!navigator.onLine || cacheOnlyMode) return status("La clôture d’un budget mensuel nécessite une connexion.", true);
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
    if (!navigator.onLine || cacheOnlyMode) return status("La réouverture d’un budget mensuel nécessite une connexion.", true);
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
    if (window.bepSignedIn || !navigator.onLine) refresh();
    else { months = []; current = null; items = []; actuals = { expenses: [], actualExpenseTotal: "0.00", count: 0 }; actualsError = ""; renderMonths(); setBusy(false); status("Connecte-toi pour consulter ton historique mensuel."); }
  });
  window.addEventListener("offline", () => { authEpoch++; refresh(); });
  window.addEventListener("online", () => { authEpoch++; if (window.bepSignedIn) refresh(); else applyOfflineReadOnly(); });
  if (window.bepSignedIn || !navigator.onLine) refresh();
})();
