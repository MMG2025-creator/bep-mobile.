"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createMonthlyBudgetRouter } = require("../monthly-budget-routes");

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  test("PostgreSQL integration suite requires TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  let adminPool, pool, server, baseUrl, schema;
  const userA = "monthly-test-user-a";
  const userB = "monthly-test-user-b";

  test("monthly budget API preserves isolation, versioning, copies and audit", async t => {
    adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
    schema = "bep_monthly_test_" + process.pid + "_" + Date.now();
    await adminPool.query('CREATE SCHEMA "' + schema + '"');
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      options: '-c search_path="' + schema + '"'
    });
    await pool.query("CREATE TABLE bep_users(id TEXT PRIMARY KEY)");
    await pool.query("INSERT INTO bep_users(id) VALUES($1),($2)", [userA, userB]);
    const migration = await fs.readFile(path.join(__dirname, "../database/migrations/20261111_monthly_budget_history.sql"), "utf8");
    await pool.query(migration);

    const app = express();
    app.use(express.json({ limit: "1mb" }));
    const auth = (req, res, next) => {
      const userId = req.headers["x-test-user"];
      if (!userId) return res.status(401).json({ error: "UNAUTHENTICATED" });
      req.session = { user: { id: userId } };
      next();
    };
    app.use("/api/budgets", createMonthlyBudgetRouter({ pool, auth }));
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = "http://127.0.0.1:" + server.address().port;
    const call = async (user, route, method = "GET", body) => {
      const response = await fetch(baseUrl + "/api/budgets" + route, {
        method,
        headers: { "x-test-user": user, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: response.status, data: await response.json() };
    };

    await t.test("rejects unauthenticated requests", async () => {
      const response = await fetch(baseUrl + "/api/budgets/months");
      assert.equal(response.status, 401);
    });

    await t.test("creates and reads a month only for its owner", async () => {
      const created = await call(userA, "/months", "POST", {
        monthKey: "2026-11", source: "current",
        items: [
          { itemType: "income", label: "Salaire", plannedAmount: 3000 },
          { itemType: "charge", label: "Loyer", plannedAmount: 1000 },
          { itemType: "savings", label: "Épargne", plannedAmount: 300 }
        ]
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.budget.plannedIncomeTotal, "3000.00");
      assert.equal(created.data.budget.plannedChargesTotal, "1000.00");
      assert.equal(created.data.budget.plannedSavingsTotal, "300.00");
      const foreign = await call(userB, "/months/2026-11");
      assert.equal(foreign.status, 404);
      const own = await call(userA, "/months/2026-11");
      assert.equal(own.status, 200);
      assert.equal(own.data.budget.items.length, 3);
    });

    await t.test("copies previous month as independent snapshot", async () => {
      const created = await call(userA, "/months", "POST", { monthKey: "2026-12", source: "previous" });
      assert.equal(created.status, 201);
      assert.equal(created.data.budget.items.length, 3);
      const changed = await call(userA, "/months/2026-12", "PUT", {
        expectedVersion: 1,
        items: [{ itemType: "charge", label: "Nouveau loyer", plannedAmount: 1200 }]
      });
      assert.equal(changed.status, 200);
      const november = await call(userA, "/months/2026-11");
      assert.equal(november.data.budget.items.length, 3);
      assert.equal(november.data.budget.plannedChargesTotal, "1000.00");
    });

    await t.test("rejects stale writes and closed-month edits", async () => {
      const stale = await call(userA, "/months/2026-12", "PUT", {
        expectedVersion: 1, items: []
      });
      assert.equal(stale.status, 409);
      const close = await call(userA, "/months/2026-12/close", "POST", { expectedVersion: 2 });
      assert.equal(close.status, 200);
      const update = await call(userA, "/months/2026-12", "PUT", {
        expectedVersion: 3, items: []
      });
      assert.equal(update.status, 409);
      const reopen = await call(userA, "/months/2026-12/reopen", "POST", {
        expectedVersion: 3, reason: "Correction validée"
      });
      assert.equal(reopen.status, 200);
    });

    await t.test("is idempotent and validates inputs", async () => {
      const duplicate = await call(userA, "/months", "POST", { monthKey: "2026-11", source: "empty" });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.data.created, false);
      const invalid = await call(userA, "/months", "POST", { monthKey: "2026-13", source: "empty" });
      assert.equal(invalid.status, 400);
      const audit = await pool.query("SELECT action FROM bep_budget_audit_log ORDER BY id");
      assert.ok(audit.rows.some(x => x.action === "imported"));
      assert.ok(audit.rows.some(x => x.action === "created"));
      assert.ok(audit.rows.some(x => x.action === "updated"));
      assert.ok(audit.rows.some(x => x.action === "closed"));
      assert.ok(audit.rows.some(x => x.action === "reopened"));
    });
  });

  test("cleanup monthly budget PostgreSQL integration fixture", async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (adminPool && schema) {
      await adminPool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminPool.end();
    }
  });
}
