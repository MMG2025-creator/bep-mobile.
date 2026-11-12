"use strict";

async function rollbackAndRespond(client, res, status, error) {
  await client.query("ROLLBACK");
  return res.status(status).json({ error });
}

module.exports = { rollbackAndRespond };
