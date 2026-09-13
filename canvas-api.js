/**
 * canvas-api.js — dual-API routing.
 *
 * BetterCLSS uses TWO backend bases:
 *  - DATA base: user persistence (authenticate, /api/user/*, agent jobs).
 *    Points at the dcism backend, which has the MariaDB with user data.
 *  - CANVAS base: Canvas proxy calls (/api/canvas/*, /api/assistant/*).
 *    Points at the Render backend, which has outbound internet to Canvas.
 *
 * Set via config.js: BCLSS_DATA_API_BASE_URL and BCLSS_CANVAS_API_BASE_URL.
 * A single BCLSS_API_BASE_URL still works (used for both) for simple setups.
 */

const CanvasAPI = (() => {
  const TOKEN_KEY = 'bclss_canvas_token';
  const DOMAIN_KEY = 'bclss_canvas_domain';
  const API_BASE_KEY = 'bclss_api_base';
  const CANVAS_BASE_KEY = 'bclss_canvas_api_base';

  function normalizeApiBase(input) {
    const val = String(input || '').trim();
    return val.replace(/\/+$/, '');
  }

  function getDataApiBase() {
    const fromStorage = localStorage.getItem(API_BASE_KEY) || '';
    const fromWindow = typeof window !== 'undefined' ? window.BCLSS_DATA_API_BASE_URL : '';
    const fromLegacy = typeof window !== 'undefined' ? window.BCLSS_API_BASE_URL : '';
    return normalizeApiBase(fromStorage || fromWindow || fromLegacy || '');
  }

  function getCanvasApiBase() {
    const fromStorage = localStorage.getItem(CANVAS_BASE_KEY) || '';
    const fromWindow = typeof window !== 'undefined' ? window.BCLSS_CANVAS_API_BASE_URL : '';
    // Fall back to the data base so simple single-backend setups still work.
    return normalizeApiBase(fromStorage || fromWindow || getDataApiBase());
  }

  // Kept for backwards compatibility with existing callers.
  function getApiBase() {
    return getDataApiBase();
  }

  function setApiBase(baseUrl) {
    const clean = normalizeApiBase(baseUrl);
    if (!clean) {
      localStorage.removeItem(API_BASE_KEY);
      return;
    }
    localStorage.setItem(API_BASE_KEY, clean);
  }

  function setCanvasApiBase(baseUrl) {
    const clean = normalizeApiBase(baseUrl);
    if (!clean) {
      localStorage.removeItem(CANVAS_BASE_KEY);
      return;
    }
    localStorage.setItem(CANVAS_BASE_KEY, clean);
  }

  function apiUrl(path) {
    // Canvas-bound routes go to the Canvas (egress-capable) backend.
    const isCanvasRoute = (
      path.startsWith('/api/canvas/')
      || path.startsWith('/api/assistant/')
    );
    const base = isCanvasRoute ? getCanvasApiBase() : getDataApiBase();
    return base ? `${base}${path}` : path;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeDomain(domain) {
    return String(domain || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }

  function getDomain() {
    return normalizeDomain(localStorage.getItem(DOMAIN_KEY) || 'usc.instructure.com');
  }

  function getToken() {
    return (localStorage.getItem(TOKEN_KEY) || '').trim();
  }

  async function fetchJSON(path) {
    const token = getToken();
    const domain = getDomain();

    if (!token) {
      const error = new Error('Canvas token is missing. Please connect your Canvas account.');
      error.code = 'MISSING_TOKEN';
      throw error;
    }

    const url = apiUrl(path);
    try {
      const response = await fetch(url, {
        headers: {
          'x-canvas-token': token,
          'x-canvas-domain': domain,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      if (err.code === 'MISSING_TOKEN') throw err;
      console.warn(`API request to ${url} failed:`, err);
      throw new Error('Load failed');
    }

    throw new Error('Load failed');
  }

  function saveCredentials(token, domain) {
    const cleanToken = String(token || '').trim();
    const cleanDomain = normalizeDomain(domain || 'usc.instructure.com');
    localStorage.setItem(TOKEN_KEY, cleanToken);
    localStorage.setItem(DOMAIN_KEY, cleanDomain || 'usc.instructure.com');
  }

  function clearCredentials() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DOMAIN_KEY);
  }

  async function testConnection() {
    return fetchJSON('/api/canvas/test');
  }

  async function getAllAssignments() {
    return fetchJSON('/api/canvas/assignments');
  }

  async function getAllAnnouncements() {
    return fetchJSON('/api/canvas/announcements');
  }

  async function getGrades() {
    return fetchJSON('/api/canvas/grades');
  }

  function relativeTime(isoString) {
    if (!isoString) return 'No date';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDueDate(isoString) {
    if (!isoString) return 'No due date';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function daysUntil(isoString) {
    if (!isoString) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(isoString);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
  }

  function stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  return {
    saveCredentials,
    clearCredentials,
    setApiBase,
    getApiBase,
    getDataApiBase,
    getCanvasApiBase,
    setCanvasApiBase,
    apiUrl,
    getDomain,
    getToken,
    testConnection,
    getAllAssignments,
    getAllAnnouncements,
    getGrades,
    relativeTime,
    formatDueDate,
    daysUntil,
    stripHtml,
  };
})();

if (typeof window !== 'undefined') {
  window.CanvasAPI = CanvasAPI;
}
