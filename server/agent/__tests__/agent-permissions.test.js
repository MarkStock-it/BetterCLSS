/**
 * agent-permissions.test.js
 * Comprehensive tests for Phase 30: Agent Permissions & Action Controls.
 *
 * Tests:
 * 1. Permission definitions and defaults
 * 2. Master switch enforcement
 * 3. Child permission checking
 * 4. Tool permission mapping
 * 5. Server-side enforcement in tool runtime
 * 6. Orchestrator permission checks
 * 7. Settings update and merge
 * 8. Validation
 * 9. Blocked reasons
 * 10. Integration with existing approval flow
 */

const assert = require('assert');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ─── Load modules ─────────────────────────────────────────────────

const {
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
} = require('../agent-permissions');

// ─── 1. Permission Definitions ────────────────────────────────────

console.log('\n1. Permission Definitions');

test('AGENT_PERMISSIONS has all expected keys', () => {
  const keys = Object.keys(AGENT_PERMISSIONS);
  assert(keys.includes('contentGeneration'));
  assert(keys.includes('artifactGeneration'));
  assert(keys.includes('canvasComments'));
  assert(keys.includes('canvasFileUpload'));
  assert(keys.includes('canvasSubmission'));
});

test('canvasSubmission defaults to false (safety)', () => {
  assert.strictEqual(AGENT_PERMISSIONS.canvasSubmission.defaultValue, false);
});

test('contentGeneration defaults to true', () => {
  assert.strictEqual(AGENT_PERMISSIONS.contentGeneration.defaultValue, true);
});

test('artifactGeneration defaults to true', () => {
  assert.strictEqual(AGENT_PERMISSIONS.artifactGeneration.defaultValue, true);
});

test('each permission has label, description, category', () => {
  for (const perm of Object.values(AGENT_PERMISSIONS)) {
    assert(typeof perm.label === 'string' && perm.label.length > 0);
    assert(typeof perm.description === 'string' && perm.description.length > 0);
    assert(['generation', 'canvas'].includes(perm.category));
  }
});

test('getDefaultPermissions returns all keys with correct defaults', () => {
  const defaults = getDefaultPermissions();
  assert.strictEqual(defaults.contentGeneration, true);
  assert.strictEqual(defaults.artifactGeneration, true);
  assert.strictEqual(defaults.canvasComments, true);
  assert.strictEqual(defaults.canvasFileUpload, true);
  assert.strictEqual(defaults.canvasSubmission, false);
});

// ─── 2. Master Switch Enforcement ─────────────────────────────────

console.log('\n2. Master Switch Enforcement');

test('master OFF blocks everything regardless of permissions', () => {
  const settings = { enabled: false, permissions: { contentGeneration: true } };
  const result = checkPermission(settings, 'contentGeneration');
  assert.strictEqual(result.allowed, false);
  assert(result.reason.includes('not enabled'));
});

test('master ON with no permissions object uses defaults', () => {
  const settings = { enabled: true };
  const result = checkPermission(settings, 'contentGeneration');
  assert.strictEqual(result.allowed, true);
});

test('master ON with permissions object checks specific permission', () => {
  const settings = { enabled: true, permissions: { contentGeneration: false } };
  const result = checkPermission(settings, 'contentGeneration');
  assert.strictEqual(result.allowed, false);
  assert(result.reason.includes('disabled'));
});

test('null settings blocks everything', () => {
  const result = checkPermission(null, 'contentGeneration');
  assert.strictEqual(result.allowed, false);
});

test('undefined settings blocks everything', () => {
  const result = checkPermission(undefined, 'contentGeneration');
  assert.strictEqual(result.allowed, false);
});

// ─── 3. Child Permission Checking ─────────────────────────────────

console.log('\n3. Child Permission Checking');

test('contentGeneration ON allows content', () => {
  const settings = { enabled: true, permissions: { contentGeneration: true } };
  assert.strictEqual(checkPermission(settings, 'contentGeneration').allowed, true);
});

test('contentGeneration OFF blocks content', () => {
  const settings = { enabled: true, permissions: { contentGeneration: false } };
  assert.strictEqual(checkPermission(settings, 'contentGeneration').allowed, false);
});

test('artifactGeneration OFF blocks artifacts', () => {
  const settings = { enabled: true, permissions: { artifactGeneration: false } };
  assert.strictEqual(checkPermission(settings, 'artifactGeneration').allowed, false);
});

