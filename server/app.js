const express = require('express');
const userStorage = require('../user-storage');
const { createConfig } = require('./config');
const { createHttpHelpers } = require('./lib/http');
const { createCorsMiddleware } = require('./middleware/cors');
const { createApiHandler } = require('./routes/api');
const { createAssistantService } = require('./services/assistant-service');
const { createCanvasService } = require('./services/canvas-service');
const { createNotificationService } = require('./services/notification-service');
const { createStaticHandler } = require('./services/static-service');

function isApiRequest(url) {
  return (
    url.startsWith('/api/')
    || url === '/register-token'
    || url === '/send-notification'
  );
}

function createApp(rootDir) {
  const config = createConfig(rootDir);
  const { json } = createHttpHelpers(config.corsAllowOrigin);
  const canvasService = createCanvasService(config, json);
  const assistantService = createAssistantService(config);
  const notificationService = createNotificationService(config.firebaseServiceAccountJson);
  const handleApi = createApiHandler({
    assistantService,
    canvasService,
    config,
    json,
    notificationService,
    rootDir,
    userStorage,
  });
  const serveStatic = createStaticHandler(rootDir, json);

  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware(config.corsAllowOrigin));
  app.use((req, res) => {
    if (isApiRequest(req.url)) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });

  return { app, config };
}

module.exports = { createApp, isApiRequest };
