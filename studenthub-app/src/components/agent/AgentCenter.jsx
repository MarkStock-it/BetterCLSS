import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glyph } from '../ui/Icons';
import {
  fetchAgentJobs,
  fetchAgentJob,
  fetchAgentJobEvents,
  createAgentApproval,
  approveAgentRequest,
  downloadAgentArtifact,
  executeAgentJob,
  createAgentJob,
} from '../../lib/dashboard-data';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };

// ─── State Helpers ─────────────────────────────────────────────────

const STATE_CONFIG = {
  DISCOVERED: { label: 'Discovered', color: '#8da3ff', icon: 'spark', category: 'active' },
  ANALYZING: { label: 'Analyzing', color: '#8da3ff', icon: 'spark', category: 'active' },
  CAPABILITY_CHECK: { label: 'Checking', color: '#8da3ff', icon: 'spark', category: 'active' },
  PLANNING: { label: 'Planning', color: '#8da3ff', icon: 'spark', category: 'active' },
  GENERATING: { label: 'Generating', color: '#8da3ff', icon: 'spark', category: 'active' },
  REFINING: { label: 'Refining', color: '#8da3ff', icon: 'spark', category: 'active' },
  VALIDATING: { label: 'Validating', color: '#8da3ff', icon: 'spark', category: 'active' },
  READY: { label: 'Ready', color: '#34d399', icon: 'spark', category: 'active' },
  EXECUTING: { label: 'Submitting', color: '#8da3ff', icon: 'spark', category: 'active' },
  COMPLETED: { label: 'Completed', color: '#34d399', icon: 'spark', category: 'completed' },
  FAILED: { label: 'Failed', color: '#f87171', icon: 'spark', category: 'failed' },
  UNSUPPORTED: { label: 'Unsupported', color: '#f87171', icon: 'spark', category: 'unsupported' },
  USER_ACTION_REQUIRED: { label: 'Needs Review', color: '#fbbf24', icon: 'spark', category: 'review' },
  CANCELLED: { label: 'Cancelled', color: '#94a3b8', icon: 'spark', category: 'completed' },
};

