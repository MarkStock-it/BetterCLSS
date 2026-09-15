/**
 * agentic-handoff-service.js
 *
 * Mints short-lived handoff JWTs for the standalone BetterCLSS Agentic app
 * (betterclss-agentic on Render). Contract — passby_agentic.md §6.1:
 *   - HS256, 120-second TTL (the token travels in a URL and is traded for a
 *     session cookie on arrival, so it must not live long)
 *   - iss "betterclss", aud "betterclss-agentic"
 *   - sub = sha256("<domain>\n<canvasUserId>") — the shared identity hash
 *     (user-identity.js). The agentic side recomputes it from the raw
 *     canvasDomain/canvasUserId claims, so a swapped identity is rejected
 *     even with a valid signature.
 *   - The Canvas token, BYOK keys, and email NEVER go into the JWT.
 */

const crypto = require('crypto');
const { hashUserId } = require('../../user-identity');

const HANDOFF_TTL_SECONDS = 120;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function hmacSign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createAgenticHandoffService({ config }) {
  function isConfigured() {
    return Boolean(config.agenticJwtSecret);
  }

  /**
   * Mint a handoff token for a Canvas identity that the caller has already
   * verified live against Canvas (canvas-service.verifyUserRequest).
   * @param {{ canvasUserId: string|number, canvasDomain: string, name?: string }} identity
   * @returns {string} compact HS256 JWT
   */
  function mintHandoffToken({ canvasUserId, canvasDomain, name }) {
    if (!config.agenticJwtSecret) throw new Error('AGENTIC_JWT_SECRET_MISSING');
    const domain = String(canvasDomain || '').trim().toLowerCase();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'betterclss',
      aud: 'betterclss-agentic',
      sub: hashUserId(domain, canvasUserId),
      iat: nowSeconds,
      exp: nowSeconds + HANDOFF_TTL_SECONDS,
      canvasUserId: String(canvasUserId),
      canvasDomain: domain,
      name: String(name || '').slice(0, 120),
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    return `${body}.${hmacSign(body, config.agenticJwtSecret)}`;
  }

  function buildLaunchUrl(token) {
    const base = String(config.agenticAppUrl || '').replace(/\/+$/, '');
    return `${base}/?t=${encodeURIComponent(token)}`;
  }

  return { isConfigured, mintHandoffToken, buildLaunchUrl };
}

module.exports = { createAgenticHandoffService, HANDOFF_TTL_SECONDS };
