/**
 * tool-registry.js
 * Centralized Tool Registry for Agentic Helper.
 *
 * This is the single source of truth for what tools are available.
 * Each tool has an ID, name, description, input schema, permissions,
 * and an execute function.
 *
 * The registry must be the authoritative list — no tool can be
 * executed without being registered here.
 */

// ─── Permission Levels ───────────────────────────────────────────────

const TOOL_PERMISSIONS = {
  READ: 'READ',           // Read-only access to data
  GENERATE: 'GENERATE',   // Generate local artifacts (files)
  WRITE: 'WRITE',         // Write to external systems (comments, uploads)
  SUBMIT: 'SUBMIT',       // Submit assignments — highest risk, requires approval
};

// ─── Tool Registry ───────────────────────────────────────────────────

const tools = new Map();

/**
 * Register a tool.
 * @param {object} tool
 * @param {string} tool.id - Unique tool identifier (e.g., 'canvas.read_assignment')
 * @param {string} tool.name - Human-readable name
 * @param {string} tool.description - What the tool does
 * @param {object} tool.inputSchema - JSON schema for input validation
 * @param {string[]} tool.permissions - Required permission levels
 * @param {string} tool.category - Tool category (e.g., 'canvas', 'file')
 * @param {function} tool.execute - async (args, context) => result
 * @param {number} [tool.maxResultSize] - Max result size in bytes (default: 50000)
 */
function registerTool(tool) {
  if (!tool || !tool.id || !tool.execute) {
    throw new Error('Tool must have id and execute function');
  }
  if (typeof tool.execute !== 'function') {
    throw new Error(`Tool ${tool.id} execute must be a function`);
  }
  // Determine risk level from permissions
  const permissions = tool.permissions || [TOOL_PERMISSIONS.READ];
  let riskLevel = 'low';
  if (permissions.includes(TOOL_PERMISSIONS.SUBMIT)) riskLevel = 'critical';
  else if (permissions.includes(TOOL_PERMISSIONS.WRITE)) riskLevel = 'medium';
  else if (permissions.includes(TOOL_PERMISSIONS.GENERATE)) riskLevel = 'low';

  tools.set(tool.id, {
    id: tool.id,
    name: tool.name || tool.id,
    description: tool.description || '',
    inputSchema: tool.inputSchema || { type: 'object' },
    permissions,
    category: tool.category || 'unknown',
    execute: tool.execute,
    maxResultSize: tool.maxResultSize || 50000,
    riskLevel,
    availability: 'available', // Could be extended for conditional availability
  });
}

/**
 * Get a tool by ID.
 * @param {string} toolId
 * @returns {object|undefined}
 */
function getTool(toolId) {
  return tools.get(toolId);
}

/**
 * Get all registered tools.
 * @returns {object[]}
 */
function getAllTools() {
  return [...tools.values()];
}

/**
 * Get tools by category.
 * @param {string} category
 * @returns {object[]}
 */
function getToolsByCategory(category) {
  return [...tools.values()].filter((t) => t.category === category);
}

/**
 * Get tool definitions (without execute functions) for AI consumption.
 * @returns {object[]}
 */
function getToolDefinitions() {
  return [...tools.values()].map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    permissions: tool.permissions,
    category: tool.category,
    riskLevel: tool.riskLevel || 'unknown',
    availability: tool.availability || 'unknown',
  }));
}

/**
 * Check if a tool exists.
 * @param {string} toolId
 * @returns {boolean}
 */
function hasTool(toolId) {
  return tools.has(toolId);
}

/**
 * Get count of registered tools.
 * @returns {number}
 */
function getToolCount() {
  return tools.size;
}

/**
 * Clear all tools (for testing only).
 */
function clearTools() {
  tools.clear();
}

module.exports = {
  TOOL_PERMISSIONS,
  registerTool,
  getTool,
  getAllTools,
  getToolsByCategory,
  getToolDefinitions,
  hasTool,
  getToolCount,
  clearTools,
};