test('canvasSubmission OFF blocks submission', () => {
  const settings = { enabled: true, permissions: { canvasSubmission: false } };
  assert.strictEqual(checkPermission(settings, 'canvasSubmission').allowed, false);
});

test('canvasSubmission ON allows submission', () => {
  const settings = { enabled: true, permissions: { canvasSubmission: true } };
  assert.strictEqual(checkPermission(settings, 'canvasSubmission').allowed, true);
});

test('unknown permission key returns not allowed', () => {
  const settings = { enabled: true };
  const result = checkPermission(settings, 'nonexistent');
  assert.strictEqual(result.allowed, false);
  assert(result.reason.includes('Unknown'));
});

// ─── 4. Tool Permission Mapping ───────────────────────────────────

console.log('\n4. Tool Permission Mapping');

test('checkToolPermission maps GENERATE to artifactGeneration', () => {
  const tool = { id: 'artifact.create_docx', permissions: ['GENERATE'] };
  const settings = { enabled: true, permissions: { artifactGeneration: true } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.requiredPermission, 'artifactGeneration');
});

test('checkToolPermission blocks when artifactGeneration is OFF', () => {
  const tool = { id: 'artifact.create_docx', permissions: ['GENERATE'] };
  const settings = { enabled: true, permissions: { artifactGeneration: false } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.requiredPermission, 'artifactGeneration');
});

test('checkToolPermission maps canvas.create_comment to canvasComments', () => {
  const tool = { id: 'canvas.create_comment', permissions: ['WRITE'] };
  const settings = { enabled: true, permissions: { canvasComments: true } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.requiredPermission, 'canvasComments');
});

test('checkToolPermission blocks canvas.create_comment when canvasComments OFF', () => {
  const tool = { id: 'canvas.create_comment', permissions: ['WRITE'] };
  const settings = { enabled: true, permissions: { canvasComments: false } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, false);
});

test('checkToolPermission maps canvas.submit_assignment to canvasSubmission', () => {
  const tool = { id: 'canvas.submit_assignment', permissions: ['SUBMIT'] };
  const settings = { enabled: true, permissions: { canvasSubmission: false } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.requiredPermission, 'canvasSubmission');
});

test('checkToolPermission allows READ-only tools when master ON', () => {
  const tool = { id: 'canvas.read_assignment', permissions: ['READ'] };
  const settings = { enabled: true, permissions: {} };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, true);
});

test('checkToolPermission blocks all tools when master OFF', () => {
  const tool = { id: 'canvas.read_assignment', permissions: ['READ'] };
  const settings = { enabled: false };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, false);
});

test('checkToolPermission with null tool returns not allowed', () => {
  const settings = { enabled: true };
  const result = checkToolPermission(null, settings);
  assert.strictEqual(result.allowed, false);
});

test('canvas.upload_file maps to canvasFileUpload', () => {
  const tool = { id: 'canvas.upload_file', permissions: ['WRITE'] };
  const settings = { enabled: true, permissions: { canvasFileUpload: false } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.requiredPermission, 'canvasFileUpload');
});

// ─── 5. Effective Permissions ─────────────────────────────────────

console.log('\n5. Effective Permissions');

test('getEffectivePermissions fills in defaults', () => {
  const settings = { enabled: true, permissions: {} };
  const perms = getEffectivePermissions(settings);
  assert.strictEqual(perms.contentGeneration, true);
  assert.strictEqual(perms.canvasSubmission, false);
});

test('getEffectivePermissions merges stored values', () => {
  const settings = { enabled: true, permissions: { canvasSubmission: true } };
  const perms = getEffectivePermissions(settings);
  assert.strictEqual(perms.canvasSubmission, true);
  assert.strictEqual(perms.contentGeneration, true); // still default
});

test('getEffectivePermissions with null settings uses defaults', () => {
  const perms = getEffectivePermissions(null);
  assert.strictEqual(perms.contentGeneration, true);
  assert.strictEqual(perms.canvasSubmission, false);
});

// ─── 6. Permissions List ──────────────────────────────────────────

console.log('\n6. Permissions List');

