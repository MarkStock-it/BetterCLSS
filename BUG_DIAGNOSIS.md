# Agent Job Creation Bug — Root Cause Analysis

## Issue
**"Could not create agent job: Server returned empty job"**

## Failure Path

### Frontend Request
`studenthub-app/src/lib/dashboard-data.js:610` — `createAgentJobSafe(assignment)`
- Calls `createAgentJob(courseId, assignmentId, manifest)`
- Posts to `POST /api/agent/jobs/:userId`
- Expects response: `{ success: true, job: { id, courseId, assignmentId, state, ... } }`

### Backend Route Handler
`server/routes/agent-routes.js:259` — `POST /api/agent/jobs/:userId`
```javascript
const job = agentJobService.createJob({ userId, courseId, assignmentId, manifest });
json(res, 201, { success: true, job: sanitized });
```

### Job Service Layer
`server/agent/agent-job-service.js:79` — `createJob()`
```javascript
function createJob({ userId, courseId, assignmentId, manifest }) {
  // Step 1: Verify Agentic Helper is enabled
  if (!agentService.isAgenticHelperEnabled(userId)) {
    throw new Error('AGENT_DISABLED');  // ← THROWS HERE
  }
  // ...
}
```

### Agent Service Check
`server/services/agent-service.js:36` — `isAgenticHelperEnabled(canvasUserId)`
```javascript
function isAgenticHelperEnabled(canvasUserId) {
  if (!config.agentEnabled) return false;  // Server-level: enabled (from env)
  return userStorage.isAgentEnabled(canvasUserId);  // ← User-level: FALSE
}
```

### User Storage Default
`user-storage.js:78` — `getDefaultUserData()`
```javascript
agentSettings: {
  enabled: false,  // ← ROOT CAUSE: Defaults to FALSE
  enabledAt: null,
  lastToggledAt: null,
  permissions: { ... }
}
```

## What Happens

1. Backend receives job creation request
2. Calls `isAgenticHelperEnabled(userId)`
3. User's `agentSettings.enabled` is `false` (default)
4. Function returns `false`
5. `createJob()` throws `AGENT_DISABLED` error
6. Backend route catches error and sends **403 Forbidden**:
   ```
   { error: 'agent_disabled', message: 'Agentic Helper is not enabled.' }
   ```
7. Frontend's `createAgentJob()` checks `if (!res.ok) return null;`
8. Frontend gets `null` and displays: **"Could not create agent job: Server returned empty job"**

## Why Frontend Shows Wrong Error
- Frontend receives 403 error response (status not OK)
- It treats any non-OK response as "empty job" rather than "feature disabled"
- Diagnostic logging shows `data.job` is falsy, but it's because the job was never created

## Solution Options

### Option 1: Enable Agent by Default (Simplest)
**File**: `user-storage.js` line 78

Change:
```javascript
agentSettings: {
  enabled: false,
```

To:
```javascript
agentSettings: {
  enabled: true,
```

**Pros**: One-line fix, agent immediately available
**Cons**: Enables for all users by default (may not be desired)

---

### Option 2: Frontend Enables Agent Before First Job (Better UX)
Requires adding frontend logic to call `POST /api/agent/settings/:userId` with `{ enabled: true }` before attempting job creation.

**Pros**: Explicit user consent
**Cons**: More code changes

---

### Option 3: Initialize Settings on First Canvas Connection
Could auto-enable agent when user first connects Canvas.

**Pros**: Contextual activation
**Cons**: Requires changes to authentication flow

---

## Recommended Fix
**Option 1** — change default to `enabled: true` in `user-storage.js`

This aligns with:
- The backend route already supports toggling (not used by frontend yet)
- The feature is "experimental" but functional (not truly disabled)
- Simpler UX for first-time users
- Can be toggled off via settings later if UI is implemented
