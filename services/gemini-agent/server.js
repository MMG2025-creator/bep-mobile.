"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
const allowed = new Map([
  ["/api/knowledge", "knowledge-bep-coach.json"],
  ["/api/reasoning", "reasoning-bep-coach.json"]
]);

function readSnapshot(filename) {
  const fullPath = path.join(dataDir, filename);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
  }

  if (req.url === "/api/health") {
    try {
      const knowledge = readSnapshot("knowledge-bep-coach.json");
      const reasoning = readSnapshot("reasoning-bep-coach.json");
      res.writeHead(200);
      return res.end(JSON.stringify({
        ok: true,
        service: "bep-gemini-peripheral",
        database_connected: false,
        personal_data_loaded: false,
        snapshots: {
          knowledge_version: knowledge.schema_version,
          reasoning_version: reasoning.schema_version,
          knowledge_documents: knowledge.documents.length,
          reasoning_scenarios: reasoning.scenarios.length
        }
      }));
    } catch {
      res.writeHead(503);
      return res.end(JSON.stringify({ ok: false, error: "SNAPSHOTS_NOT_READY" }));
    }
  }

  const filename = allowed.get(req.url);
  if (!filename) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: "NOT_FOUND" }));
  }

  try {
    const snapshot = readSnapshot(filename);
    res.writeHead(200);
    return res.end(JSON.stringify(snapshot));
  } catch {
    res.writeHead(503);
    return res.end(JSON.stringify({ error: "SNAPSHOT_UNAVAILABLE" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write("BEP Gemini peripheral JSON service listening on " + port + "\n");
});
