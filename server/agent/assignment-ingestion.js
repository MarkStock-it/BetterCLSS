/**
 * assignment-ingestion.js
 * Assignment Ingestion Service
 *
 * Connects the existing Canvas API to the capability analysis system.
 *
 * Flow:
 *   Canvas API → Raw Assignment → Normalize → Analyze → Manifest
 *
 * This service sits above the existing Canvas API and does NOT
 * duplicate any Canvas API functionality.
 */

const { normalizeAssignment } = require('./assignment-normalizer');
const { analyzeAssignment } = require('./capability-analyzer');
const { createManifest, getManifestKey, isManifestStale } = require('./assignment-manifest');

/**
 * Create an assignment ingestion service.
 *
 * @param {object} canvasService - Existing Canvas service (from server/services/canvas-service.js)
 * @param {object} userStorage - Existing user storage (from user-storage.js)
 * @returns {object} Ingestion service API
 */
function createAssignmentIngestion(canvasService, userStorage) {

  /**
   * Fetch a single assignment from Canvas and its associated data.
   * Uses existing Canvas API functions — does NOT duplicate them.
   *
   * @param {object} auth - Canvas auth credentials { token, domain }
   * @param {number} courseId - Canvas course ID
   * @param {number} assignmentId - Canvas assignment ID
   * @returns {object} Raw Canvas data with assignment, course, rubric, submission
   */
  async function fetchAssignmentData(auth, courseId, assignmentId) {
    // Fetch the assignment with submission info
    const assignment = await canvasService.fetchOne(
      `/courses/${courseId}/assignments/${assignmentId}`,
      { include: ['submission', 'overrides', 'rubric', 'discussion_topic'] },
      auth
    );

    // Fetch course info
    let course = null;
    try {
      course = await canvasService.fetchOne(
        `/courses/${courseId}`,
        { include: ['total_scores', 'current_grading_period_scores', 'term'] },
        auth
      );
    } catch {
      // Course info is optional — assignment data is primary
    }

    // Fetch rubric separately if available
    let rubric = null;
    if (assignment.rubric_settings || assignment.rubric) {
      rubric = assignment.rubric || null;
    }

    // Submission is already included in the assignment response
    const submission = assignment.submission || null;

    return {
      assignment,
      course,
      rubric,
      submission,
    };
  }

  /**
   * Ingest a single assignment: fetch → normalize → analyze → manifest.
   *
   * @param {object} auth - Canvas auth credentials
   * @param {number} userId - Canvas user ID
   * @param {number} courseId - Canvas course ID
   * @param {number} assignmentId - Canvas assignment ID
   * @param {object} options - Additional options
   * @param {boolean} [options.forceRefresh=false] - Bypass cache
   * @returns {object} AssignmentManifest
   */
  async function ingestAssignment(auth, userId, courseId, assignmentId, options = {}) {
    const forceRefresh = options.forceRefresh || false;
    const manifestKey = `${userId}_${courseId}_${assignmentId}`;

    // Check cache unless forced refresh
    if (!forceRefresh) {
      const userData = userStorage.loadOrCreateUser(userId);
      const cachedManifests = Array.isArray(userData.agentManifests) ? userData.agentManifests : [];
      const cached = cachedManifests.find((m) => getManifestKey(m) === manifestKey);
      if (cached && !isManifestStale(cached)) {
        return cached;
      }
    }

    // Step 1: Fetch from Canvas
    const rawData = await fetchAssignmentData(auth, courseId, assignmentId);

    // Step 2: Normalize
    const normalized = normalizeAssignment(rawData.assignment, {
      course: rawData.course,
      rubric: rawData.rubric,
      submission: rawData.submission,
    });

    // Step 3: Analyze capabilities
    const analysis = analyzeAssignment(rawData.assignment, {
      course: rawData.course,
      rubric: rawData.rubric,
      submission: rawData.submission,
    });

    // Step 4: Build manifest
    const manifest = createManifest(normalized, analysis, { userId });

    // Step 5: Persist manifest
    persistManifest(userId, manifest);

    return manifest;
  }

  /**
   * Ingest multiple assignments for a user.
   * Fetches all active assignments and creates manifests for each.
   *
   * @param {object} auth - Canvas auth credentials
   * @param {number} userId - Canvas user ID
   * @param {object} options - Additional options
   * @param {boolean} [options.forceRefresh=false] - Bypass cache
   * @returns {object[]} Array of AssignmentManifests
   */
  async function ingestAllAssignments(auth, userId, options = {}) {
    const forceRefresh = options.forceRefresh || false;

    // Get all assignments using existing Canvas service
    const canvasAssignments = await canvasService.getAssignments(auth);

    // Get courses for course info lookup
    let courses = [];
    try {
      courses = await canvasService.getCourses(auth);
    } catch {
      // Courses optional
    }

    const courseMap = new Map();
    for (const course of courses) {
      courseMap.set(course.id, course);
    }

    const manifests = [];

    // Process assignments in parallel (with concurrency limit)
    const BATCH_SIZE = 5;
    for (let i = 0; i < canvasAssignments.length; i += BATCH_SIZE) {
      const batch = canvasAssignments.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (canvasAssignment) => {
          try {
            const manifest = await ingestAssignment(
              auth,
              userId,
              canvasAssignment.courseId,
              canvasAssignment.canvasId,
              { forceRefresh }
            );
            return manifest;
          } catch (error) {
            console.warn(
              `Failed to ingest assignment ${canvasAssignment.canvasId}:`,
              error.message
            );
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          manifests.push(result.value);
        }
      }
    }

    return manifests;
  }

  /**
   * Get a cached manifest for an assignment (if available).
   *
   * @param {number} userId - Canvas user ID
   * @param {number} courseId - Canvas course ID
   * @param {number} assignmentId - Canvas assignment ID
   * @returns {object|null} Cached manifest or null
   */
  function getCachedManifest(userId, courseId, assignmentId) {
    const userData = userStorage.loadOrCreateUser(userId);
    const manifests = Array.isArray(userData.agentManifests) ? userData.agentManifests : [];
    const key = `${userId}_${courseId}_${assignmentId}`;
    return manifests.find((m) => getManifestKey(m) === key) || null;
  }

  /**
   * Get all cached manifests for a user.
   *
   * @param {number} userId - Canvas user ID
   * @returns {object[]} Array of manifests
   */
  function getUserManifests(userId) {
    const userData = userStorage.loadOrCreateUser(userId);
    return Array.isArray(userData.agentManifests) ? userData.agentManifests : [];
  }

  /**
   * Persist a manifest to user storage.
   * Uses deduplication by manifest key.
   *
   * @param {number} userId - Canvas user ID
   * @param {object} manifest - AssignmentManifest to persist
   */
  function persistManifest(userId, manifest) {
    const userData = userStorage.loadOrCreateUser(userId);
    if (!Array.isArray(userData.agentManifests)) {
      userData.agentManifests = [];
    }

    const key = getManifestKey(manifest);
    const existingIndex = userData.agentManifests.findIndex(
      (m) => getManifestKey(m) === key
    );

    // Update or insert
    manifest.updatedAt = new Date().toISOString();
    if (existingIndex >= 0) {
      userData.agentManifests[existingIndex] = manifest;
    } else {
      userData.agentManifests.push(manifest);
    }

    // Limit stored manifests per user (keep most recent 100)
    if (userData.agentManifests.length > 100) {
      userData.agentManifests.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
      userData.agentManifests = userData.agentManifests.slice(0, 100);
    }

    userStorage.saveUserData(userId, userData);
  }

  /**
   * Remove a cached manifest.
   *
   * @param {number} userId - Canvas user ID
   * @param {number} courseId - Canvas course ID
   * @param {number} assignmentId - Canvas assignment ID
   * @returns {boolean} Whether a manifest was removed
   */
  function removeManifest(userId, courseId, assignmentId) {
    const userData = userStorage.loadOrCreateUser(userId);
    if (!Array.isArray(userData.agentManifests)) return false;

    const key = `${userId}_${courseId}_${assignmentId}`;
    const originalLength = userData.agentManifests.length;
    userData.agentManifests = userData.agentManifests.filter(
      (m) => getManifestKey(m) !== key
    );

    if (userData.agentManifests.length < originalLength) {
      userStorage.saveUserData(userId, userData);
      return true;
    }
    return false;
  }

  return {
    fetchAssignmentData,
    ingestAssignment,
    ingestAllAssignments,
    getCachedManifest,
    getUserManifests,
    persistManifest,
    removeManifest,
  };
}

module.exports = { createAssignmentIngestion };
