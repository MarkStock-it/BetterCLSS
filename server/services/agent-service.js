/**
 * agent-service.js
 * Agentic Helper service boundary.
 *
 * This is the initial foundation for the Agentic Helper feature.
 * It provides:
 *   - Feature gate: isAgenticHelperEnabled()
 *   - Settings management: getSettings(), updateSettings()
 *   - Service boundary for future agent operations
 *
 * Future phases will add:
 *   - Capability analysis
 *   - Assignment planning
 *   - Generation / artifact creation
 *   - Validation
 *   - Tool execution (Canvas integration)
 *   - Job management and state machine
 */

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
   * @returns {object} The agent settings object
   */
  function getSettings(canvasUserId) {
    const userData = userStorage.loadOrCreateUser(canvasUserId);
    return {
      enabled: Boolean(userData.agentSettings && userData.agentSettings.enabled),
      enabledAt: (userData.agentSettings && userData.agentSettings.enabledAt) || null,
      lastToggledAt: (userData.agentSettings && userData.agentSettings.lastToggledAt) || null,
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
    getPublicConfig,
  };
}

module.exports = { createAgentService };
