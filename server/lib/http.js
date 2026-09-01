const BODY_ERROR_CODES = new Set(['INVALID_JSON', 'BODY_TOO_LARGE', 'BODY_READ_ERROR']);

function createHttpHelpers(corsAllowOrigin) {
  function json(res, status, data) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Access-Control-Allow-Origin': corsAllowOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, x-canvas-token, x-canvas-domain, x-ai-key, x-groq-key, x-admin-key',
      Vary: 'Origin',
    });
    res.end(JSON.stringify(data));
  }

  return { json };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('BODY_TOO_LARGE'));
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', () => reject(new Error('BODY_READ_ERROR')));
  });
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return readJsonBody(req);
}

function isBodyError(error) {
  return BODY_ERROR_CODES.has(error?.message);
}

function writeBodyError(json, res, error) {
  if (!isBodyError(error)) return false;
  json(res, 400, { error: error.message.toLowerCase() });
  return true;
}

module.exports = {
  createHttpHelpers,
  isBodyError,
  parseRequestBody,
  readJsonBody,
  writeBodyError,
};
