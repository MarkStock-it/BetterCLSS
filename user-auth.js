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
 * 7. On logout, frontend calls POST /api/user/logout/:userId
 */

const UserAuth = (() => {
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
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Authentication failed: HTTP ${response.status}`);
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
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local: localData })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Save failed: HTTP ${response.status}`);
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
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments: canvasData.assignments || [],
        announcements: canvasData.announcements || [],
        grades: canvasData.grades || [],
        courses: canvasData.courses || []
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Canvas sync save failed: HTTP ${response.status}`);
    }

    return { success: true };
  }

  /**
   * Logout user and delete all saved data
   * Clears Canvas credentials and removes all user data from backend
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
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.warn(`Logout save failed: HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Logout network error:', err.message);
    }

    // Clear local user session
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
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Load failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      localData: data.localData,
      canvasData: data.canvasData,
      uiData: data.uiData
    };
  }

  return {
    isAuthenticated,
    getCurrentUser,
    authenticateUser,
    saveUserData,
    saveCanvasSync,
    logoutUser,
    clearSession,
    loadUserData
  };
})();
