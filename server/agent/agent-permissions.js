/**
 * agent-permissions.js
 * Server-side Agent Permissions Enforcement.
 *
 * Granular user controls for Agentic Helper actions.
 * These settings are enforced server-side — the frontend cannot bypass them.
 *
 * Master switch:
 *   agentSettings.enabled  — must be ON for any agent operation
 *
 * Child permissions:
 *   permissions.contentGeneration  — AI text/essay generation
 *   permissions.artifactGeneration — DOCX/TXT file creation
 *   permissions.canvasComments     — Post comments on assignments
 *   permissions.canvasFileUpload   — Upload files to Canvas
 *   permissions.canvasSubmission   — Submit assignments
 *
 * Rules:
 *   1. Master switch OFF → no agent execution (child permissions irrelevant)
 *   2. Child permission OFF → that specific action is blocked
 *   3. Tool permissions map to permission keys via PERMISSION_MAP
 *   4. Existing human approval requirements remain unchanged
 *   5. Settings changes mid-job take effect on the next action (not retroactive)
 */

// ─── Permission Definitions ───────────────────────────────────────

/**
 * Maps user-facing permission keys to internal identifiers.
 * Each key corresponds to a toggle the user can control.
 */
const AGENT_PERMISSIONS = {
  contentGeneration: {
    key: 'contentGeneration',
    label: 'Content generation',
    description: 'AI text and essay generation',
    defaultValue: true,
    category: 'generation',
  },
  artifactGeneration: {
    key: 'artifactGeneration',
    label: 'Artifact creation',
    description: 'DOCX and TXT file creation',
    defaultValue: true,
    category: 'generation',
  },
  canvasComments: {
    key: 'canvasComments',
    label: 'Canvas comments',
    description: 'Post comments on assignments',
    defaultValue: true,
    category: 'canvas',
  },
  canvasFileUpload: {
    key: 'canvasFileUpload',
    label: 'Canvas file uploads',
    description: 'Upload files to Canvas',
    defaultValue: true,
    category: 'canvas',
  },
  canvasSubmission: {
    key: 'canvasSubmission',
    label: 'Canvas submission',
    description: 'Submit assignments',
    defaultValue: false, // OFF by default — highest risk
    category: 'canvas',
  },
};

/**
 * Maps tool permission levels (from tool-registry) to user permission keys.
 * When a tool requires a permission level, we check if the user has granted
 * the corresponding permission.
 *
 * Tools with READ permission don't need user permission (always allowed).
 */
const TOOL_TO_USER_PERMISSION = {
  GENERATE: 'artifactGeneration',
  WRITE: null,  // WRITE maps to specific tool checks below
  SUBMIT: 'canvasSubmission',
};

/**
 * Maps specific tool IDs to user permission keys.
 * This allows fine-grained control beyond the generic permission levels.
 */
const TOOL_ID_PERMISSION_MAP = {
  // Artifact tools
  'artifact.create_docx': 'artifactGeneration',
  'artifact.create_txt': 'artifactGeneration',

  // Canvas write tools
  'canvas.create_comment': 'canvasComments',
  'canvas.upload_file': 'canvasFileUpload',
  'canvas.submit_assignment': 'canvasSubmission',

  // Content generation (AI calls in orchestrator)
  'content.generate': 'contentGeneration',
  'content.refine': 'contentGeneration',
};

// ─── Default Permissions ──────────────────────────────────────────

/**
 * Get default permissions (matching user-storage.js defaults).
 * @returns {object} Default permissions object
 */
function getDefaultPermissions() {
  const permissions = {};
  for (const [key, def] of Object.entries(AGENT_PERMISSIONS)) {
    permissions[key] = def.defaultValue;
  }
  return permissions;
}

// ─── Permission Checking ──────────────────────────────────────────

/**
 * Check whether a specific permission is enabled for a user.
 *
 * @param {object} agentSettings - User's agentSettings object
 * @param {string} permissionKey - Permission key to check
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkPermission(agentSettings, permissionKey) {
  // 1. Master switch must be ON
  if (!agentSettings || !agentSettings.enabled) {
    return { allowed: false, reason: 'Agentic Helper is not enabled' };
  }

  // 2. Permission must exist
  const permissionDef = AGENT_PERMISSIONS[permissionKey];
  if (!permissionDef) {
    return { allowed: false, reason: `Unknown permission: ${permissionKey}` };
  }

  // 3. Check the specific permission (defaults to the defined default if missing)
  const permissions = agentSettings.permissions || {};
  const allowed = permissions[permissionKey] !== undefined
    ? Boolean(permissions[permissionKey])
    : permissionDef.defaultValue;

  if (!allowed) {
    return {
      allowed: false,
      reason: `${permissionDef.label} is disabled in your settings`,
    };
  }

  return { allowed: true, reason: '' };
}

/**
 * Check whether a tool execution is permitted by user settings.
 *
 * @param {object} tool - Tool definition from registry
 * @param {object} agentSettings - User's agentSettings object
 * @returns {{ allowed: boolean, reason: string, requiredPermission: string|null }}
 */
