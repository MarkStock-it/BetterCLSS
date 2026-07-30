const { createApp } = require('./server/app');

const { app, config } = createApp(__dirname);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`BetterCLSS running on http://localhost:${config.port}`);
  });
}

module.exports = { app, config };
