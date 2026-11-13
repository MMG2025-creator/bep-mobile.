"use strict";

// Test-only preload: Render uses TLS for PostgreSQL, while the isolated GitHub Actions
// postgres service is local and intentionally runs without TLS.
const pg = require("pg");
const OriginalPool = pg.Pool;
pg.Pool = class TestPool extends OriginalPool {
  constructor(config) {
    super({ ...config, ssl: false });
  }
};
