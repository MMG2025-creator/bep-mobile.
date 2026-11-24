"use strict";

const RETENTION_DAYS = 35;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LOCK_KEY = "bep_user_activity_days_retention";

async function purgeExpiredActivityRows(pool) {
  if (!pool || typeof pool.connect !== "function") return { skipped: true, deleted: 0 };
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [LOCK_KEY]);
    locked = lock.rows?.[0]?.acquired === true;
    if (!locked) return { skipped: true, deleted: 0 };
    const result = await client.query(
      "DELETE FROM bep_user_activity_days WHERE last_activity_at < NOW() - ($1::text || ' days')::interval",
      [String(RETENTION_DAYS)]
    );
    return { skipped: false, deleted: Number(result.rowCount || 0) };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

function startActivityRetentionScheduler(pool, {
  intervalMs = CLEANUP_INTERVAL_MS,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  if (!pool) return null;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await purgeExpiredActivityRows(pool);
      if (!result.skipped && result.deleted > 0 && typeof logger.info === "function") {
        logger.info("BEP activity retention cleanup completed", JSON.stringify({ deleted: result.deleted, retentionDays: RETENTION_DAYS }));
      }
    } catch (error) {
      if (typeof logger.warn === "function") logger.warn("BEP activity retention cleanup failed", String(error?.message || error).slice(0, 160));
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setIntervalFn(run, intervalMs);
  if (timer && typeof timer.unref === "function") timer.unref();
  return timer;
}

module.exports = { RETENTION_DAYS, CLEANUP_INTERVAL_MS, purgeExpiredActivityRows, startActivityRetentionScheduler };
