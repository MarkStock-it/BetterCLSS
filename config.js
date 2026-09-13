// Same-origin API by default (backend proxied at the domain). The Connect
// Canvas modal can still override this for local development.
window.BCLSS_API_BASE_URL = '';

// Fallback for any environment where the proxy isn't configured.
if (window.location.hostname === 'markstock-it.github.io') {
  window.BCLSS_API_BASE_URL = 'https://betterclss.onrender.com';
}
