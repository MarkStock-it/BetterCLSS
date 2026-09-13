const { createApp } = require('./server/app');
const dbStore = require('./user-storage-db');

const { app, config } = createApp(__dirname);

if (require.main === module) {
  // Restore durable user data from MariaDB (no-op when DB not configured)
  // before accepting traffic, so returning users see their saved state.
  dbStore.restoreAllFromDb().finally(() => {
    app.listen(config.port, () => {
      console.log(`BetterCLSS running on http://localhost:${config.port}`);
    });
  });
}

module.exports = { app, config };
