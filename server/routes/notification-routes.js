const { writeBodyError } = require('../lib/http');

function createNotificationRoute({ config, json, notificationService, parseRequestBody }) {
  return async function handleNotificationRoute(req, res, pathname) {
    if (pathname === '/register-token' || pathname === '/api/register-token') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method_not_allowed' });
        return true;
      }
      try {
        const body = await parseRequestBody(req);
        if (!notificationService.registerToken(body.token)) {
          json(res, 400, { error: 'invalid_token' });
          return true;
        }
        json(res, 200, { success: true, totalTokens: notificationService.tokenCount });
      } catch (error) {
        if (!writeBodyError(json, res, error)) {
          json(res, 500, { error: 'token_registration_failed' });
        }
      }
      return true;
    }

    if (pathname !== '/send-notification' && pathname !== '/api/send-notification') return false;
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!config.notificationAdminKey || req.headers['x-admin-key'] !== config.notificationAdminKey) {
      json(res, 403, {
        error: 'forbidden',
        message: 'Notification sending requires the configured admin key.',
      });
      return true;
    }
    if (!notificationService.enabled) {
      json(res, 500, {
        error: 'fcm_not_configured',
        message: 'Set FIREBASE_SERVICE_ACCOUNT_JSON on the backend.',
      });
      return true;
    }
    if (!notificationService.tokenCount) {
      json(res, 400, { error: 'no_registered_tokens' });
      return true;
    }

    try {
      const body = await parseRequestBody(req);
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'BetterCLSS';
      const messageBody = typeof body.body === 'string' && body.body.trim()
        ? body.body.trim()
        : 'You have a new update.';
      const url = typeof body.url === 'string' && body.url.trim()
        ? body.url.trim()
        : 'https://your-frontend-url.github.io';
      const result = await notificationService.sendToAll({ title, body: messageBody, url });
      json(res, 200, { success: true, ...result });
    } catch (error) {
      if (!writeBodyError(json, res, error)) {
        json(res, 500, { error: 'notification_send_failed', message: error.message });
      }
    }
    return true;
  };
}

module.exports = { createNotificationRoute };
