"use strict";

function createHealthHandler({ pool, isDatabaseReady, isAuthConfigured }) {
  return async function healthHandler(req, res) {
    let databaseReady = false;
    let databaseError = false;

    if (pool && isDatabaseReady()) {
      try {
        await pool.query("SELECT 1");
        databaseReady = true;
      } catch (error) {
        databaseError = true;
      }
    }

    const ready = Boolean(pool && databaseReady);
    const payload = {
      ok: ready,
      authConfigured: Boolean(isAuthConfigured()),
      databaseConfigured: Boolean(pool),
      databaseReady
    };

    if (databaseError || (pool && !databaseReady)) {
      payload.databaseError = "DATABASE_NOT_READY";
    }

    return res.status(ready ? 200 : 503).json(payload);
  };
}

module.exports = { createHealthHandler };
