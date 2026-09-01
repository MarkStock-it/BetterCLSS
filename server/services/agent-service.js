/**
 * agent-service.js
 * Agentic Helper service boundary.
 *
 * Provides:
 *   - Feature gate: isAgenticHelperEnabled()
 *   - Settings management: getSettings(), updateSettings()
 *   - Permission management: getPermissions(), updatePermissions()
 *   - Permission checking: checkToolPermission()
 */

const {
  checkPermission,
  checkToolPermission: checkToolPerm,
  getEffectivePermissions,
  getPermissionsList,
  validatePermissionsUpdate,
  mergePermissions,
  getBlockedReason,
  getDefaultPermissions,
} = require('../agent/agent-permissions');

function createAgentService(config, userStorage) {

  /**
   * Check whether Agentic Helper is enabled for a given user.
   * This is the authoritative server-side gate for all agent operations.
   *
   * Two conditions must be met:
   *   1. The global server-side config must allow agent operations (AGENT_ENABLED env)
   *   2. The user must have explicitly enabled it in their settings
   *
   * @param {number} canvasUserId - The Canvas user ID
   * @returns {boolean} Whether Agentic Helper is enabled for this user
   */
  function isAgenticHelperEnabled(canvasUserId) {
    // Global kill switch: if the server has agent operations disabled,
    // no user-level setting can override it.
    if (!config.agentEnabled) {
      return false;
    }
    return userStorage.isAgentEnabled(canvasUserId);
  }

  /**
   * Get the Agentic Helper settings for a user.
   * @param {number} canvasUserId - The Canvas user ID
   * @returns {object} The agent settings object including permissions
   */
  function getSettings(canvasUserId) {
    const userData = userStorage.loadOrCreateUser(canvasUserId);
    const agentSettings = userData.agentSettings || {};
    return {
      enabled: Boolean(agentSettings.enabled),
      enabledAt: agentSettings.enabledAt || null,
      lastToggledAt: agentSettings.lastToggledAt || null,
      permissions: getEffectivePermissions(agentSettings),
    };
  }

  /**
   * Update the Agentic Helper enabled state for a user.
   * @param {number} canvasUserId - The Canvas user ID
   * @param {boolean} enabled - Whether to enable or disable
   * @returns {object} The updated settings
   */
  function updateSettings(canvasUserId, enabled) {
    const settings = {
      enabled: Boolean(enabled),
      enabledAt: enabled ? new Date().toISOString() : null,
    };
    userStorage.updateAgentSettings(canvasUserId, settings);
    return getSettings(canvasUserId);
  }

  /**
   * Get the permissions for a user.
   * @param {number} canvasUserId - The Canvas user ID
   * @returns {object[]} List of permissions with current state
   */
  function getPermissions(canvasUserId) {
    const userData = userStorage.loadOrCreateUser(canvasUserId);
    return getPermissionsList(userData.agentSettings || {});
  }

  /**
   * Update specific permissions for a user.
   * Only updates the keys provided in newPermissions.
   * @param {number} canvasUserId - The Canvas user ID
   * @param {object} newPermissions - Permission updates { permissionKey: boolean }
   * @returns {{ success: boolean, permissions: object[], errors?: string[] }}
   */
  function updatePermissions(canvasUserId, newPermissions) {
    const validation = validatePermissionsUpdate(newPermissions);
    if (!validation.valid) {
      return { success: false, permissions: [], errors: validation.errors };
    }

    const userData = userStorage.loadOrCreateUser(canvasUserId);
    const currentPerms = (userData.agentSettings && userData.agentSettings.permissions) || getDefaultPermissions();
    const merged = mergePermissions(currentPerms, validation.sanitized);

    userStorage.updateAgentSettings(canvasUserId, { permissions: merged });

    return { success: true, permissions: getPermissionsList({ ...userData.agentSettings, permissions: merged }) };
  }

  /**
   * Check whether a specific permission is enabled for a user.
   * @param {number} canvasUserId - The Canvas user ID
   * @param {string} permissionKey - Permission to check
   * @returns {{ allowed: boolean, reason: string }}
   */
  function checkUserPermission(canvasUserId, permissionKey) {
    const userData = userStorage.loadOrCreateUser(canvasUserId);
    return checkPermission(userData.agentSettings || {}, permissionKey);
  }

  /**
   * Check whether a tool execution is permitted by user settings.
   * @param {object} tool - Tool definition from registry
   * @param {number} canvasUserId - The Canvas user ID
   * @returns {{ allowed: boolean, reason: string, requiredPermission: string|null }}
   */
  function checkToolPermissionForUser(tool, canvasUserId) {
    const userData = userStorage.loadOrCreateUser(canvasUserId);
    return checkToolPerm(tool, userData.agentSettings || {});
  }

  /**
   * Get the user-facing reason a specific action is blocked.
   * @param {string} permissionKey - The permission that's blocking
   * @returns {string} User-friendly explanation
   */
  function getPermissionBlockedReason(permissionKey) {
    return getBlockedReason(permissionKey);
  }

  /**
   * Get the server-side agent configuration (safe subset for client consumption).
   * Does not expose internal paths, keys, or privileged config.
   * @returns {object} Public agent config
   */
  function getPublicConfig() {
    return {
      globalEnabled: config.agentEnabled,
      maxFileSizeMb: config.agentMaxFileSizeMb,
      maxConcurrentJobs: config.agentMaxConcurrentJobs,
    };
  }

  return {
    isAgenticHelperEnabled,
    getSettings,
    updateSettings,
    getPermissions,
    updatePermissions,
    checkUserPermission,
    checkToolPermissionForUser,
    getPermissionBlockedReason,
    getPublicConfig,
  };
}

module.exports = { createAgentService };
