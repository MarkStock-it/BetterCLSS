/**
 * user-auth.js
 * Frontend user authentication and data persistence layer
 * 
 * This module handles:
 * - User authentication via Canvas tokens
 * - Fetching and loading user-specific data from backend
 * - Saving user data changes back to backend
 * - Managing user logout
 * 
 * User identity flow:
 * 1. User connects Canvas token via UI
 * 2. Frontend sends token to POST /api/user/authenticate
 * 3. Backend verifies token with Canvas and fetches user profile
 * 4. Backend creates/loads user record keyed by Canvas user ID
 * 5. Frontend receives userId and loads user's saved data
 * 6. On any data modification, frontend saves to POST /api/user/data/:userId
 * 7. On disconnect, the local session is cleared while saved user data remains available for reconnect
 */

const UserAuth = (() => {
  const REQUEST_TIMEOUT_MS = 20000;

  // Store current user session
  let currentUser = {
    id: null,        // Canvas user ID
    name: '',        // User's full name
    email: '',       // User's email
    isNewUser: false // True if first time connecting
  };

  // Check if user is currently authenticated
  function isAuthenticated() {
    return !!currentUser.id;
  }

  // Get current user info
  function getCurrentUser() {
    return { ...currentUser };
  }

  function getCredentialHeaders() {
    const token = typeof localStorage !== 'undefined'
      ? String(localStorage.getItem('bclss_canvas_token') || '').trim()
      : '';
    const domain = typeof localStorage !== 'undefined'
      ? String(localStorage.getItem('bclss_canvas_domain') || '').trim()
      : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-canvas-token'] = token;
    if (domain) headers['x-canvas-domain'] = domain;
    return headers;
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('The server took too long to respond. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readError(response, fallback) {
    const error = await response.json().catch(() => ({}));
    return new Error(error.message || fallback || `Request failed: HTTP ${response.status}`);
  }

  /**
   * Authenticate user with Canvas token
   * This is called after user provides a Canvas token
   * 
   * Flow:
   * 1. Sends token to backend for verification
   * 2. Backend fetches Canvas profile and verifies token
   * 3. Backend creates/loads user record
   * 4. Returns user profile and previously saved data
   * 
   * @param {string} token - Canvas API token
   * @param {string} domain - Canvas domain (e.g., usc.instructure.com)
   * @param {string} apiBase - Backend API base URL
   * @returns {Promise<{success, userId, name, email, isNewUser, localData, canvasData}>}
   */
  async function authenticateUser(token, domain, apiBase) {
    if (!token || !domain) {
      throw new Error('Token and domain are required');
    }

    const apiUrl = apiBase ? `${apiBase}/api/user/authenticate` : '/api/user/authenticate';
    
    const response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain
      }
    });

    if (!response.ok) {
      throw await readError(response, `Authentication failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Store authenticated user info
    currentUser.id = data.userId;
    currentUser.name = data.name;
    currentUser.email = data.email;
    currentUser.isNewUser = data.isNewUser;

    return {
      success: true,
      userId: data.userId,
      name: data.name,
      email: data.email,
      isNewUser: data.isNewUser,
      localData: data.localData,
      canvasData: data.canvasData
    };
  }

  /**
   * Save user's local BetterCLSS data to backend
   * Called whenever user modifies assignments, notes, tasks, settings, etc.
   * 
   * @param {number} userId - Canvas user ID
   * @param {object} localData - Local data object containing assignments, notes, etc.
   * @param {string} apiBase - Backend API base URL
   * @returns {Promise<{success}>}
   */
  async function saveUserData(userId, localData, apiBase) {
    if (!userId) {
      throw new Error('User ID required to save data');
    }

    const apiUrl = apiBase ? `${apiBase}/api/user/data/${userId}` : `/api/user/data/${userId}`;
    
    const response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: getCredentialHeaders(),
      body: JSON.stringify({ local: localData })
    });

    if (!response.ok) {
      throw await readError(response, `Save failed: HTTP ${response.status}`);
    }

    return { success: true };
  }

  /**
   * Save user's Canvas sync results to backend
   * Called after successfully syncing Canvas assignments, announcements, grades
   * 
   * @param {number} userId - Canvas user ID
   * @param {object} canvasData - Canvas data with assignments, announcements, grades, courses
   * @param {string} apiBase - Backend API base URL
   * @returns {Promise<{success}>}
   */
  async function saveCanvasSync(userId, canvasData, apiBase) {
    if (!userId) {
      throw new Error('User ID required to save Canvas sync');
    }

    const apiUrl = apiBase ? `${apiBase}/api/user/sync/${userId}` : `/api/user/sync/${userId}`;
    
    const response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: getCredentialHeaders(),
      body: JSON.stringify({
        assignments: canvasData.assignments || [],
        announcements: canvasData.announcements || [],
        grades: canvasData.grades || [],
        courses: canvasData.courses || []
      })
    });

    if (!response.ok) {
      throw await readError(response, `Canvas sync save failed: HTTP ${response.status}`);
    }

    return { success: true };
  }

  /**
   * End the current backend session without deleting saved user data
   * 
   * @param {number} userId - Canvas user ID
   * @param {string} apiBase - Backend API base URL
   * @returns {Promise<{success}>}
   */
  async function logoutUser(userId, apiBase) {
    if (!userId) {
      return { success: true }; // Already logged out
    }

    const apiUrl = apiBase ? `${apiBase}/api/user/logout/${userId}` : `/api/user/logout/${userId}`;
    
    try {
      const response = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: getCredentialHeaders()
      });

      if (!response.ok) {
        console.warn(`Logout save failed: HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Logout network error:', err.message);
    }

    // Clear the in-memory user session. The caller owns Canvas credential cleanup.
    currentUser = { id: null, name: '', email: '', isNewUser: false };
    
    return { success: true };
  }

  function clearSession() {
    currentUser = { id: null, name: '', email: '', isNewUser: false };
    return { success: true };
  }

  /**
   * Load user's previously saved data from backend
   * Used when returning to app if already authenticated
   * 
   * @param {number} userId - Canvas user ID
   * @param {string} apiBase - Backend API base URL
   * @returns {Promise<{localData, canvasData, uiData}>}
   */
  async function loadUserData(userId, apiBase) {
    if (!userId) {
      throw new Error('User ID required to load data');
    }

    const apiUrl = apiBase ? `${apiBase}/api/user/data/${userId}` : `/api/user/data/${userId}`;
    
    const response = await fetchWithTimeout(apiUrl, {
      method: 'GET',
      headers: getCredentialHeaders()
    });

    if (!response.ok) {
      throw await readError(response, `Load failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      localData: data.localData,
      canvasData: data.canvasData,
      uiData: data.uiData
    };
  }

  const exports = {
    isAuthenticated,
    getCurrentUser,
    authenticateUser,
    saveUserData,
    saveCanvasSync,
    logoutUser,
    clearSession,
    loadUserData
  };

  if (typeof window !== 'undefined') {
    window.UserAuth = exports;
  }

  return exports;
})();
