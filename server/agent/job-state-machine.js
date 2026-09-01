/**
 * job-state-machine.js
 * Agent Job State Machine
 *
 * Controls all state transitions for Agentic Helper jobs.
 * Ensures only valid transitions are allowed.
 *
 * Terminal states (job cannot transition further):
 *   COMPLETED, FAILED, UNSUPPORTED, CANCELLED
 *
 * Non-terminal states:
 *   DISCOVERED, ANALYZING, CAPABILITY_CHECK, PLANNING,
 *   GENERATING, REFINING, VALIDATING, READY, EXECUTING,
 *   USER_ACTION_REQUIRED
 */

// ─── State Definitions ───────────────────────────────────────────────

const JOB_STATES = {
  DISCOVERED: 'DISCOVERED',
  ANALYZING: 'ANALYZING',
  CAPABILITY_CHECK: 'CAPABILITY_CHECK',
  PLANNING: 'PLANNING',
  GENERATING: 'GENERATING',
  REFINING: 'REFINING',
  VALIDATING: 'VALIDATING',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  UNSUPPORTED: 'UNSUPPORTED',
  USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED',
  CANCELLED: 'CANCELLED',
};

const TERMINAL_STATES = new Set([
  JOB_STATES.COMPLETED,
  JOB_STATES.FAILED,
  JOB_STATES.UNSUPPORTED,
  JOB_STATES.CANCELLED,
]);

// ─── Valid Transitions ───────────────────────────────────────────────

const VALID_TRANSITIONS = {
  [JOB_STATES.DISCOVERED]: [
    JOB_STATES.ANALYZING,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.ANALYZING]: [
    JOB_STATES.CAPABILITY_CHECK,
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.CAPABILITY_CHECK]: [
    JOB_STATES.PLANNING,          // SUPPORTED
    JOB_STATES.UNSUPPORTED,       // UNSUPPORTED
    JOB_STATES.USER_ACTION_REQUIRED, // UNKNOWN or PARTIAL
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.PLANNING]: [
    JOB_STATES.GENERATING,
    JOB_STATES.USER_ACTION_REQUIRED,
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.GENERATING]: [
    JOB_STATES.REFINING,
    JOB_STATES.VALIDATING,
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.REFINING]: [
    JOB_STATES.VALIDATING,
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.VALIDATING]: [
    JOB_STATES.READY,
    JOB_STATES.GENERATING,  // Re-generate if validation fails
    JOB_STATES.FAILED,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.READY]: [
    JOB_STATES.EXECUTING,
    JOB_STATES.CANCELLED,
  ],

  [JOB_STATES.EXECUTING]: [
    JOB_STATES.COMPLETED,
    JOB_STATES.FAILED,
    JOB_STATES.READY,
    JOB_STATES.USER_ACTION_REQUIRED,
  ],

  // Terminal states — no transitions out
  [JOB_STATES.COMPLETED]: [],
  [JOB_STATES.FAILED]: [],
  [JOB_STATES.UNSUPPORTED]: [],
  [JOB_STATES.CANCELLED]: [],
  [JOB_STATES.USER_ACTION_REQUIRED]: [
    JOB_STATES.CANCELLED,
    JOB_STATES.EXECUTING,  // Resume after user provides required information
  ],
};

// ─── State Metadata ──────────────────────────────────────────────────

const STATE_METADATA = {
  [JOB_STATES.DISCOVERED]: {
    label: 'Discovered',
    description: 'Assignment identified, preparing for analysis',
    isTerminal: false,
    percent: 0,
  },
  [JOB_STATES.ANALYZING]: {
    label: 'Analyzing',
    description: 'Analyzing assignment requirements',
    isTerminal: false,
    percent: 10,
  },
  [JOB_STATES.CAPABILITY_CHECK]: {
    label: 'Checking Capabilities',
    description: 'Determining if Agentic Helper can complete this assignment',
    isTerminal: false,
    percent: 20,
  },
  [JOB_STATES.PLANNING]: {
    label: 'Planning',
    description: 'Planning assignment completion strategy',
    isTerminal: false,
    percent: 30,
  },
  [JOB_STATES.GENERATING]: {
    label: 'Generating',
    description: 'Generating assignment content',
    isTerminal: false,
    percent: 50,
  },
  [JOB_STATES.REFINING]: {
    label: 'Refining',
    description: 'Refining generated content for clarity and accuracy',
    isTerminal: false,
    percent: 70,
  },
  [JOB_STATES.VALIDATING]: {
    label: 'Validating',
    description: 'Validating output against requirements',
    isTerminal: false,
    percent: 80,
  },
  [JOB_STATES.READY]: {
    label: 'Ready',
    description: 'Content ready for review and submission',
    isTerminal: false,
    percent: 90,
  },
  [JOB_STATES.EXECUTING]: {
    label: 'Submitting',
    description: 'Uploading and submitting to Canvas',
    isTerminal: false,
    percent: 95,
  },
  [JOB_STATES.COMPLETED]: {
    label: 'Completed',
    description: 'Assignment successfully completed',
    isTerminal: true,
    percent: 100,
  },
  [JOB_STATES.FAILED]: {
    label: 'Failed',
    description: 'Job encountered an error',
    isTerminal: true,
    percent: null,
  },
  [JOB_STATES.UNSUPPORTED]: {
    label: 'Unsupported',
    description: 'Agentic Helper cannot complete this assignment',
    isTerminal: true,
    percent: null,
  },
  [JOB_STATES.USER_ACTION_REQUIRED]: {
    label: 'Needs Attention',
    description: 'Requires user input or decision',
    isTerminal: false,
    percent: null,
  },
  [JOB_STATES.CANCELLED]: {
    label: 'Cancelled',
    description: 'Job was cancelled',
    isTerminal: true,
    percent: null,
  },
};

