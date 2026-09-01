const LEGACY_SEEDED_LINKS = new Set([
  'https://usc.instructure.com',
  'https://mail.usc.edu',
  'https://drive.google.com',
]);

export function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due - today) / 86400000);
}

export function readAgentSettings() {
  try {
    const raw = localStorage.getItem('bclss_agent_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        enabledAt: parsed.enabledAt || null,
        lastToggledAt: parsed.lastToggledAt || null,
        permissions: {
          contentGeneration: parsed.permissions?.contentGeneration !== undefined ? Boolean(parsed.permissions.contentGeneration) : true,
          artifactGeneration: parsed.permissions?.artifactGeneration !== undefined ? Boolean(parsed.permissions.artifactGeneration) : true,
          canvasComments: parsed.permissions?.canvasComments !== undefined ? Boolean(parsed.permissions.canvasComments) : true,
          canvasFileUpload: parsed.permissions?.canvasFileUpload !== undefined ? Boolean(parsed.permissions.canvasFileUpload) : true,
          canvasSubmission: parsed.permissions?.canvasSubmission !== undefined ? Boolean(parsed.permissions.canvasSubmission) : false,
        },
      };
    }
  } catch {
    // Ignore invalid storage
  }
  return {
    enabled: false, enabledAt: null, lastToggledAt: null,
    permissions: {
      contentGeneration: true, artifactGeneration: true,
      canvasComments: true, canvasFileUpload: true, canvasSubmission: false,
    },
  };
}

export function writeAgentSettings(settings) {
  try {
    localStorage.setItem('bclss_agent_settings', JSON.stringify({
      enabled: Boolean(settings.enabled),
      enabledAt: settings.enabledAt || null,
      lastToggledAt: settings.lastToggledAt || null,
      permissions: settings.permissions || {
        contentGeneration: true, artifactGeneration: true,
        canvasComments: true, canvasFileUpload: true, canvasSubmission: false,
      },
    }));
  } catch {
    // Keep in-memory state usable when storage is unavailable
  }
}

export function readDashboardData() {
  const fallback = {
    assignments: [],
    announcements: [],
    events: [],
    grades: [],
    links: [],
    studyTasks: [],
    studyHistory: [],
    studyDecks: [],
    studyNote: '',
    connected: false,
    name: '',
  };

  try {
    const local = JSON.parse(localStorage.getItem('bclss_local') || '{}');
    const canvas = JSON.parse(localStorage.getItem('bclss_canvas_cache') || '{}');
    const localAssignments = Array.isArray(local.assignments) ? local.assignments : [];
    const canvasOverrides = local.canvasOverrides && typeof local.canvasOverrides === 'object'
      ? local.canvasOverrides
      : {};
    const canvasAssignments = Array.isArray(canvas.assignments)
      ? canvas.assignments.map((item) => {
        const state = String(item.submissionState || '').toLowerCase();
        const canvasDone = Boolean(
          item.graded
          || item.submitted
          || item.submittedAt
          || ['submitted', 'graded', 'pending_review', 'complete'].includes(state)
        );
        const override = canvasOverrides[item.id] || {};
        const done = typeof override.done === 'boolean' ? override.done : canvasDone;
        const due = item.dueAt ? String(item.dueAt).split('T')[0] : null;
        const remaining = daysUntil(due);          return {
          id: item.id,
          canvasId: item.canvasId || null,
          courseId: item.courseId || null,
          title: item.title,
          subject: item.courseName || item.courseCode || 'Canvas',
          courseName: item.courseName || null,
          due,
          done,
          source: 'canvas',
          priority: remaining !== null && remaining <= 1
            ? 'high'
            : remaining !== null && remaining <= 3
              ? 'medium'
              : 'low',
        };
      })
      : [];
    const links = Array.isArray(local.links)
      ? local.links.filter((item) => !(
        [1, 2, 3].includes(Number(item.id))
        && LEGACY_SEEDED_LINKS.has(String(item.url || '').replace(/\/$/, ''))
      ))
      : [];
    if (Array.isArray(local.links) && links.length !== local.links.length) {
      local.links = links;
      localStorage.setItem('bclss_local', JSON.stringify(local));
    }
    return {
      assignments: [
        ...canvasAssignments,
        ...localAssignments.map((item) => ({ ...item, source: item.source || 'local' })),
      ],
      announcements: [
        ...(Array.isArray(canvas.announcements) ? canvas.announcements : []),
        ...(Array.isArray(local.announcements) ? local.announcements : []),
      ],
      events: Array.isArray(local.events) ? local.events : [],
      grades: [
        ...(Array.isArray(canvas.grades) ? canvas.grades : []),
        ...(Array.isArray(local.grades) ? local.grades : []),
      ],
      links,
      studyTasks: Array.isArray(local.studyTasks) ? local.studyTasks : [],
      studyHistory: Array.isArray(local.studyHistory) ? local.studyHistory : [],
      studyDecks: Array.isArray(local.studyDecks) ? local.studyDecks : [],
      studyNote: local.studyCurrentNote && typeof local.studyCurrentNote.content === 'string'
        ? local.studyCurrentNote.content
        : '',
      connected: Boolean(localStorage.getItem('bclss_canvas_token')),
      name: localStorage.getItem('bclss_student_name') || '',
      agentSettings: readAgentSettings(),
    };
  } catch {
    return fallback;
  }
}

