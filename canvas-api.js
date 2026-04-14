/**
 * canvas-api.js
 * Browser client for Canvas proxy using per-user credentials.
 * Token/domain are stored locally in the user's browser.
 */

const CanvasAPI = (() => {
  const TOKEN_KEY = 'bclss_canvas_token';
  const DOMAIN_KEY = 'bclss_canvas_domain';
  const API_BASE_KEY = 'bclss_api_base';

  function normalizeApiBase(input) {
    const val = String(input || '').trim();
    return val.replace(/\/+$/, '');
  }

  function getApiBase() {
    const fromWindow = typeof window !== 'undefined' ? window.BCLSS_API_BASE_URL : '';
    const fromStorage = localStorage.getItem(API_BASE_KEY) || '';
    return normalizeApiBase(fromStorage || fromWindow || '');
  }

  function setApiBase(baseUrl) {
    const clean = normalizeApiBase(baseUrl);
    if (!clean) {
      localStorage.removeItem(API_BASE_KEY);
      return;
    }
    localStorage.setItem(API_BASE_KEY, clean);
  }

  function apiUrl(path) {
    const base = getApiBase();
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

    const headers = { Accept: 'application/json' };
    if (token) headers['x-canvas-token'] = token;
    if (domain) headers['x-canvas-domain'] = domain;

    const url = apiUrl(path);
    let lastError = null;

    // Render free-tier services can cold-start; retry a few times before failing.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let res;
      try {
        res = await fetch(url, { headers });
      } catch (err) {
        lastError = err;
        await delay(900 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        return res.json();
      }

      if (res.status >= 500 && attempt < 2) {
        await delay(900 * (attempt + 1));
        continue;
      }

      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data.message || data.error || msg;
      } catch (_) {}
      if (res.status === 401) throw new Error('UNAUTHORIZED');
      throw new Error(msg);
    }

    if (lastError) {
      throw new Error('Load failed (backend cold start or network issue). Please retry in 15-30 seconds.');
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
