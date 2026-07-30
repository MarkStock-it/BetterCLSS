function createCorsMiddleware(corsAllowOrigin) {
  return function corsMiddleware(req, res, next) {
    const isApiRequest = (
      req.url.startsWith('/api/')
      || req.url === '/register-token'
      || req.url === '/send-notification'
    );
    if (!isApiRequest || req.method !== 'OPTIONS') {
      next();
      return;
    }

    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsAllowOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, x-canvas-token, x-canvas-domain, x-ai-key, x-admin-key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
    res.end();
  };
}

module.exports = { createCorsMiddleware };