// ─── Error Categories ────────────────────────────────────────────────

const ERROR_CATEGORIES = {
  RETRYABLE: 'RETRYABLE',
  NON_RETRYABLE: 'NON_RETRYABLE',
  USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED',
};

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Check if a state transition is valid.
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
function isValidTransition(currentState, nextState) {
  const allowed = VALID_TRANSITIONS[currentState];
  if (!allowed) return false;
  return allowed.includes(nextState);
}

/**
 * Get all valid next states from a given state.
 * @param {string} currentState
 * @returns {string[]}
 */
function getValidNextStates(currentState) {
  return VALID_TRANSITIONS[currentState] || [];
}

/**
 * Check if a state is terminal.
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

/**
 * Get metadata for a state.
 * @param {string} state
 * @returns {object|null}
 */
function getStateMetadata(state) {
  return STATE_METADATA[state] || null;
}

/**
 * Get progress percentage for a state.
 * @param {string} state
 * @returns {number|null}
 */
function getStateProgress(state) {
  const meta = STATE_METADATA[state];
  return meta ? meta.percent : null;
}

/**
 * Create a state transition result.
 * @param {string} fromState
 * @param {string} toState
 * @param {boolean} valid
 * @param {string} [reason]
 * @returns {object}
 */
function createTransitionResult(fromState, toState, valid, reason = '') {
  return {
    from: fromState,
    to: toState,
    valid,
    reason,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Attempt a state transition.
 * Returns a result object indicating success or failure.
 * Does NOT modify any job — caller is responsible for applying the change.
 *
 * @param {string} currentState
 * @param {string} requestedState
 * @returns {object} Transition result
 */
function transition(currentState, requestedState) {
  if (!JOB_STATES[currentState]) {
    return createTransitionResult(
      currentState,
      requestedState,
      false,
      `Invalid current state: ${currentState}`
    );
  }

  if (!JOB_STATES[requestedState]) {
    return createTransitionResult(
      currentState,
      requestedState,
      false,
      `Invalid requested state: ${requestedState}`
    );
  }

  if (isTerminalState(currentState)) {
    return createTransitionResult(
      currentState,
      requestedState,
      false,
      `Cannot transition from terminal state ${currentState}`
    );
  }

  if (!isValidTransition(currentState, requestedState)) {
    return createTransitionResult(
      currentState,
      requestedState,
      false,
      `Transition ${currentState} → ${requestedState} is not allowed`
    );
  }

  return createTransitionResult(currentState, requestedState, true, '');
}

/**
 * Classify an error into a category for retry decisions.
 *
 * @param {object} error - Error object with code, message, etc.
 * @returns {string} ERROR_CATEGORIES value
 */
function classifyError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  // Non-retryable: permission, auth, invalid input
  if (
    code.includes('UNAUTHORIZED') ||
    code.includes('FORBIDDEN') ||
    code.includes('INVALID') ||
    code.includes('NOT_FOUND') ||
    message.includes('permission denied') ||
    message.includes('invalid credentials') ||
    message.includes('unsupported')
  ) {
    return ERROR_CATEGORIES.NON_RETRYABLE;
  }

  // User action required
  if (
    code.includes('USER_ACTION') ||
    message.includes('user action required')
  ) {
    return ERROR_CATEGORIES.USER_ACTION_REQUIRED;
  }

  // Retryable: network, rate limit, temporary failures
  if (
    code.includes('NETWORK') ||
    code.includes('TIMEOUT') ||
    code.includes('RATE_LIMIT') ||
    code.includes('TEMPORARY') ||
    code.includes('ECONNRESET') ||
    code.includes('ENOTFOUND') ||
    message.includes('temporary') ||
    message.includes('rate limit') ||
    message.includes('timeout') ||
    message.includes('cold start')
  ) {
    return ERROR_CATEGORIES.RETRYABLE;
  }

  // Default: non-retryable (conservative)
  return ERROR_CATEGORIES.NON_RETRYABLE;
}

module.exports = {
  JOB_STATES,
  TERMINAL_STATES,
  VALID_TRANSITIONS,
  STATE_METADATA,
  ERROR_CATEGORIES,
  isValidTransition,
  getValidNextStates,
  isTerminalState,
  getStateMetadata,
  getStateProgress,
  createTransitionResult,
  transition,
  classifyError,
};
