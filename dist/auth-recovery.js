(() => {
  "use strict";
  const API = "https://bep-v2-api.onrender.com";
  const $ = (id) => document.getElementById(id);
  const login = $("loginForm");
  const register = $("registerForm");
  const verify = $("verifyEmailForm");
  const forgot = $("forgotPasswordForm");
  const reset = $("resetPasswordForm");
  const forgotLink = $("forgotPasswordLink");
  const authMessage = $("authMessage");
  if (!login || !forgot || !reset || !forgotLink || !authMessage) return;

  const setMode = (mode) => {
    const showLogin = mode === "login";
    const showRegister = mode === "register";
    login.hidden = !showLogin;
    register.hidden = !showRegister;
    if (verify) verify.hidden = true;
    forgot.hidden = mode !== "forgot";
    reset.hidden = mode !== "reset";
    forgotLink.hidden = !showLogin;
    const switcher = document.querySelector(".auth-switch");
    const google = $("googleLogin");
    const divider = document.querySelector(".auth-divider");
    if (switcher) switcher.hidden = mode === "forgot" || mode === "reset";
    if (google) google.hidden = mode === "forgot" || mode === "reset";
    if (divider) divider.hidden = mode === "forgot" || mode === "reset";
  };

  $("showLogin")?.addEventListener("click", () => {
    setMode("login");
    authMessage.textContent = "";
  });
  $("showRegister")?.addEventListener("click", () => {
    setMode("register");
    authMessage.textContent = "";
  });
  forgotLink.addEventListener("click", (event) => {
    event.preventDefault();
    $("forgotPasswordEmail").value = $("loginEmail")?.value.trim() || "";
    setMode("forgot");
    authMessage.textContent = "Saisis l’adresse e-mail associée à ton compte BEP.";
    $("forgotPasswordEmail").focus();
  });
  $("cancelForgotPassword")?.addEventListener("click", () => {
    setMode("login");
    authMessage.textContent = "";
  });

  forgot.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("forgotPasswordEmail").value.trim().toLowerCase();
    const button = forgot.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Envoi en cours…";
    authMessage.textContent = "";
    try {
      const response = await fetch(API + "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de traiter la demande.");
      authMessage.textContent = data.message || "Si un compte correspond à cette adresse, un lien sera envoyé.";
      forgot.reset();
    } catch (error) {
      authMessage.textContent = error.message || "Le service est temporairement indisponible.";
    } finally {
      button.disabled = false;
      button.textContent = "Recevoir mon lien de réinitialisation";
    }
  });

  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("reset") || "";
  if (resetToken) {
    history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setMode("reset");
    authMessage.textContent = "Choisis un nouveau mot de passe pour ton compte BEP.";
  } else {
    setMode("login");
  }

  reset.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("resetPassword").value;
    const confirmation = $("resetPasswordConfirm").value;
    if (password.length < 10 || password.length > 128) {
      authMessage.textContent = "Le mot de passe doit contenir entre 10 et 128 caractères.";
      return;
    }
    if (password !== confirmation) {
      authMessage.textContent = "Les deux mots de passe ne correspondent pas.";
      $("resetPasswordConfirm").focus();
      return;
    }
    const button = reset.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Réinitialisation…";
    try {
      const response = await fetch(API + "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: resetToken, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Ce lien est invalide ou expiré.");
      reset.reset();
      history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      setMode("login");
      authMessage.textContent = "Mot de passe réinitialisé. Tu peux maintenant te connecter.";
      $("loginEmail")?.focus();
    } catch (error) {
      authMessage.textContent = error.message || "La réinitialisation a échoué. Demande un nouveau lien.";
    } finally {
      button.disabled = false;
      button.textContent = "Réinitialiser mon mot de passe";
    }
  });
})();
