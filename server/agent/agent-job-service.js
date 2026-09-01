/**
 * agent-job-service.js
 * Agent Job Service
 *
 * Manages the lifecycle of Agentic Helper jobs:
 *   - Creation (with feature gate, idempotency, capability check)
 *   - State transitions (controlled by state machine)
 *   - Progress tracking
 *   - Error handling and retry logic
 *   - Event history
 *   - User isolation
 *
 * This service does NOT implement AI generation, Canvas submission,
 * or any actual agent work. It provides the runtime backbone
 * that future components will execute inside.
 */

const {
  JOB_STATES,
  TERMINAL_STATES,
  isTerminalState,
  isValidTransition,
  transition,
  getStateProgress,
  getStateMetadata,
  classifyError,
  ERROR_CATEGORIES,
} = require('./job-state-machine');

/**
 * Create an Agent Job Service.
 *
 * @param {object} agentService - Existing agent service (feature gate)
 * @param {object} assignmentIngestion - Assignment ingestion service
 * @param {object} userStorage - User storage layer
 * @returns {object} Job service API
 */
function createAgentJobService(agentService, assignmentIngestion, userStorage) {

  /**
   * Generate a unique job ID.
   * @returns {string}
   */
  function generateJobId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `ajob_${timestamp}_${random}`;
  }

  /**
   * Create an event entry for a job.
   * @param {string} jobId
   * @param {string} type - Event type
   * @param {string} stage - Current stage
   * @param {object} [metadata] - Additional info
   * @returns {object}
   */
  function createEvent(jobId, type, stage, metadata = {}) {
    return {
      jobId,
      type,
      stage,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Create a new agent job.
   *
   * @param {object} params
   * @param {number} params.userId - Canvas user ID
   * @param {number} params.courseId - Canvas course ID
   * @param {number} params.assignmentId - Canvas assignment ID
   * @param {object} [params.manifest] - Pre-fetched manifest (optional)
   * @returns {object} The created job
   * @throws {Error} If feature disabled, duplicate exists, or creation fails
   */
  function createJob({ userId, courseId, assignmentId, manifest }) {
    // Step 1: Verify Agentic Helper is enabled
    if (!agentService.isAgenticHelperEnabled(userId)) {
      throw new Error('AGENT_DISABLED');
    }

    // Step 2: Check for existing active job (idempotency)
    const existing = findActiveJob(userId, courseId, assignmentId);
    if (existing) {
      return existing; // Return existing job instead of creating duplicate
    }

    // Step 3: Get or use provided manifest
    const jobManifest = manifest || assignmentIngestion.getCachedManifest(userId, courseId, assignmentId);

    // Step 4: Determine initial state based on capability result
    let initialState = JOB_STATES.DISCOVERED;
    let capabilityStatus = 'UNKNOWN';

    if (jobManifest && jobManifest.capabilityResult) {
      capabilityStatus = jobManifest.capabilityResult.status;

      switch (capabilityStatus) {
        case 'SUPPORTED':
          initialState = JOB_STATES.DISCOVERED;
          break;
        case 'UNSUPPORTED':
          initialState = JOB_STATES.UNSUPPORTED;
          break;
        case 'UNKNOWN':
          initialState = JOB_STATES.USER_ACTION_REQUIRED;
          break;
        case 'PARTIAL':
          initialState = JOB_STATES.USER_ACTION_REQUIRED;
          break;
        default:
          initialState = JOB_STATES.DISCOVERED;
      }
    }

    // Step 5: Build the job
    const jobId = generateJobId();
    const now = new Date().toISOString();

    const job = {
      // Identity
      id: jobId,
      userId,
      courseId,
      assignmentId,

      // Assignment info (denormalized for quick access)
      assignmentTitle: jobManifest?.metadata?.title || '',
      courseName: jobManifest?.identity?.courseName || '',

      // State
      state: initialState,
      previousState: null,

      // Capability
      capabilityStatus,
      manifest: jobManifest || null,

      // Progress
      progress: {
        stage: initialState,
        percent: getStateProgress(initialState),
        message: getStateMetadata(initialState)?.description || '',
      },

      // Current step
      currentStep: null,

      // Error tracking
      error: null,
      retryCount: 0,
      maxRetries: 2,
      lastError: null,
      nextRetryAt: null,

      // Events history
      events: [
        createEvent(jobId, 'JOB_CREATED', initialState, {
          capabilityStatus,
          assignmentTitle: jobManifest?.metadata?.title || '',
        }),
      ],

      // Artifacts (for future use)
      artifacts: [],

      // Timestamps
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    // Step 6: If job starts in terminal state, mark completion
    if (initialState === JOB_STATES.UNSUPPORTED) {
      job.completedAt = now;
      job.events.push(createEvent(jobId, 'JOB_UNSUPPORTED', JOB_STATES.UNSUPPORTED, {
        reason: jobManifest?.capabilityResult?.reason || 'Assignment not supported',
      }));
    } else if (initialState === JOB_STATES.USER_ACTION_REQUIRED) {
      job.events.push(createEvent(jobId, 'JOB_USER_ACTION_REQUIRED', JOB_STATES.USER_ACTION_REQUIRED, {
        reason: jobManifest?.capabilityResult?.reason || 'User action required',
      }));
    }

    // Step 7: Persist
    persistJob(userId, job);

    return job;
  }

  /**
   * Find an active (non-terminal) job for a specific assignment.
   * @param {number} userId
   * @param {number} courseId
   * @param {number} assignmentId
   * @returns {object|null}
   */
  function findActiveJob(userId, courseId, assignmentId) {
    const jobs = getUserJobs(userId);
    return jobs.find(
      (j) =>
        j.courseId === courseId &&
        j.assignmentId === assignmentId &&
        !isTerminalState(j.state) &&
        j.state !== JOB_STATES.USER_ACTION_REQUIRED
    ) || null;
  }

  /**
   * Get all jobs for a user.
   * @param {number} userId
   * @returns {object[]}
   */
  function getUserJobs(userId) {
    const userData = userStorage.loadOrCreateUser(userId);
    return Array.isArray(userData.agentJobs) ? userData.agentJobs : [];
  }

  /**
   * Get a specific job by ID.
   * @param {number} userId
   * @param {string} jobId
   * @returns {object|null}
   */
  function getJob(userId, jobId) {
    const jobs = getUserJobs(userId);
    return jobs.find((j) => j.id === jobId) || null;
  }

  /**
   * Transition a job to a new state.
   *
   * @param {number} userId
   * @param {string} jobId
   * @param {string} newState
   * @param {object} [options] - Additional options
   * @param {string} [options.message] - Progress message
   * @param {object} [options.error] - Error info (if transitioning to FAILED)
   * @param {object} [options.metadata] - Event metadata
   * @returns {object} Updated job
   * @throws {Error} If transition is invalid
   */
  function transitionJob(userId, jobId, newState, options = {}) {
    const job = getJob(userId, jobId);
    if (!job) {
      throw new Error('JOB_NOT_FOUND');
    }

    // Attempt transition
    const result = transition(job.state, newState);
    if (!result.valid) {
      throw new Error(`INVALID_TRANSITION: ${result.reason}`);
    }

    const now = new Date().toISOString();

    // Update state
    job.previousState = job.state;
    job.state = newState;
    job.updatedAt = now;

    // Update progress
    const meta = getStateMetadata(newState);
    job.progress = {
      stage: newState,
      percent: meta?.percent ?? null,
      message: options.message || meta?.description || '',
    };

    // Record event
    const eventType = getEventType(newState);
    job.events.push(createEvent(jobId, eventType, newState, {
      from: result.from,
      to: result.to,
      ...options.metadata,
    }));

    // Handle specific state transitions
    if (newState === JOB_STATES.EXECUTING && !job.startedAt) {
      job.startedAt = now;
    }

    if (isTerminalState(newState)) {
      job.completedAt = now;

      if (newState === JOB_STATES.FAILED && options.error) {
        job.error = {
          code: options.error.code || 'UNKNOWN_ERROR',
          message: options.error.message || 'An unknown error occurred',
          category: classifyError(options.error),
          step: job.previousState,
          timestamp: now,
        };
        job.lastError = job.error;
      }
    }

    // Persist
    persistJob(userId, job);

    return job;
  }

  /**
   * Handle a job failure with retry logic.
   *
   * @param {number} userId
   * @param {string} jobId
   * @param {object} error - Error that caused failure
   * @returns {object} Updated job
   */
  function handleJobFailure(userId, jobId, error) {
    const job = getJob(userId, jobId);
    if (!job) {
      throw new Error('JOB_NOT_FOUND');
    }

    const category = classifyError(error);
    const now = new Date().toISOString();

    // Record the error
    job.error = {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      category,
      step: job.state,
      timestamp: now,
    };
    job.lastError = job.error;
    job.retryCount += 1;

    // Decide: retry or fail permanently
    if (category === ERROR_CATEGORIES.RETRYABLE && job.retryCount <= job.maxRetries) {
      // Schedule retry
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, job.retryCount - 1));
      job.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      job.updatedAt = now;

      job.events.push(createEvent(jobId, 'JOB_RETRY_SCHEDULED', job.state, {
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        nextRetryAt: job.nextRetryAt,
        error: job.error,
      }));

      persistJob(userId, job);
      return job;
    }

    // Fail permanently
    return transitionJob(userId, jobId, JOB_STATES.FAILED, {
      error,
      metadata: { category, retryCount: job.retryCount },
    });
  }

  /**
   * Cancel a non-terminal job.
   *
   * @param {number} userId
   * @param {string} jobId
   * @returns {object} Updated job
   */
  function cancelJob(userId, jobId) {
    return transitionJob(userId, jobId, JOB_STATES.CANCELLED, {
      message: 'Job cancelled by user',
      metadata: { cancelledBy: 'user' },
    });
  }

  /**
   * Get jobs filtered by state.
   *
   * @param {number} userId
   * @param {string} [state] - Filter by state
   * @returns {object[]}
   */
  function getJobsByState(userId, state) {
    const jobs = getUserJobs(userId);
    if (!state) return jobs;
    return jobs.filter((j) => j.state === state);
  }

  /**
   * Get a summary of job counts by state.
   *
   * @param {number} userId
   * @returns {object}
   */
  function getJobSummary(userId) {
    const jobs = getUserJobs(userId);
    const summary = {
      total: jobs.length,
      running: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      unsupported: 0,
      needsAttention: 0,
      cancelled: 0,
    };

    for (const job of jobs) {
      switch (job.state) {
        case JOB_STATES.DISCOVERED:
        case JOB_STATES.ANALYZING:
        case JOB_STATES.CAPABILITY_CHECK:
        case JOB_STATES.PLANNING:
        case JOB_STATES.GENERATING:
        case JOB_STATES.REFINING:
        case JOB_STATES.VALIDATING:
        case JOB_STATES.READY:
        case JOB_STATES.EXECUTING:
          summary.running++;
          break;
        case JOB_STATES.COMPLETED:
          summary.completed++;
          break;
        case JOB_STATES.FAILED:
          summary.failed++;
          break;
        case JOB_STATES.UNSUPPORTED:
          summary.unsupported++;
          break;
        case JOB_STATES.USER_ACTION_REQUIRED:
          summary.needsAttention++;
          break;
        case JOB_STATES.CANCELLED:
          summary.cancelled++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get a user-safe representation of a job (no internal details).
   *
   * @param {object} job
   * @returns {object}
   */
  function sanitizeJob(job) {
    return {
      id: job.id,
      userId: job.userId,
      courseId: job.courseId,
      assignmentId: job.assignmentId,
      assignmentTitle: job.assignmentTitle,
      courseName: job.courseName,
      state: job.state,
      stateLabel: getStateMetadata(job.state)?.label || job.state,
      capabilityStatus: job.capabilityStatus,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error ? {
        code: job.error.code,
        message: job.error.message,
        category: job.error.category,
      } : null,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      artifactCount: job.artifacts?.length || 0,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  /**
   * Get events for a job.
   *
   * @param {number} userId
   * @param {string} jobId
   * @returns {object[]}
   */
  function getJobEvents(userId, jobId) {
    const job = getJob(userId, jobId);
    return job ? job.events : [];
  }

  /**
   * Persist a job to user storage.
   * Uses deduplication by job ID.
   *
   * @param {number} userId
   * @param {object} job
   */
  function persistJob(userId, job) {
    const userData = userStorage.loadOrCreateUser(userId);
    if (!Array.isArray(userData.agentJobs)) {
      userData.agentJobs = [];
    }

    const existingIndex = userData.agentJobs.findIndex((j) => j.id === job.id);
    if (existingIndex >= 0) {
      userData.agentJobs[existingIndex] = job;
    } else {
      userData.agentJobs.push(job);
    }

    // Limit stored jobs (keep most recent 200)
    if (userData.agentJobs.length > 200) {
      userData.agentJobs.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
      userData.agentJobs = userData.agentJobs.slice(0, 200);
    }

    userStorage.saveUserData(userId, userData);
  }

  /**
   * Map a state to an event type.
   * @param {string} state
   * @returns {string}
   */
  function getEventType(state) {
    const map = {
      [JOB_STATES.DISCOVERED]: 'JOB_DISCOVERED',
      [JOB_STATES.ANALYZING]: 'JOB_STARTED_ANALYZING',
      [JOB_STATES.CAPABILITY_CHECK]: 'JOB_CAPABILITY_CHECK',
      [JOB_STATES.PLANNING]: 'JOB_ENTERED_PLANNING',
      [JOB_STATES.GENERATING]: 'JOB_GENERATION_STARTED',
      [JOB_STATES.REFINING]: 'JOB_REFINING_STARTED',
      [JOB_STATES.VALIDATING]: 'JOB_VALIDATION_STARTED',
      [JOB_STATES.READY]: 'JOB_READY',
      [JOB_STATES.EXECUTING]: 'JOB_EXECUTION_STARTED',
      [JOB_STATES.COMPLETED]: 'JOB_COMPLETED',
      [JOB_STATES.FAILED]: 'JOB_FAILED',
      [JOB_STATES.UNSUPPORTED]: 'JOB_UNSUPPORTED',
      [JOB_STATES.USER_ACTION_REQUIRED]: 'JOB_USER_ACTION_REQUIRED',
      [JOB_STATES.CANCELLED]: 'JOB_CANCELLED',
    };
    return map[state] || 'JOB_STATE_CHANGED';
  }

  /**
   * Add an event to a job (used by tool runtime and future components).
   * @param {string} jobId
   * @param {string} type
   * @param {object} [metadata]
   */
  function addEvent(jobId, type, metadata = {}, userId) {
    // If userId is provided, search directly
    if (userId) {
      const jobs = getUserJobs(userId);
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        job.events.push(createEvent(jobId, type, job.state, metadata));
        persistJob(userId, job);
        return;
      }
    }
  }

  return {
    createJob,
    getJob,
    getUserJobs,
    getJobsByState,
    getJobSummary,
    getJobEvents,
    transitionJob,
    handleJobFailure,
    cancelJob,
    sanitizeJob,
    findActiveJob,
    persistJob,
    addEvent,
  };
}

module.exports = { createAgentJobService };