test('getPermissionsList returns all permissions with state', () => {
  const settings = { enabled: true, permissions: { canvasSubmission: true } };
  const list = getPermissionsList(settings);
  assert.strictEqual(list.length, 5);

  const submission = list.find(p => p.key === 'canvasSubmission');
  assert.strictEqual(submission.enabled, true);

  const content = list.find(p => p.key === 'contentGeneration');
  assert.strictEqual(content.enabled, true);
});

test('getPermissionsList with null settings uses defaults', () => {
  const list = getPermissionsList(null);
  assert.strictEqual(list.length, 5);
  const submission = list.find(p => p.key === 'canvasSubmission');
  assert.strictEqual(submission.enabled, false);
});

// ─── 7. Validation ────────────────────────────────────────────────

console.log('\n7. Validation');

test('validatePermissionsUpdate accepts valid keys', () => {
  const result = validatePermissionsUpdate({ contentGeneration: false });
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.sanitized, { contentGeneration: false });
});

test('validatePermissionsUpdate rejects unknown keys', () => {
  const result = validatePermissionsUpdate({ nonexistent: true });
  assert.strictEqual(result.valid, false);
  assert(result.errors[0].includes('nonexistent'));
});

test('validatePermissionsUpdate handles mixed valid/invalid', () => {
  const result = validatePermissionsUpdate({
    contentGeneration: true,
    fakePerm: false,
  });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.sanitized.contentGeneration, true);
  assert(!('fakePerm' in result.sanitized));
});

test('validatePermissionsUpdate coerces to boolean', () => {
  const result = validatePermissionsUpdate({ canvasSubmission: 1 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.sanitized.canvasSubmission, true);
});

test('validatePermissionsUpdate rejects non-object input', () => {
  const result = validatePermissionsUpdate('invalid');
  assert.strictEqual(result.valid, false);
});

test('validatePermissionsUpdate accepts empty object', () => {
  const result = validatePermissionsUpdate({});
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.sanitized, {});
});

// ─── 8. Merge Permissions ─────────────────────────────────────────

console.log('\n8. Merge Permissions');

test('mergePermissions merges new values with defaults', () => {
  const result = mergePermissions({}, { canvasSubmission: true });
  assert.strictEqual(result.canvasSubmission, true);
  assert.strictEqual(result.contentGeneration, true); // default
});

test('mergePermissions preserves existing values', () => {
  const current = { contentGeneration: false, canvasSubmission: false };
  const result = mergePermissions(current, { canvasSubmission: true });
  assert.strictEqual(result.contentGeneration, false); // preserved
  assert.strictEqual(result.canvasSubmission, true); // updated
});

test('mergePermissions with null current uses defaults', () => {
  const result = mergePermissions(null, { canvasSubmission: true });
  assert.strictEqual(result.contentGeneration, true);
  assert.strictEqual(result.canvasSubmission, true);
});

// ─── 9. Blocked Reasons ───────────────────────────────────────────

console.log('\n9. Blocked Reasons');

test('getBlockedReason returns clear message for each permission', () => {
  const keys = ['contentGeneration', 'artifactGeneration', 'canvasComments', 'canvasFileUpload', 'canvasSubmission'];
  for (const key of keys) {
    const reason = getBlockedReason(key);
    assert(typeof reason === 'string' && reason.length > 10);
    assert(reason.includes('disabled'));
  }
});

test('getBlockedReason for unknown key returns generic message', () => {
  const reason = getBlockedReason('nonexistent');
  assert(reason.includes('disabled'));
});

// ─── 10. Integration: Tool Runtime + Permissions ──────────────────

console.log('\n10. Integration with Tool Runtime');

test('tool runtime checks user permissions before execution', () => {
  // Simulate what the tool runtime does
  const { checkToolPermission: checkToolPerm } = require('../agent-permissions');
  const tool = { id: 'canvas.submit_assignment', permissions: ['SUBMIT'] };

  // User has submission disabled
  const settings = { enabled: true, permissions: { canvasSubmission: false } };
  const result = checkToolPerm(tool, settings);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.requiredPermission, 'canvasSubmission');
});

test('tool runtime allows read tools regardless of write permissions', () => {
  const tool = { id: 'canvas.read_assignment', permissions: ['READ'] };
  const settings = { enabled: true, permissions: { canvasFileUpload: false } };
  const result = checkToolPermission(tool, settings);
  assert.strictEqual(result.allowed, true);
});

// ─── 11. Edge Cases ───────────────────────────────────────────────

