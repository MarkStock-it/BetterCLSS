/**
 * user-storage.js
 * Simple file-based user data storage system.
 * 
 * Each user's data is identified by their Canvas user ID.
 * User data includes: assignments, notes, tasks, grades, settings, announcements, links, study data.
 * 
 * This module handles:
 * - Creating new user records
 * - Loading existing user data
 * - Saving/updating user data
 * - Deleting user sessions
 */

const fs = require('fs');
const path = require('path');

// Use a data directory to store user files
const DATA_DIR = path.join(__dirname, '.betterclss_data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Get the file path for a user's data
 * @param {number} canvasUserId - The Canvas user ID
 * @returns {string} File path for user's data
 */
function getUserDataPath(canvasUserId) {
  const filename = `user_${canvasUserId}.json`;
  return path.join(DATA_DIR, filename);
}

/**
 * Default user data structure
 * @returns {object} Empty user data object
 */
function getDefaultUserData() {
  return {
    userId: null, // Canvas user ID
    name: '', // User's full name from Canvas
    email: '', // User's email from Canvas
    createdAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
    // Local BetterCLSS data
    local: {
      assignments: [],
      grades: [],
      notes: [],
      studyTasks: [],
      studyHistory: [],
      studyDecks: [],
      studyCurrentNote: {
        content: '',
        updatedAt: null
      },
      studySettings: {
        workMins: 25,
        breakMins: 5,
        longBreakMins: 15,
        dailyGoalHours: 4,
        ambientMode: 'off',
        ambientVolume: 30,
        studyTheme: 'dark'
      },
      events: [],
      announcements: [],
      canvasOverrides: {},
      links: [],
      studyHours: 0,
      studyGoal: 4,
      pomoSessions: 0,
      nextId: 100
    },
    // Agentic Helper settings (experimental feature, OFF by default)
    agentSettings: {
      enabled: false,
      enabledAt: null,
      lastToggledAt: null,
      // Granular permissions (child controls, only active when master switch is ON)
      permissions: {
        contentGeneration: true,    // AI text/essay generation
        artifactGeneration: true,   // DOCX/TXT file creation
        canvasComments: true,       // Post comments on assignments
        canvasFileUpload: true,     // Upload files to Canvas
        canvasSubmission: false,    // Submit assignments (OFF by default for safety)
      }
    },
    // Agentic Helper job history
    agentJobs: [],
    // Agentic Helper assignment manifests (cached capability analyses)
    agentManifests: [],
    // Canvas data (refreshed on sync)
    canvas: {
      assignments: [],
      announcements: [],
      grades: [],
      courses: [],
      syncing: false,
      lastSyncAt: null
    },
    // UI state (optional, can be cleared)
    ui: {
      assignFilter: 'all',
      searchQuery: '',
      calMonth: new Date().getMonth(),
      calYear: new Date().getFullYear(),
      selectedDate: null,
      theme: 'dark',
      accentColor: '#6080ff'
    }
  };
}

/**
 * Load user data from storage, or create new if doesn't exist
 * @param {number} canvasUserId - Canvas user ID
 * @param {object} canvasProfile - Canvas profile data from API
 * @returns {object} User data object
 */
function loadOrCreateUser(canvasUserId, canvasProfile = {}) {
  const filePath = getUserDataPath(canvasUserId);
  
  let userData;
  if (fs.existsSync(filePath)) {
    // Load existing user
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      userData = JSON.parse(raw);
      userData.lastSyncAt = new Date().toISOString();
    } catch (err) {
      console.error(`Failed to load user ${canvasUserId}:`, err.message);
      userData = getDefaultUserData();
      userData.userId = canvasUserId;
    }
  } else {
    // Create new user
    userData = getDefaultUserData();
    userData.userId = canvasUserId;
    if (canvasProfile) {
      userData.name = canvasProfile.name || '';
      userData.email = canvasProfile.email || '';
    }
    saveUserData(canvasUserId, userData);
  }
  
  // Ensure Canvas profile info is up to date
  if (canvasProfile) {
    userData.name = canvasProfile.name || userData.name;
    userData.email = canvasProfile.email || userData.email;
  }
  
  return userData;
}

/**
 * Save user data to storage
 * @param {number} canvasUserId - Canvas user ID
 * @param {object} userData - User data object
 * @returns {boolean} Success status
 */
function saveUserData(canvasUserId, userData) {
  try {
    const filePath = getUserDataPath(canvasUserId);
    // Ensure userId is set
    userData.userId = canvasUserId;
    userData.lastSyncAt = new Date().toISOString();
    
    // Write atomically by writing to temp file first
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(userData, null, 2), 'utf8');
    
    // Rename temp to actual file (atomic on most systems)
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Failed to save user ${canvasUserId}:`, err.message);
    return false;
  }
}

/**
 * Update just the local (BetterCLSS) data for a user
 * @param {number} canvasUserId - Canvas user ID
 * @param {object} localData - Local data to merge
 * @returns {object} Updated user data
 */
function updateUserLocalData(canvasUserId, localData) {
  const userData = loadOrCreateUser(canvasUserId);
  userData.local = { ...userData.local, ...localData };
  saveUserData(canvasUserId, userData);
  return userData;
}

/**
 * Update just the Canvas data for a user
 * @param {number} canvasUserId - Canvas user ID
 * @param {object} canvasData - Canvas data to merge
 * @returns {object} Updated user data
 */
function updateUserCanvasData(canvasUserId, canvasData) {
  const userData = loadOrCreateUser(canvasUserId);
  userData.canvas = { ...userData.canvas, ...canvasData };
  userData.canvas.lastSyncAt = new Date().toISOString();
  saveUserData(canvasUserId, userData);
  return userData;
}

/**
 * Update Agentic Helper settings for a user
 * @param {number} canvasUserId - Canvas user ID
 * @param {object} agentSettings - Agent settings to merge
 * @returns {object} Updated user data
 */
function updateAgentSettings(canvasUserId, agentSettings) {
  const userData = loadOrCreateUser(canvasUserId);
  userData.agentSettings = { ...userData.agentSettings, ...agentSettings };
  userData.agentSettings.lastToggledAt = new Date().toISOString();
  saveUserData(canvasUserId, userData);
  return userData;
}

/**
 * Get Agentic Helper enabled state for a user
 * @param {number} canvasUserId - Canvas user ID
 * @returns {boolean} Whether Agentic Helper is enabled
 */
function isAgentEnabled(canvasUserId) {
  const userData = loadOrCreateUser(canvasUserId);
  return Boolean(userData.agentSettings && userData.agentSettings.enabled);
}

/**
 * Delete all user data (for logout)
 * @param {number} canvasUserId - Canvas user ID
 * @returns {boolean} Success status
 */
function deleteUserData(canvasUserId) {
  try {
    const filePath = getUserDataPath(canvasUserId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (err) {
    console.error(`Failed to delete user ${canvasUserId}:`, err.message);
    return false;
  }
}

/**
 * Get user's local data only (for initial page load)
 * @param {number} canvasUserId - Canvas user ID
 * @returns {object|null} Local data or null if user doesn't exist
 */
function getUserLocalData(canvasUserId) {
  const filePath = getUserDataPath(canvasUserId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const userData = JSON.parse(raw);
    return userData.local || null;
  } catch (err) {
    console.error(`Failed to load local data for user ${canvasUserId}:`, err.message);
    return null;
  }
}

module.exports = {
  getDefaultUserData,
  loadOrCreateUser,
  saveUserData,
  updateUserLocalData,
  updateUserCanvasData,
  updateAgentSettings,
  isAgentEnabled,
  deleteUserData,
  getUserLocalData
};
