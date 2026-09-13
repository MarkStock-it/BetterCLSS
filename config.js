// Dual-backend configuration.
//
// - DATA backend (dcism): user persistence, notes, tasks, prefs, agent jobs.
//   Lives on the same domain, so a relative base works; it has the MariaDB.
// - CANVAS backend (Render): Canvas proxy + AI routes, needs outbound
//   internet which the dcism host does not have.
//
// GitHub Pages deployments keep using Render for everything.
window.BCLSS_DATA_API_BASE_URL = '';
window.BCLSS_CANVAS_API_BASE_URL = 'https://betterclss.onrender.com';

// Simple single-backend fallback (used when the split bases are not set).
window.BCLSS_API_BASE_URL = '';

if (window.location.hostname === 'markstock-it.github.io') {
  window.BCLSS_DATA_API_BASE_URL = 'https://betterclss.onrender.com';
  window.BCLSS_CANVAS_API_BASE_URL = 'https://betterclss.onrender.com';
}
