/**
 * agentic-back-channel-client.js
 *
 * BetterCLSS → betterclss-agentic (Render) status mirroring — passby_agentic.md §6.4.
 *
 * BetterCLSS never writes to the agentic app. For status mirroring it calls:
 *   GET {AGENTIC_APP_URL}/api/v1/users/:userIdHash/jobs?since=<iso>
 *   Header: Authorization: Bearer <AGENTIC_BACK_CHANNEL_TOKEN>
 *
 * userIdHash is the shared identity hash (user-identity.js) — BetterCLSS can
 * compute it locally, so no id mapping is needed. Responses contain only the
 * non-sensitive projection: { id, state, title, updatedAt, result }.
 *
 * The client degrades gracefully: when the token is absent (not yet set on
 * both sides) isConfigured() is false and callers get a structured
 * "not configured" response instead of network errors.
 */

const { hashUserId } = require('../../user-identity');

const DEFAULT_TIMEOUT_MS = 8000;

function createAgenticBackChannelClient({ config, fetchImpl = globalThis.fetch }) {
  function isConfigured() {
    return Boolean(config.agenticAppUrl && config.agenticBackChannelToken);
  }

  function normalizeDomain(domain) {
    return String(domain || '').trim().toLowerCase();
  }

  /**
   * Fetch the status-mirror projection for a user.
   * @param {{ canvasUserId: string|number, canvasDomain: string }} identity
   *   — both must come from a live canvasService.verifyUserRequest result.
   * @param {{ since?: string }} [options]
   * @returns {Promise<{ok: boolean, status?: number, jobs?: Array, error?: string}>}
   */
  async function fetchUserJobs(identity, { since } = {}) {
    if (!isConfigured()) {
      return { ok: false, error: 'agentic_not_configured' };
    }
    const base = String(config.agenticAppUrl || '').replace(/\/+$/, '');
    const userIdHash = hashUserId(normalizeDomain(identity.canvasDomain), identity.canvasUserId);
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    const qs = params.toString();
    const url = `${base}/api/v1/users/${userIdHash}/jobs${qs ? `?${qs}` : ''}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.agenticBackChannelTimeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.agenticBackChannelToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, status: res.status, error: `agentic_http_${res.status}` };
      }
      const data = await res.json();
      return { ok: true, jobs: Array.isArray(data.jobs) ? data.jobs : [] };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, error: 'agentic_timeout' };
      return { ok: false, error: 'agentic_unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  return { isConfigured, fetchUserJobs };
}

module.exports = { createAgenticBackChannelClient, DEFAULT_TIMEOUT_MS };