export function updateStoredLocalData(updater) {
  try {
    const local = JSON.parse(localStorage.getItem('bclss_local') || '{}');
    const safeLocal = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
    updater(safeLocal);
    localStorage.setItem('bclss_local', JSON.stringify(safeLocal));
  } catch {
    // Keep the in-memory StudentHub state usable when browser storage is unavailable.
  }
}

export function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function weekStartKey(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
  return dateKey(start);
}

export function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatTimerValue(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function buildStudyStats(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  const currentWeek = weekStartKey();
  const weekEntries = safeHistory.filter((entry) => (
    entry.week === currentWeek || (entry.date && entry.date >= currentWeek)
  ));
  const focusedSeconds = weekEntries.reduce(
    (total, entry) => total + (Number(entry.durationSecs) || 0),
    0
  );
  const studiedDays = [...new Set(safeHistory.map((entry) => entry.date).filter(Boolean))].sort();
  let streak = 0;
  let longestStreak = 0;
  let previous = null;
  studiedDays.forEach((day) => {
    streak = previous && ((new Date(day) - new Date(previous)) / 86400000 === 1) ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = day;
  });
  return { sessions: weekEntries.length, focusedSeconds, longestStreak };
}

export function smartSort(assignments) {
  const priority = { high: 0, medium: 1, low: 2 };
  const bucket = (item) => {
    if (item.done) return 5;
    const days = daysUntil(item.due);
    if (days !== null && days < 0) return 0;
    if (days === 0) return 1;
    if (days !== null && days <= 3) return 2;
    if (days !== null) return 3;
    return 4;
  };
  return [...assignments].sort((left, right) => (
    bucket(left) - bucket(right)
    || (priority[left.priority] ?? 3) - (priority[right.priority] ?? 3)
    || String(left.due || '9999').localeCompare(String(right.due || '9999'))
    || String(left.title || '').localeCompare(String(right.title || ''))
  ));
}

export function buildCourseDecks(assignments, savedDecks = []) {
  const groups = new Map();
  assignments.forEach((assignment) => {
    const course = String(assignment.subject || '').trim();
    if (!course) return;
    if (!groups.has(course)) groups.set(course, []);
    groups.get(course).push(assignment);
  });
  const courseDecks = [...groups.entries()]
    .map(([course, cards]) => ({
      id: course.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: course,
      cards: smartSort(cards),
      completed: cards.filter((card) => card.done).length,
      dueToday: cards.filter((card) => {
        const days = daysUntil(card.due);
        return !card.done && days !== null && days <= 0;
      }).length,
      generated: false,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const generatedDecks = savedDecks.map((deck) => ({
    id: `ai-${deck.id}`,
    title: deck.title,
    cards: Array.isArray(deck.cards)
      ? deck.cards.map((card, index) => ({
        id: card.id || `${deck.id}-${index}`,
        title: card.front,
        answer: card.back,
        done: Boolean(card.done),
        due: card.due || null,
      }))
      : [],
    completed: Array.isArray(deck.cards) ? deck.cards.filter((card) => card.done).length : 0,
    dueToday: Array.isArray(deck.cards) ? deck.cards.filter((card) => !card.done).length : 0,
    generated: true,
  }));
  return [...generatedDecks, ...courseDecks];
}

// ─── Agentic Helper API ─────────────────────────────────────────

/**
 * Get the API base URL for agent requests.
 * Uses the same base as the existing Canvas proxy.
 */
function getAgentApiBase() {
  try {
    return window.BCLSS_API_BASE_URL || '';
  } catch {
    return '';
  }
}

/**
 * Get the current user's Canvas user ID from localStorage.
 */
function getUserId() {
  try {
    return Number(localStorage.getItem('bclss_student_id') || '0') || 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch agent jobs for the current user.
 * @returns {Promise<Array>} List of agent jobs
 */
export async function fetchAgentJobs() {
  const userId = getUserId();
  if (!userId) return [];
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/jobs/${userId}`, {
      headers: {
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

/**
 * Fetch a specific agent job.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function fetchAgentJob(jobId) {
  const userId = getUserId();
  if (!userId || !jobId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/jobs/${userId}/${jobId}`, {
      headers: {
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.job || null;
  } catch {
    return null;
  }
}

/**
 * Fetch job events for the current user.
 * @param {string} jobId
 * @returns {Promise<Array>}
 */
export async function fetchAgentJobEvents(jobId) {
  const userId = getUserId();
  if (!userId || !jobId) return [];
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/jobs/${userId}/${jobId}/events`, {
      headers: {
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

/**
 * Create an approval request for a job.
 * @param {string} jobId
 * @param {string} artifactId
 * @param {number} [artifactVersion]
 * @returns {Promise<object|null>}
 */
export async function createAgentApproval(jobId, artifactId, artifactVersion = 1) {
  const userId = getUserId();
  if (!userId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/approvals/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
      body: JSON.stringify({
        jobId,
        type: 'SUBMISSION',
        artifactId,
        artifactVersion,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.approval || null;
  } catch {
    return null;
  }
}

/**
 * Approve an approval request.
 * @param {string} approvalId
 * @returns {Promise<object|null>}
 */
export async function approveAgentRequest(approvalId) {
  const userId = getUserId();
  if (!userId || !approvalId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/approvals/${userId}/${approvalId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.approval || null;
  } catch {
    return null;
  }
}

/**
 * Deny an approval request.
 * @param {string} approvalId
 * @param {string} [reason]
 * @returns {Promise<object|null>}
 */
export async function denyAgentRequest(approvalId, reason) {
  const userId = getUserId();
  if (!userId || !approvalId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/approvals/${userId}/${approvalId}/deny`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
      body: JSON.stringify({ reason: reason || 'Denied by user' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.approval || null;
  } catch {
    return null;
  }
}

/**
 * Download an artifact file.
 * @param {string} artifactId
 * @returns {Promise<Blob|null>}
 */
export async function downloadAgentArtifact(artifactId) {
  const userId = getUserId();
  if (!userId || !artifactId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/artifacts/${userId}/${artifactId}/download`, {
      headers: {
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
    });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

/**
 * Create a new agent job for an assignment.
 * @param {number} courseId
 * @param {number} assignmentId
 * @param {object} [manifest] - Pre-fetched manifest (optional)
 * @returns {Promise<object|null>}
 */
export async function createAgentJob(courseId, assignmentId, manifest) {
  const userId = getUserId();
  if (!userId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    console.log('[DIAGNOSTIC] Creating agent job:', { userId, courseId, assignmentId, base });
    const res = await fetch(`${base}/api/agent/jobs/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
      body: JSON.stringify({ courseId, assignmentId, manifest }),
    });
    console.log('[DIAGNOSTIC] Response received:', { status: res.status, ok: res.ok });
    if (!res.ok) return null;
    const data = await res.json();
    console.log('[DIAGNOSTIC] Parsed response:', { hasJob: !!data.job, jobKeys: data.job ? Object.keys(data.job) : 'N/A', responseKeys: Object.keys(data) });
    return data.job || null;
  } catch {
    return null;
  }
}

/**
 * Execute an agent job through the orchestrator.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function executeAgentJob(jobId) {
  const userId = getUserId();
  if (!userId || !jobId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/execute/${userId}/${jobId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Get agent job summary (counts by state).
 * @returns {Promise<object|null>}
 */
export async function fetchAgentSummary() {
  const userId = getUserId();
  if (!userId) return null;
  const base = getAgentApiBase();
  const token = localStorage.getItem('bclss_canvas_token') || '';
  const domain = localStorage.getItem('bclss_canvas_domain') || '';
  try {
    const res = await fetch(`${base}/api/agent/summary/${userId}`, {
      headers: {
        'x-canvas-token': token,
        'x-canvas-domain': domain,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.summary || null;
  } catch {
    return null;
  }
}

// ─── Agent Job Creation Helpers ─────────────────────────────────

/**
 * Quick client-side capability check for an assignment.
 * @param {Object} assignment - Assignment object with title, subject, etc.
 * @returns {boolean}
 */
export function canCreateAgentJob(assignment) {
  if (!assignment) return false;
  const hasTitle = Boolean(assignment.title?.trim());
  const hasContext = Boolean(assignment.subject || assignment.courseId);
  if (!hasTitle || !hasContext) return false;
  const titleLower = (assignment.title || '').toLowerCase();
  const unsupportedPatterns = [
    /exam|quiz|test/i,
    /presentation|pptx|slides/i,
    /discussion|forum/i,
    /attendance/i,
    /participation/i,
    /office hours/i
  ];
  return !unsupportedPatterns.some(pattern => pattern.test(titleLower));
}

/**
 * Create an agent job with proper error handling.
 * @param {Object} assignment - Assignment with id, courseId, title, etc.
 * @param {Function} [onError] - Callback for error handling
 * @returns {Promise<Object|null>} - Created job or null
 */
export async function createAgentJobSafe(assignment, onError) {
  const courseId = assignment?.courseId;
  const assignmentId = assignment?.canvasId || assignment?.id;
  console.log('[DIAGNOSTIC] createAgentJobSafe called with assignment:', { courseId, assignmentId, assignmentKeys: assignment ? Object.keys(assignment) : 'N/A' });
  if (!courseId || !assignmentId) {
    const err = 'Missing assignment data (courseId or id)';
    console.log('[DIAGNOSTIC] Assignment validation failed:', { courseId, assignmentId });
    onError?.(err);
    return null;
  }
  try {
    const manifest = {
      capabilityResult: { status: 'PENDING', warnings: [], reason: null }
    };
    const job = await createAgentJob(
      courseId,
      assignmentId,
      manifest
    );
    if (!job) {
      const err = 'Server returned empty job';
      console.log('[DIAGNOSTIC] Job creation returned empty:', { job });
      onError?.(err);
      return null;
    }
    console.log('[DIAGNOSTIC] Job created successfully:', { jobId: job.id });
    return job;
  } catch (error) {
    const errorMsg = error?.message || 'Unknown error creating job';
    console.log('[DIAGNOSTIC] Exception creating job:', { errorMsg });
    onError?.(errorMsg);
    return null;
  }
}
