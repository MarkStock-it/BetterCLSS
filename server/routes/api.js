const { URL } = require('url');
const { parseRequestBody } = require('../lib/http');
const { createAssistantRoute } = require('./assistant-route');
const { createCanvasRoutes } = require('./canvas-routes');
const { createNotificationRoute } = require('./notification-routes');
const { createUserRoutes } = require('./user-routes');

function createApiHandler(dependencies) {
  const shared = { ...dependencies, parseRequestBody };
  const handleNotificationRoute = createNotificationRoute(shared);
  const handleAssistantRoute = createAssistantRoute(shared);
  const handleUserRoute = createUserRoutes(shared);
  const handleCanvasRoute = createCanvasRoutes(shared);

  return async function handleApi(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = requestUrl;
    if (await handleNotificationRoute(req, res, pathname)) return;
    if (await handleAssistantRoute(req, res, pathname)) return;
    if (await handleUserRoute(req, res, pathname)) return;
    await handleCanvasRoute(req, res, pathname);
  };
}

module.exports = { createApiHandler };
