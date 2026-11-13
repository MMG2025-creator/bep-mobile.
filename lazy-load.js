/* BEP feature asset loader. Core/auth remain eager; page-specific assets load on first use. */
(() => {
  "use strict";

  const loadedScripts = new Map();
  const loadedStyles = new Map();

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error("Impossible de charger le module " + src));
      };
      document.body.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function loadStyle(href) {
    if (loadedStyles.has(href)) return loadedStyles.get(href);
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => {
        loadedStyles.delete(href);
        reject(new Error("Impossible de charger la feuille de style " + href));
      };
      document.head.appendChild(link);
    });
    loadedStyles.set(href, promise);
    return promise;
  }

  const modules = {
    purchases: async () => {
      await Promise.all([
        loadStyle("./spend-experience.css?v=25&bep=lazy-20261113"),
        loadStyle("./spend-clean-ui.css?v=5&bep=lazy-20261113")
      ]);
      await loadScript("./spend-clean-ui.js?v=6&bep=lazy-20261113");
      await loadScript("./spend-experience.js?v=21&bep=lazy-20261113");
    },
    monthlyBudget: () => loadScript("./monthly-budget-ui.js?v=9&bep=lazy-20261113"),
    receiptOCR: () => loadScript("./receipt-ocr.js?v=3&bep=lazy-20261113")
  };

  const pending = new Map();
  window.BEPLoadModule = name => {
    if (!Object.prototype.hasOwnProperty.call(modules, name)) {
      return Promise.reject(new Error("Module BEP inconnu : " + name));
    }
    if (!pending.has(name)) {
      pending.set(name, Promise.resolve().then(modules[name]).catch(error => {
        pending.delete(name);
        console.error("[BEP lazy loading]", name, error);
        const toast = document.getElementById("toast");
        if (toast) {
          toast.textContent = "Une fonctionnalité n’a pas pu être chargée. Actualise la page et réessaie.";
          toast.classList.add("show");
        }
        throw error;
      }));
    }
    return pending.get(name);
  };

  document.addEventListener("click", event => {
    const purchasesTab = event.target.closest('.tab[data-tab="purchases"]');
    if (purchasesTab) window.BEPLoadModule("purchases").catch(() => {});

    const monthlyTab = event.target.closest('[data-budget-module="monthly"]');
    if (monthlyTab) window.BEPLoadModule("monthlyBudget").catch(() => {});
  });
})();
