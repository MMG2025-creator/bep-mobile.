"use strict";

const express = require("express");

const TYPES = new Set(["income", "charge", "savings"]);
const MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;
const MAX_ITEMS = 200;
const MAX_AMOUNT = 999999999999.99;

function validMonth(value) {
  if (typeof value !== "string") return false;
  const match = MONTH_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2099;
}

function validateItems(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (typeof item.itemType !== "string") return null;
    const itemType = item.itemType;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (item.plannedAmount == null || !["number", "string"].includes(typeof item.plannedAmount) || (typeof item.plannedAmount === "string" && !item.plannedAmount.trim())) return null;
    const amount = Number(item.plannedAmount);
    if (!TYPES.has(itemType) || !label || label.length > 160 ||
        !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null;
    if ((item.category != null && typeof item.category !== "string") || (item.nature != null && typeof item.nature !== "string") || (item.sourceItemId != null && typeof item.sourceItemId !== "string")) return null;
    const category = item.category == null ? null : item.category.trim();
    const nature = item.nature == null ? null : item.nature.trim();
    const sourceItemId = item.sourceItemId == null ? null : item.sourceItemId.slice(0, 120);
    const metadata = item.metadata == null ? {} : item.metadata;
    if ((category && category.length > 80) || (nature && nature.length > 40) ||
        !metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
        JSON.stringify(metadata).length > 4000) return null;
    rows.push({ itemType, label, amount: amount.toFixed(2), category, nature, sourceItemId, metadata });
  }
  const grouped = { income: 0, charge: 0, savings: 0 };
  for (const row of rows) grouped[row.itemType] += Number(row.amount);
  if (Object.values(grouped).some(amount => !Number.isFinite(amount) || amount > MAX_AMOUNT)) return null;
  return rows;
}

function totals(items) {
  const result = { income: 0, charge: 0, savings: 0 };
  for (const item of items) result[item.itemType] += Number(item.amount);
  for (const key of Object.keys(result)) result[key] = result[key].toFixed(2);
  return result;
}

function snapshot(budget, items) {
  return {
    monthKey: String(budget.month_key).slice(0, 7),
    status: budget.status,
    currency: budget.currency,
    version: Number(budget.version),
    plannedIncomeTotal: budget.planned_income_total,
    plannedChargesTotal: budget.planned_charges_total,
    plannedSavingsTotal: budget.planned_savings_total,
    items: items.map(x => ({
      id: x.id, itemType: x.item_type, sourceItemId: x.source_item_id,
      label: x.label, category: x.category, nature: x.nature,
      plannedAmount: x.planned_amount, metadata: x.metadata
    }))
  };
}

