/**
 * user-identity.js
 *
 * Server-side internal user identity for BetterCLSS persistence.
 *
 * IMPORTANT SECURITY PROPERTY:
 * - The storage key is SHA-256("<domain>\n<canvasUserId>"), computed ONLY on the
 *   server, ONLY after the Canvas token has been verified against Canvas.
 * - Raw Canvas user IDs and Canvas access tokens are NEVER used as database
 *   keys, file names, or identifiers exposed in storage. Tokens are never
 *   persisted anywhere by this module.
 * - The hash is not secret-by-obscurity security: isolation is enforced by
 *   verifying every request's Canvas token against the stored record's
 *   identity (see canvas-service.verifyUserRequest). The hash only prevents
 *   leaking raw Canvas IDs at rest.
 */

const crypto = require('crypto');

/**
 * Compute the internal (hashed) user key for a verified Canvas identity.
 * @param {string} domain - normalized Canvas domain (e.g. usc.instructure.com)
 * @param {string|number} canvasUserId - Canvas user ID (verified server-side)
 * @returns {string} 64-char hex SHA-256 digest
 */
function hashUserId(domain, canvasUserId) {
  return crypto
    .createHash('sha256')
    .update(`${String(domain).toLowerCase()}\n${String(canvasUserId)}`, 'utf8')
    .digest('hex');
}

module.exports = { hashUserId };