console.log('\n11. Edge Cases');

test('permissions object with all false', () => {
  const settings = {
    enabled: true,
    permissions: {
      contentGeneration: false,
      artifactGeneration: false,
      canvasComments: false,
      canvasFileUpload: false,
      canvasSubmission: false,
    },
  };

  for (const key of Object.keys(AGENT_PERMISSIONS)) {
    const result = checkPermission(settings, key);
    assert.strictEqual(result.allowed, false);
  }
});

test('permissions object with all true', () => {
  const settings = {
    enabled: true,
    permissions: {
      contentGeneration: true,
      artifactGeneration: true,
      canvasComments: true,
      canvasFileUpload: true,
      canvasSubmission: true,
    },
  };

  for (const key of Object.keys(AGENT_PERMISSIONS)) {
    const result = checkPermission(settings, key);
    assert.strictEqual(result.allowed, true);
  }
});

test('master switch OFF + all permissions ON still blocks', () => {
  const settings = {
    enabled: false,
    permissions: {
      contentGeneration: true,
      artifactGeneration: true,
      canvasComments: true,
      canvasFileUpload: true,
      canvasSubmission: true,
    },
  };

  for (const key of Object.keys(AGENT_PERMISSIONS)) {
    const result = checkPermission(settings, key);
    assert.strictEqual(result.allowed, false);
  }
});

test('disabling master does not affect stored permissions', () => {
  const settings = {
    enabled: false,
    permissions: { canvasSubmission: true },
  };
  // Permission check says blocked because master is OFF
  assert.strictEqual(checkPermission(settings, 'canvasSubmission').allowed, false);
  // But the stored value is still true
  assert.strictEqual(settings.permissions.canvasSubmission, true);
});

test('re-enabling master respects stored permissions', () => {
  const settings = {
    enabled: true,
    permissions: { canvasSubmission: true },
  };
  assert.strictEqual(checkPermission(settings, 'canvasSubmission').allowed, true);
});

// ─── 12. Agent Service Integration ────────────────────────────────

console.log('\n12. Agent Service Integration');

test('agent-service exposes permission methods', () => {
  const { createAgentService } = require('../../services/agent-service');
  const mockUserStorage = {
    loadOrCreateUser: (id) => ({
      userId: id,
      agentSettings: {
        enabled: true,
        permissions: { canvasSubmission: false },
      },
    }),
    isAgentEnabled: () => true,
    updateAgentSettings: () => {},
  };
  const service = createAgentService({ agentEnabled: true }, mockUserStorage);

  assert(typeof service.getPermissions === 'function');
  assert(typeof service.updatePermissions === 'function');
  assert(typeof service.checkUserPermission === 'function');
  assert(typeof service.checkToolPermissionForUser === 'function');
  assert(typeof service.getPermissionBlockedReason === 'function');
});

test('agent-service getPermissions returns permission list', () => {
  const { createAgentService } = require('../../services/agent-service');
  const mockUserStorage = {
    loadOrCreateUser: (id) => ({
      userId: id,
      agentSettings: {
        enabled: true,
        permissions: { canvasSubmission: true, contentGeneration: false },
      },
    }),
    isAgentEnabled: () => true,
    updateAgentSettings: () => {},
  };
  const service = createAgentService({ agentEnabled: true }, mockUserStorage);
  const perms = service.getPermissions(100);
  assert(Array.isArray(perms));
  assert.strictEqual(perms.length, 5);

  const submission = perms.find(p => p.key === 'canvasSubmission');
  assert.strictEqual(submission.enabled, true);

  const content = perms.find(p => p.key === 'contentGeneration');
  assert.strictEqual(content.enabled, false);
});

test('agent-service checkUserPermission works', () => {
  const { createAgentService } = require('../../services/agent-service');
  const mockUserStorage = {
    loadOrCreateUser: (id) => ({
      userId: id,
      agentSettings: {
        enabled: true,
        permissions: { canvasSubmission: false },
      },
    }),
    isAgentEnabled: () => true,
    updateAgentSettings: () => {},
  };
  const service = createAgentService({ agentEnabled: true }, mockUserStorage);
  const result = service.checkUserPermission(100, 'canvasSubmission');
  assert.strictEqual(result.allowed, false);
});

// ─── Summary ───────────────────────────────────────────────────────

console.log(`\n==================================================`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
}