function createMonthlyBudgetRouter({ pool, auth }) {
  const router = express.Router();

  router.get("/months", auth, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT month_key,status,version,planned_income_total,planned_charges_total,planned_savings_total FROM bep_monthly_budgets WHERE user_id=$1 ORDER BY month_key DESC",
        [req.session.user.id]
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ months: result.rows.map(x => ({
        monthKey: String(x.month_key).slice(0, 7), status: x.status,
        version: Number(x.version), plannedIncomeTotal: x.planned_income_total,
        plannedChargesTotal: x.planned_charges_total, plannedSavingsTotal: x.planned_savings_total
      })) });
    } catch (error) {
      console.error("Monthly budget list failed", error.message);
      res.status(503).json({ error: "MONTHLY_BUDGET_UNAVAILABLE" });
    }
  });

  router.post("/months", auth, async (req, res) => {
    const monthKey = req.body?.monthKey;
    const source = req.body?.source || "empty";
    const initialItems = source === "current" ? validateItems(req.body?.items) : [];
    if (!validMonth(monthKey) || !["empty", "previous", "current"].includes(source) || (source === "current" && !initialItems))
      return res.status(400).json({ error: "MONTH_OR_SOURCE_INVALID" });
    const userId = req.session.user.id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO bep_monthly_budgets(user_id,month_key) VALUES($1,$2::date) ON CONFLICT(user_id,month_key) DO NOTHING RETURNING *",
        [userId, monthKey + "-01"]
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          "SELECT * FROM bep_monthly_budgets WHERE user_id=$1 AND month_key=$2::date",
          [userId, monthKey + "-01"]
        );
        const rows = await client.query(
          "SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",
          [existing.rows[0].id]
        );
        await client.query("COMMIT");
        return res.json({ created: false, budget: snapshot(existing.rows[0], rows.rows) });
      }
      const budget = inserted.rows[0];
      let copied = [];
      if (source === "current") {
        copied = initialItems.map(item => ({ item_type: item.itemType, source_item_id: item.sourceItemId, label: item.label, category: item.category, nature: item.nature, planned_amount: item.amount, metadata: item.metadata }));
        for (const item of copied) {
          await client.query(
            "INSERT INTO bep_monthly_budget_items(budget_id,item_type,source_item_id,label,category,nature,planned_amount,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
            [budget.id,item.item_type,item.source_item_id,item.label,item.category,item.nature,item.planned_amount,JSON.stringify(item.metadata)]
          );
        }
      } else if (source === "previous") {
        const previous = await client.query(
          "SELECT id FROM bep_monthly_budgets WHERE user_id=$1 AND month_key < $2::date ORDER BY month_key DESC LIMIT 1",
          [userId, monthKey + "-01"]
        );
        if (previous.rowCount) {
          const previousItems = await client.query(
            "SELECT item_type,source_item_id,label,category,nature,planned_amount,metadata FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",
            [previous.rows[0].id]
          );
          copied = previousItems.rows;
          for (const item of copied) {
            await client.query(
              "INSERT INTO bep_monthly_budget_items(budget_id,item_type,source_item_id,label,category,nature,planned_amount,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
              [budget.id,item.item_type,item.source_item_id,item.label,item.category,item.nature,item.planned_amount,JSON.stringify(item.metadata)]
            );
          }
        }
      }
      const sums = { income: 0, charge: 0, savings: 0 };
      for (const item of copied) sums[item.item_type] += Number(item.planned_amount);
      const updated = await client.query(
        "UPDATE bep_monthly_budgets SET planned_income_total=$2,planned_charges_total=$3,planned_savings_total=$4,updated_at=NOW() WHERE id=$1 RETURNING *",
        [budget.id,sums.income.toFixed(2),sums.charge.toFixed(2),sums.savings.toFixed(2)]
      );
      const after = { monthKey, status: "open", source, copiedItems: copied.length };
      await client.query(
        "INSERT INTO bep_budget_audit_log(user_id,budget_id,action,after_state) VALUES($1,$2,$3,$4::jsonb)",
        [userId,budget.id,source === "current" ? "imported" : "created",JSON.stringify(after)]
      );
      const rows = await client.query("SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",[budget.id]);
      await client.query("COMMIT");
      res.status(201).json({ created: true, budget: snapshot(updated.rows[0], rows.rows) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Monthly budget creation failed", error.message);
      res.status(503).json({ error: "MONTHLY_BUDGET_CREATE_FAILED" });
    } finally {
      client.release();
    }
  });

  router.get("/months/:monthKey", auth, async (req, res) => {
    const monthKey = req.params.monthKey;
    if (!validMonth(monthKey)) return res.status(400).json({ error: "MONTH_INVALID" });
    try {
      const result = await pool.query(
        "SELECT * FROM bep_monthly_budgets WHERE user_id=$1 AND month_key=$2::date",
        [req.session.user.id, monthKey + "-01"]
      );
      if (!result.rowCount) return res.status(404).json({ error: "MONTH_NOT_FOUND" });
      const rows = await pool.query(
        "SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",
        [result.rows[0].id]
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ budget: snapshot(result.rows[0], rows.rows) });
    } catch (error) {
      console.error("Monthly budget read failed", error.message);
      res.status(503).json({ error: "MONTHLY_BUDGET_UNAVAILABLE" });
    }
  });

  router.put("/months/:monthKey", auth, async (req, res) => {
    const monthKey = req.params.monthKey;
    const expectedVersion = req.body?.expectedVersion;
    const items = validateItems(req.body?.items);
    if (!validMonth(monthKey) || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !items)
      return res.status(400).json({ error: "MONTHLY_BUDGET_PAYLOAD_INVALID" });
    const userId = req.session.user.id;
    const sums = totals(items);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query(
        "SELECT * FROM bep_monthly_budgets WHERE user_id=$1 AND month_key=$2::date FOR UPDATE",
        [userId, monthKey + "-01"]
      );
      if (!before.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "MONTH_NOT_FOUND" }); }
      if (before.rows[0].status !== "open") { await client.query("ROLLBACK"); return res.status(409).json({ error: "MONTH_CLOSED" }); }
      if (Number(before.rows[0].version) !== expectedVersion) { await client.query("ROLLBACK"); return res.status(409).json({ error: "VERSION_CONFLICT" }); }
      const beforeItems = await client.query("SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",[before.rows[0].id]);
      const beforeState = snapshot(before.rows[0], beforeItems.rows);
      const updated = await client.query(
        "UPDATE bep_monthly_budgets SET planned_income_total=$2,planned_charges_total=$3,planned_savings_total=$4,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",
        [before.rows[0].id,sums.income,sums.charge,sums.savings]
      );
      await client.query("DELETE FROM bep_monthly_budget_items WHERE budget_id=$1",[before.rows[0].id]);
      for (const item of items) {
        await client.query(
          "INSERT INTO bep_monthly_budget_items(budget_id,item_type,source_item_id,label,category,nature,planned_amount,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
          [before.rows[0].id,item.itemType,item.sourceItemId,item.label,item.category,item.nature,item.amount,JSON.stringify(item.metadata)]
        );
      }
      const afterItems = await client.query("SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",[before.rows[0].id]);
      const afterState = snapshot(updated.rows[0], afterItems.rows);
      await client.query(
        "INSERT INTO bep_budget_audit_log(user_id,budget_id,action,before_state,after_state) VALUES($1,$2,'updated',$3::jsonb,$4::jsonb)",
        [userId,before.rows[0].id,JSON.stringify(beforeState),JSON.stringify(afterState)]
      );
      await client.query("COMMIT");
      res.json({ budget: afterState });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Monthly budget update failed", error.message);
      res.status(503).json({ error: "MONTHLY_BUDGET_UPDATE_FAILED" });
    } finally {
      client.release();
    }
  });

  async function changeStatus(req, res, status) {
    const monthKey = req.params.monthKey;
    const expectedVersion = req.body?.expectedVersion;
    const reason = req.body?.reason == null ? null : String(req.body.reason).trim();
    if (!validMonth(monthKey) || !Number.isInteger(expectedVersion) || expectedVersion < 1 ||
        (status === "open" && (!reason || reason.length > 500)))
      return res.status(400).json({ error: "MONTHLY_BUDGET_STATUS_INVALID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query(
        "SELECT * FROM bep_monthly_budgets WHERE user_id=$1 AND month_key=$2::date FOR UPDATE",
        [req.session.user.id, monthKey + "-01"]
      );
      if (!before.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "MONTH_NOT_FOUND" }); }
      const desired = status === "closed" ? "closed" : "open";
      if (before.rows[0].status === desired) {
        await client.query("COMMIT");
        return res.json({ ok: true, changed: false, status: desired, version: Number(before.rows[0].version) });
      }
      if (Number(before.rows[0].version) !== expectedVersion) { await client.query("ROLLBACK"); return res.status(409).json({ error: "VERSION_CONFLICT" }); }
      const items = await client.query("SELECT * FROM bep_monthly_budget_items WHERE budget_id=$1 ORDER BY created_at,id",[before.rows[0].id]);
      const beforeState = snapshot(before.rows[0], items.rows);
      const updated = await client.query(
        "UPDATE bep_monthly_budgets SET status=$2,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",
        [before.rows[0].id,desired]
      );
      const afterState = snapshot(updated.rows[0], items.rows);
      await client.query(
        "INSERT INTO bep_budget_audit_log(user_id,budget_id,action,before_state,after_state,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
        [req.session.user.id,before.rows[0].id,status === "closed" ? "closed" : "reopened",JSON.stringify(beforeState),JSON.stringify(afterState),reason]
      );
      await client.query("COMMIT");
      res.json({ ok: true, changed: true, budget: afterState });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Monthly budget status change failed", error.message);
      res.status(503).json({ error: "MONTHLY_BUDGET_STATUS_FAILED" });
    } finally {
      client.release();
    }
  }

  router.post("/months/:monthKey/close", auth, (req, res) => changeStatus(req, res, "closed"));
  router.post("/months/:monthKey/reopen", auth, (req, res) => changeStatus(req, res, "open"));

  return router;
}

module.exports = { createMonthlyBudgetRouter, validMonth, validateItems, totals };
