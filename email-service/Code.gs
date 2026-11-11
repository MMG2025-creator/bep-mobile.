/**
 * BEP transactional mail bridge — Google Apps Script (V8 runtime)
 *
 * Required Script Property:
 *   BEP_MAIL_SECRET = same value as Render's BEP_MAIL_SECRET
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The endpoint authenticates every POST with the shared secret.
 */

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var properties = PropertiesService.getScriptProperties();
    var expectedSecret = properties.getProperty("BEP_MAIL_SECRET");

    if (!expectedSecret || !constantTimeEquals_(String(payload.secret || ""), expectedSecret)) {
      return json_({ ok: false, error: "UNAUTHORIZED" });
    }

    var email = String(payload.email || "").trim().toLowerCase();
    if (!isValidEmail_(email)) {
      return json_({ ok: false, error: "INVALID_EMAIL" });
    }

    var type = String(payload.type || "email_verification");
    var subject;
    var textBody;
    var htmlBody;

    if (type === "password_reset") {
      var resetUrl = String(payload.resetUrl || payload.code || "").trim();
      if (!isAllowedResetUrl_(resetUrl)) {
        return json_({ ok: false, error: "INVALID_RESET_URL" });
      }

      subject = "Réinitialisation du mot de passe BEP";
      textBody = [
        "Bonjour,",
        "",
        "Tu as demandé à réinitialiser le mot de passe de ton compte BEP.",
        "Utilise ce lien sécurisé pour choisir un nouveau mot de passe :",
        resetUrl,
        "",
        "Ce lien est valable 30 minutes et ne peut être utilisé qu'une seule fois.",
        "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.",
        "",
        "L'équipe BEP"
      ].join("\n");

      var safeUrl = escapeHtml_(resetUrl);
      htmlBody = emailShell_(
        "Réinitialisation du mot de passe",
        "<p>Tu as demandé à réinitialiser le mot de passe de ton compte BEP.</p>" +
        "<p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>" +
        '<p style="text-align:center;margin:30px 0">' +
        '<a href="' + safeUrl + '" style="display:inline-block;padding:14px 24px;background:#176b50;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Choisir un nouveau mot de passe</a>' +
        "</p>" +
        "<p style=\"font-size:13px;color:#52645b\">Ce lien expire dans 30 minutes et ne peut être utilisé qu'une seule fois.</p>" +
        "<p style=\"font-size:13px;color:#52645b\">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>" +
        '<p style="font-size:12px;word-break:break-all"><a href="' + safeUrl + '">' + safeUrl + "</a></p>" +
        "<p>Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>"
      );
    } else if (type === "email_verification") {
      var code = String(payload.code || "").trim();
      if (!/^\d{6}$/.test(code)) {
        return json_({ ok: false, error: "INVALID_CODE" });
      }

      subject = "Vérification de ton adresse e-mail BEP";
      textBody = [
        "Bonjour,",
        "",
        "Voici ton code de vérification BEP : " + code,
        "",
        "Ce code est valable 10 minutes.",
        "",
        "L'équipe BEP"
      ].join("\n");
      htmlBody = emailShell_(
        "Vérifie ton adresse e-mail",
        "<p>Voici ton code de vérification BEP :</p>" +
        '<p style="text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:#176b50;margin:26px 0">' +
        escapeHtml_(code) + "</p>" +
        "<p style=\"font-size:13px;color:#52645b\">Ce code est valable 10 minutes.</p>"
      );
    } else {
      return json_({ ok: false, error: "UNSUPPORTED_TYPE" });
    }

    GmailApp.sendEmail(email, subject, textBody, {
      htmlBody: htmlBody,
      name: "BEP — Build, Earn & Preserve"
    });

    return json_({ ok: true });
  } catch (error) {
    console.error("BEP mail bridge failed: " + String(error && error.message || error));
    return json_({ ok: false, error: "MAIL_SEND_FAILED" });
  }
}

function emailShell_(heading, content) {
  return [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f2;font-family:Arial,Helvetica,sans-serif;color:#18352c">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">',
    '<tr><td style="padding:24px 28px;background:#102e29;color:#e8d18a;font-size:24px;font-weight:700;letter-spacing:2px">BEP</td></tr>',
    '<tr><td style="padding:30px 28px"><h1 style="font-size:22px;margin:0 0 20px;color:#18352c">' + heading + "</h1>",
    content,
    '<p style="margin-top:30px;color:#52645b">L’équipe BEP</p></td></tr>',
    '<tr><td style="padding:16px 28px;background:#f7f9f7;color:#718078;font-size:11px">Build • Earn • Preserve</td></tr>',
    "</table></td></tr></table></body></html>"
  ].join("");
}

function isAllowedResetUrl_(value) {
  var prefix = "https://bep-mobile.onrender.com/?reset=";
  return value.indexOf(prefix) === 0 &&
    /^[a-f0-9]{64}$/.test(value.slice(prefix.length));
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
  });
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
