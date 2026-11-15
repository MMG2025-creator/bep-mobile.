/* Resolve the API target per environment. Preview hosts must never inherit production. */
(() => {
  const host = String(window.location.hostname || "").toLowerCase();
  const productionHost = host === "bep-mobile.onrender.com";
  const configured = window.BEP_API_BASE || (productionHost ? "https://bep-v2-api.onrender.com" : window.location.origin);
  window.BEP_API_BASE = String(configured).replace(/\/+$/, "");
})();