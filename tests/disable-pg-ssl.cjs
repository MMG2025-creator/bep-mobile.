"use strict";

// Test-only preload: local PostgreSQL has no TLS and Google OAuth is simulated
// without contacting Google or using real credentials.
const pg = require("pg");
const OriginalPool = pg.Pool;
pg.Pool = class TestPool extends OriginalPool {
  constructor(config) {
    super({ ...config, ssl: false });
  }
};

const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url;
  if (url === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(init && init.body || "");
    if (body.get("code") !== "isolated-google-code" ||
        body.get("client_id") !== "isolated-google-client" ||
        body.get("client_secret") !== "isolated-google-secret") {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ access_token: "isolated-google-access-token" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
  if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
    if (!init || !init.headers || init.headers.authorization !== "Bearer isolated-google-access-token") {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      sub: "isolated-google-subject",
      email: "google-flow@example.test",
      email_verified: true,
      name: "Google Flow",
      picture: "https://example.test/avatar.png"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return originalFetch(input, init);
};