function getStateConfig(state) {
  return STATE_CONFIG[state] || { label: state, color: '#94a3b8', icon: 'spark', category: 'active' };
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Main Agent Center ─────────────────────────────────────────────

export function AgentCenter({ agentSettings }) {
  const [view, setView] = useState('list'); // list | detail | review
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobEvents, setJobEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(true);

  const enabled = agentSettings?.enabled || false;

  // Fetch jobs
  const loadJobs = useCallback(async () => {
    try {
      const fetched = await fetchAgentJobs();
      setJobs(fetched);
      setError(null);
    } catch {
      setError('Could not load agent jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    loadJobs();
  }, [enabled, loadJobs]);

  useEffect(() => {
    if (!enabled || !polling) return;
    const interval = setInterval(loadJobs, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [enabled, polling, loadJobs]);

  // Load job detail
  const openJob = useCallback(async (job) => {
    setSelectedJob(job);
    setView('detail');
    setPolling(false);
    try {
      const events = await fetchAgentJobEvents(job.id);
      setJobEvents(events);
    } catch {
      setJobEvents([]);
    }
  }, []);

  // Go back to list
  const goBack = useCallback(() => {
    setView('list');
    setSelectedJob(null);
    setJobEvents([]);
    setPolling(true);
    loadJobs();
  }, [loadJobs]);

  // Open review screen
  const openReview = useCallback((job) => {
    setSelectedJob(job);
    setView('review');
    setPolling(false);
  }, []);

  // Execute a job through the orchestrator
  const handleExecute = useCallback(async (jobId) => {
    try {
      await executeAgentJob(jobId);
      // Reload jobs to see updated state
      await loadJobs();
    } catch {
      // Execution failed silently — job events will show the error
    }
  }, [loadJobs]);

  if (!enabled) {
    return (
      <div className="view-stack">
        <header className="dashboard-intro">
          <span className="eyebrow-mobile">Agentic Helper</span>
          <h1>Agent Center</h1>
        </header>
        <div className="agent-empty-state">
          <span className="secondary-icon agent-settings-icon">
            <Glyph name="spark" className="h-5 w-5" />
          </span>
          <h3>Agentic Helper is disabled</h3>
          <p>Enable Agentic Helper in Settings to use assignment automation features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-stack">
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div
            key="agent-list"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={SPRING}
          >
            <header className="dashboard-intro">
              <span className="eyebrow-mobile">Agentic Helper</span>
              <h1>Agent Center</h1>
              <p>Assignment automation status and review</p>
            </header>

            {loading ? (
              <div className="agent-loading">
                <div className="agent-spinner" />
                <span>Loading jobs...</span>
              </div>
            ) : error ? (
              <div className="agent-empty-state">
                <p>{error}</p>
                <button type="button" className="agent-retry-btn" onClick={loadJobs}>Retry</button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="agent-empty-state">
                <span className="secondary-icon agent-settings-icon">
                  <Glyph name="spark" className="h-5 w-5" />
                </span>
                <h3>No agent jobs yet</h3>
                <p>Create an agent job from an assignment to get started.</p>
              </div>
            ) : (
              <AgentJobList jobs={jobs} onOpenJob={openJob} onOpenReview={openReview} />
            )}
          </motion.div>
        )}

        {view === 'detail' && selectedJob && (
          <motion.div
            key="agent-detail"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={SPRING}
          >
            <AgentJobDetail
              job={selectedJob}
              events={jobEvents}
              onBack={goBack}
              onOpenReview={openReview}
              onExecute={handleExecute}
            />
          </motion.div>
        )}

        {view === 'review' && selectedJob && (
          <motion.div
            key="agent-review"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={SPRING}
          >
            <AgentReviewScreen
              job={selectedJob}
              onBack={goBack}
              onComplete={goBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Job List ──────────────────────────────────────────────────────

function AgentJobList({ jobs, onOpenJob, onOpenReview }) {
  const categories = categorizeJobs(jobs);

  return (
    <div className="agent-job-list">
      {/* Summary bar */}
      <div className="agent-summary-bar">
        {categories.active.length > 0 && (
          <span className="agent-summary-badge agent-summary-active">
            {categories.active.length} active
          </span>
        )}
        {categories.review.length > 0 && (
          <span className="agent-summary-badge agent-summary-review">
            {categories.review.length} needs review
          </span>
        )}
        {categories.completed.length > 0 && (
          <span className="agent-summary-badge agent-summary-completed">
            {categories.completed.length} completed
          </span>
        )}
        {(categories.failed.length + categories.unsupported.length) > 0 && (
          <span className="agent-summary-badge agent-summary-failed">
            {categories.failed.length + categories.unsupported.length} issues
          </span>
        )}
      </div>

      {/* Active jobs */}
      {categories.active.length > 0 && (
        <div className="agent-section">
          <h3 className="agent-section-title">Active</h3>
          {categories.active.map((job) => (
            <AgentJobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
          ))}
        </div>
      )}

      {/* Needs review */}
      {categories.review.length > 0 && (
        <div className="agent-section">
          <h3 className="agent-section-title agent-section-review">Needs Review</h3>
          {categories.review.map((job) => (
            <AgentJobCard
              key={job.id}
              job={job}
              onClick={() => onOpenReview(job)}
              reviewAction
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {categories.completed.length > 0 && (
        <div className="agent-section">
          <h3 className="agent-section-title">Completed</h3>
          {categories.completed.map((job) => (
            <AgentJobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
          ))}
        </div>
      )}

      {/* Failed / Unsupported */}
      {(categories.failed.length + categories.unsupported.length) > 0 && (
        <div className="agent-section">
          <h3 className="agent-section-title agent-section-failed">Issues</h3>
          {[...categories.failed, ...categories.unsupported].map((job) => (
            <AgentJobCard key={job.id} job={job} onClick={() => onOpenJob(job)} />
          ))}
        </div>
      )}
    </div>
  );
}

function categorizeJobs(jobs) {
  const result = { active: [], review: [], completed: [], failed: [], unsupported: [] };
  for (const job of jobs) {
    const config = getStateConfig(job.state);
    if (config.category === 'active') result.active.push(job);
    else if (config.category === 'review') result.review.push(job);
    else if (config.category === 'completed') result.completed.push(job);
    else if (config.category === 'failed') result.failed.push(job);
    else if (config.category === 'unsupported') result.unsupported.push(job);
    else result.active.push(job);
  }
  return result;
}

// ─── Job Card ──────────────────────────────────────────────────────

function AgentJobCard({ job, onClick, reviewAction }) {
  const config = getStateConfig(job.state);
  const progress = job.progress?.percent ?? null;
  const message = job.progress?.message || '';

  return (
    <button type="button" className="agent-job-card" onClick={onClick}>
      <div className="agent-job-card-header">
        <div className="agent-job-card-info">
          <span className="agent-job-card-title">{job.assignmentTitle || 'Assignment'}</span>
          <span className="agent-job-card-course">{job.courseName || ''}</span>
        </div>
        <span className="agent-job-card-status" style={{ color: config.color }}>
          {config.label}
        </span>
      </div>

      {/* Progress bar for active jobs */}
      {progress !== null && progress < 100 && (
        <div className="agent-progress-bar">
          <div
            className="agent-progress-fill"
            style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: config.color }}
          />
        </div>
      )}

      {/* Status message */}
      {message && (
        <span className="agent-job-card-message">{message}</span>
      )}

      {/* Error preview */}
      {job.error && (
        <span className="agent-job-card-error">{job.error.message || 'An error occurred'}</span>
      )}

      {/* Unsupported reason */}
      {job.state === 'UNSUPPORTED' && job.manifest?.capabilityResult?.reason && (
        <span className="agent-job-card-error">{job.manifest.capabilityResult.reason}</span>
      )}

      {/* Timestamp */}
      <span className="agent-job-card-time">{formatTime(job.updatedAt)}</span>

      {/* Review action button */}
      {reviewAction && (
        <span className="agent-job-card-action">Review & Submit →</span>
      )}
    </button>
  );
}

// ─── Job Detail ────────────────────────────────────────────────────

function AgentJobDetail({ job, events, onBack, onOpenReview, onExecute }) {
  const config = getStateConfig(job.state);
  const progress = job.progress?.percent ?? null;
  const message = job.progress?.message || '';
  const hasArtifacts = Array.isArray(job.artifacts) && job.artifacts.length > 0;
  const canReview = job.state === 'USER_ACTION_REQUIRED' || job.state === 'READY';
  const canExecute = job.state === 'DISCOVERED' || job.state === 'PLANNING';
  const [executing, setExecuting] = useState(false);

  return (
    <div className="agent-detail">
      <button type="button" className="agent-back-btn" onClick={onBack}>
        <Glyph name="close" className="h-4 w-4" /> Back
      </button>

      <header className="agent-detail-header">
        <span className="eyebrow-mobile">Agent Job</span>
        <h1>{job.assignmentTitle || 'Assignment'}</h1>
        <span className="agent-detail-course">{job.courseName || ''}</span>
      </header>

      {/* Status badge */}
      <div className="agent-detail-status" style={{ borderColor: config.color }}>
        <span className="agent-detail-status-dot" style={{ backgroundColor: config.color }} />
        <span>{config.label}</span>
        {message && <span className="agent-detail-status-msg">{message}</span>}
      </div>

      {/* Progress */}
      {progress !== null && (
        <div className="agent-detail-progress">
          <div className="agent-progress-bar">
            <div
              className="agent-progress-fill"
              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: config.color }}
            />
          </div>
          <span className="agent-progress-label">{progress}%</span>
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div className="agent-detail-error">
          <strong>Error:</strong> {job.error.message}
          {job.error.category && <span className="agent-error-category">({job.error.category})</span>}
        </div>
      )}

      {/* Unsupported */}
      {job.state === 'UNSUPPORTED' && job.manifest?.capabilityResult && (
        <div className="agent-detail-unsupported">
          <h3>This assignment is unsupported</h3>
          <p>{job.manifest.capabilityResult.reason || 'Agentic Helper cannot complete this assignment.'}</p>
          {job.manifest.capabilityResult.summary && (
            <p className="agent-unsupported-summary">{job.manifest.capabilityResult.summary}</p>
          )}
        </div>
      )}

      {/* Artifacts */}
      {hasArtifacts && (
        <div className="agent-detail-section">
          <h3>Generated Artifacts</h3>
          {job.artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}

      {/* Warnings */}
      {job.manifest?.capabilityResult?.warnings?.length > 0 && (
        <div className="agent-detail-section">
          <h3>Warnings</h3>
          {job.manifest.capabilityResult.warnings.map((w, i) => (
            <div key={i} className="agent-detail-warning">{w.message || w}</div>
          ))}
        </div>
      )}

      {/* Events timeline */}
      {events.length > 0 && (
        <div className="agent-detail-section">
          <h3>Activity</h3>
          <div className="agent-timeline">
            {events.slice(-10).reverse().map((event, i) => (
              <div key={i} className="agent-timeline-item">
                <span className="agent-timeline-dot" />
                <div>
                  <span className="agent-timeline-type">{formatEventType(event.type)}</span>
                  <span className="agent-timeline-time">{formatTime(event.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execute action for DISCOVERED/PLANNING jobs */}
      {canExecute && (
        <button
          type="button"
          className="agent-review-btn"
          onClick={async () => {
            setExecuting(true);
            try {
              await onExecute(job.id);
            } finally {
              setExecuting(false);
            }
          }}
          disabled={executing}
        >
          {executing ? 'Starting...' : 'Start Agent'}
        </button>
      )}

      {/* Review action */}
      {canReview && (
        <button
          type="button"
          className="agent-review-btn"
          onClick={() => onOpenReview(job)}
        >
          Review & Submit
        </button>
      )}
    </div>
  );
}

// ─── Review Screen ─────────────────────────────────────────────────

function AgentReviewScreen({ job, onBack, onComplete }) {
  const [approvalStatus, setApprovalStatus] = useState(null); // null | 'requesting' | 'requested' | 'approved' | 'denied' | 'error'
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const hasArtifacts = Array.isArray(job.artifacts) && job.artifacts.length > 0;
  const readyArtifacts = hasArtifacts ? job.artifacts.filter((a) => a.status === 'READY') : [];
  const firstArtifact = readyArtifacts[0] || null;

  const handleRequestApproval = async () => {
    if (!firstArtifact) return;
    setApprovalStatus('requesting');
    try {
      const approval = await createAgentApproval(job.id, firstArtifact.id, firstArtifact.artifactVersion || 1);
      if (approval) {
        setApprovalStatus('requested');
      } else {
        setApprovalStatus('error');
      }
    } catch {
      setApprovalStatus('error');
    }
  };

  const handleApprove = async () => {
    if (!job.approval?.id) return;
    setSubmitting(true);
    try {
      const result = await approveAgentRequest(job.approval.id);
      if (result) {
        setSubmitResult({ success: true, message: 'Approval granted! The backend will now handle submission.' });
        setTimeout(onComplete, 3000);
      } else {
        setSubmitResult({ success: false, message: 'Approval failed. Please try again.' });
      }
    } catch {
      setSubmitResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!firstArtifact) return;
    try {
      const blob = await downloadAgentArtifact(firstArtifact.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = firstArtifact.filename || 'document.docx';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Download failed silently
    }
  };

  return (
    <div className="agent-detail">
      <button type="button" className="agent-back-btn" onClick={onBack}>
        <Glyph name="close" className="h-4 w-4" /> Back
      </button>

      <header className="agent-detail-header">
        <span className="eyebrow-mobile">Review</span>
        <h1>{job.assignmentTitle || 'Assignment'}</h1>
        <span className="agent-detail-course">{job.courseName || ''}</span>
      </header>

      {/* Validation status */}
      <div className="agent-review-status">
        {job.manifest?.capabilityResult?.status === 'SUPPORTED' ? (
          <span className="agent-review-badge agent-review-ok">✓ Requirements met</span>
        ) : (
          <span className="agent-review-badge agent-review-warn">⚠ Check requirements</span>
        )}
      </div>

      {/* Artifact info */}
      {firstArtifact ? (
        <div className="agent-review-artifact">
          <h3>Generated Artifact</h3>
          <div className="agent-artifact-card">
            <span className="agent-artifact-name">{firstArtifact.filename}</span>
            <span className="agent-artifact-type">{firstArtifact.type?.toUpperCase()}</span>
            <span className="agent-artifact-size">{formatFileSize(firstArtifact.size)}</span>
            <span className="agent-artifact-status" style={{
              color: firstArtifact.status === 'READY' ? '#34d399' : '#f87171'
            }}>
              {firstArtifact.status}
            </span>
          </div>
          <button type="button" className="agent-download-btn" onClick={handleDownload}>
            Download to review
          </button>
        </div>
      ) : (
        <div className="agent-review-no-artifact">
          <p>No artifacts generated yet.</p>
        </div>
      )}

      {/* Stale approval warning */}
      {job.approval?.status === 'APPROVED' && job.approval.artifactId !== firstArtifact?.id && (
        <div className="agent-detail-warning">
          This artifact changed after your previous review. Please review the latest version.
        </div>
      )}

      {/* Submission target */}
      <div className="agent-review-target">
        <h3>Submission Target</h3>
        <p>
          {job.courseName || 'Course'} → {job.assignmentTitle || 'Assignment'}
        </p>
        <p className="agent-review-note">
          Only submit after you have reviewed and approved the generated content.
        </p>
      </div>

      {/* Submit result */}
      {submitResult && (
        <div className={`agent-review-result ${submitResult.success ? 'agent-review-success' : 'agent-review-error'}`}>
          {submitResult.message}
        </div>
      )}

      {/* Approval flow */}
      {!submitResult && (
        <div className="agent-review-actions">
          {!job.approval || job.approval.status !== 'APPROVED' ? (
            <>
              {approvalStatus === 'requested' || job.approval?.status === 'APPROVED' ? (
                <button
                  type="button"
                  className="agent-approve-btn"
                  onClick={handleApprove}
                  disabled={submitting}
                >
                  {submitting ? 'Approving...' : 'Approve & Submit'}
                </button>
              ) : (
                <button
                  type="button"
                  className="agent-request-approval-btn"
                  onClick={handleRequestApproval}
                  disabled={approvalStatus === 'requesting'}
                >
                  {approvalStatus === 'requesting' ? 'Requesting...' : 'Request Approval'}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="agent-approve-btn"
              onClick={handleApprove}
              disabled={submitting}
            >
              {submitting ? 'Approving...' : 'Approve & Submit'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Artifact Card ─────────────────────────────────────────────────

function ArtifactCard({ artifact }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadAgentArtifact(artifact.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = artifact.filename || 'document';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Download failed
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="agent-artifact-card">
      <div className="agent-artifact-info">
        <span className="agent-artifact-name">{artifact.filename}</span>
        <span className="agent-artifact-meta">
          {artifact.type?.toUpperCase()} · {formatFileSize(artifact.size)}
        </span>
        <span
          className="agent-artifact-status"
          style={{ color: artifact.status === 'READY' ? '#34d399' : '#f87171' }}
        >
          {artifact.status}
        </span>
      </div>
      {artifact.status === 'READY' && (
        <button
          type="button"
          className="agent-artifact-download"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? '...' : 'Download'}
        </button>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatEventType(type) {
  const map = {
    JOB_CREATED: 'Job created',
    JOB_STARTED_ANALYZING: 'Analyzing',
    JOB_CAPABILITY_CHECK: 'Checking capabilities',
    JOB_ENTERED_PLANNING: 'Planning',
    JOB_GENERATION_STARTED: 'Generating',
    JOB_REFINING_STARTED: 'Refining',
    JOB_VALIDATION_STARTED: 'Validating',
    JOB_READY: 'Ready',
    JOB_EXECUTION_STARTED: 'Executing',
    JOB_COMPLETED: 'Completed',
    JOB_FAILED: 'Failed',
    JOB_UNSUPPORTED: 'Unsupported',
    JOB_USER_ACTION_REQUIRED: 'Needs review',
    JOB_CANCELLED: 'Cancelled',
    AGENT_STARTED: 'Agent started',
    AGENT_AI_REQUESTED: 'AI processing',
    AGENT_TOOL_REQUESTED: 'Tool request',
    AGENT_TOOL_COMPLETED: 'Tool completed',
    AGENT_AI_FINAL_RESPONSE: 'Final response',
    AGENT_COMPLETED: 'Agent completed',
    AGENT_FAILED: 'Agent failed',
    AGENT_NEEDS_INPUT: 'Needs input',
    TOOL_EXECUTED: 'Tool executed',
    UPLOAD_STARTED: 'Uploading',
    UPLOAD_COMPLETED: 'Upload complete',
    SUBMISSION_REQUESTED: 'Submitting',
    SUBMISSION_CONFIRMED: 'Submitted',
    APPROVAL_REQUESTED: 'Approval requested',
    APPROVAL_GRANTED: 'Approved',
    APPROVAL_DENIED: 'Denied',
  };
  return map[type] || type?.replace(/_/g, ' ').toLowerCase() || 'Event';
}