function checkToolPermission(tool, agentSettings) {
  // Master switch
  if (!agentSettings || !agentSettings.enabled) {
    return { allowed: false, reason: 'Agentic Helper is not enabled', requiredPermission: null };
  }

  if (!tool) {
    return { allowed: false, reason: 'Tool not found', requiredPermission: null };
  }

  // Check by tool ID first (most specific)
  const toolPermKey = TOOL_ID_PERMISSION_MAP[tool.id];
  if (toolPermKey) {
    const check = checkPermission(agentSettings, toolPermKey);
    return { ...check, requiredPermission: toolPermKey };
  }

  // Check by permission level (generic)
  const permissions = tool.permissions || ['READ'];
  for (const permLevel of permissions) {
    const userPermKey = TOOL_TO_USER_PERMISSION[permLevel];
    if (userPermKey) {
      const check = checkPermission(agentSettings, userPermKey);
      if (!check.allowed) {
        return { ...check, requiredPermission: userPermKey };
      }
    }
  }

  // READ-only tools are always allowed when master switch is ON
  return { allowed: true, reason: '', requiredPermission: null };
}

/**
 * Get all permissions for a user's agent settings.
 * Returns a complete permissions object with defaults filled in.
 *
 * @param {object} agentSettings - User's agentSettings object
 * @returns {object} Complete permissions object
 */
function getEffectivePermissions(agentSettings) {
  const defaults = getDefaultPermissions();
  const stored = (agentSettings && agentSettings.permissions) || {};

  return {
    ...defaults,
    ...stored,
  };
}

/**
 * Get the list of available permissions with their current state.
 * Useful for the settings UI.
 *
 * @param {object} agentSettings - User's agentSettings object
 * @returns {object[]} Array of permission definitions with current enabled state
 */
function getPermissionsList(agentSettings) {
  const effective = getEffectivePermissions(agentSettings);

  return Object.values(AGENT_PERMISSIONS).map(def => ({
    key: def.key,
    label: def.label,
    description: def.description,
    enabled: effective[def.key],
    category: def.category,
    canToggle: true,
  }));
}

/**
 * Validate a permissions update object.
 * Only allows known permission keys to be set.
 *
 * @param {object} newPermissions - Permissions to update
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
function validatePermissionsUpdate(newPermissions) {
  const errors = [];
  const sanitized = {};

  if (!newPermissions || typeof newPermissions !== 'object') {
    return { valid: false, errors: ['Permissions must be an object'], sanitized: {} };
  }

  for (const [key, value] of Object.entries(newPermissions)) {
    if (!(key in AGENT_PERMISSIONS)) {
      errors.push(`Unknown permission: ${key}`);
      continue;
    }
    sanitized[key] = Boolean(value);
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/**
 * Merge new permissions with existing ones.
 * Only updates keys that are provided.
 *
 * @param {object} currentPermissions - Current permissions
 * @param {object} newPermissions - New permission values
 * @returns {object} Merged permissions
 */
function mergePermissions(currentPermissions, newPermissions) {
  const defaults = getDefaultPermissions();
  const current = { ...defaults, ...(currentPermissions || {}) };
  const updates = newPermissions || {};

  return { ...current, ...updates };
}

/**
 * Get the user-facing reason a specific action is blocked.
 * Returns a clear, actionable message.
 *
 * @param {string} permissionKey - The permission that's blocking
 * @returns {string} User-friendly explanation
 */
function getBlockedReason(permissionKey) {
  const reasons = {
    contentGeneration: 'Content generation is disabled. Enable it in Agentic Helper settings to generate text and essays.',
    artifactGeneration: 'Artifact creation is disabled. Enable it in Agentic Helper settings to create DOCX and TXT files.',
    canvasComments: 'Canvas comments are disabled. Enable them in Agentic Helper settings to post assignment comments.',
    canvasFileUpload: 'Canvas file uploads are disabled. Enable them in Agentic Helper settings to upload files.',
    canvasSubmission: 'Canvas submission is disabled. Enable it in Agentic Helper settings to submit assignments.',
  };

  return reasons[permissionKey] || 'This action is disabled in your Agentic Helper settings.';
}

module.exports = {
  AGENT_PERMISSIONS,
  TOOL_TO_USER_PERMISSION,
  TOOL_ID_PERMISSION_MAP,
  getDefaultPermissions,
  checkPermission,
  checkToolPermission,
  getEffectivePermissions,
  getPermissionsList,
  validatePermissionsUpdate,
  mergePermissions,
  getBlockedReason,
};
