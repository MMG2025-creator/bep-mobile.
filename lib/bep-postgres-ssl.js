"use strict";

/**
 * Render Postgres connection policy:
 * - Internal Render URLs omit sslmode; they use the private network.
 * - External Render URLs include sslmode=require; enforce certificate validation
 *   against Node's system trust store (Render-managed certificates).
 *
 * Never use rejectUnauthorized:false: it encrypts traffic without authenticating
 * the server and permits a man-in-the-middle.
 */
function getPostgresSslConfig(connectionString) {
  let url;
  try {
    url = new URL(String(connectionString || ""));
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  const mode = url.searchParams.get("sslmode");
  if (mode === null || mode === "") return false;

  if (["require", "verify-ca", "verify-full"].includes(mode)) {
    return { rejectUnauthorized: true };
  }

  throw new Error("Unsupported or insecure DATABASE_URL sslmode: " + mode);
}

module.exports = { getPostgresSslConfig };
