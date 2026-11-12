"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rollbackAndRespond } = require("./transaction-guard");

test("rollback completes before an error response is sent", async () => {
  const events = [];
  const client = { query: async (sql) => { events.push(sql); } };
  const response = {
    status(code) { events.push(`status:${code}`); return this; },
    json(body) { events.push(`json:${body.error}`); return body; }
  };

  const result = await rollbackAndRespond(client, response, 400, "INVALID_SAVINGS_LEDGER");

  assert.deepEqual(events, ["ROLLBACK", "status:400", "json:INVALID_SAVINGS_LEDGER"]);
  assert.deepEqual(result, { error: "INVALID_SAVINGS_LEDGER" });
});

test("rollback failure propagates instead of pretending the transaction was released", async () => {
  const client = { query: async () => { throw new Error("rollback failed"); } };
  const response = { status() { throw new Error("response must not be sent"); } };

  await assert.rejects(
    rollbackAndRespond(client, response, 400, "INVALID_SAVINGS_LEDGER"),
    /rollback failed/
  );
});
