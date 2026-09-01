import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glyph } from '../ui/Icons';
import { daysUntil, smartSort, canCreateAgentJob, createAgentJobSafe } from '../../lib/dashboard-data';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const WORKLOAD_STEPS = [
  { x: 11, bottom: 14 },
  { x: 27, bottom: 25 },
  { x: 42, bottom: 36 },
  { x: 58, bottom: 47 },
  { x: 73, bottom: 58 },
  { x: 89, bottom: 69 }
];
const WORKLOAD_SPRING = { type: 'spring', stiffness: 230, damping: 17, mass: 0.82 };

export function WorkloadProgress({ assignments, overdueCount, announcementCount }) {
  const reduceMotion = useReducedMotion();
  const total = assignments.length;
  const completed = assignments.filter((item) => item.done).length;
  const remaining = Math.max(0, total - completed);
  const progress = total ? completed / total : 1;
  const stepIndex = total ? Math.round(progress * (WORKLOAD_STEPS.length - 1)) : WORKLOAD_STEPS.length - 1;
  const previousStepRef = useRef(stepIndex);
  const previousStep = previousStepRef.current;
  const currentPosition = WORKLOAD_STEPS[stepIndex];
  const previousPosition = WORKLOAD_STEPS[previousStep];
  const caughtUp = remaining === 0;

  useEffect(() => {
    previousStepRef.current = stepIndex;
  }, [stepIndex]);

  return (
    <motion.section
      className={`workload-progress ${caughtUp ? 'is-complete' : ''}`}
      aria-labelledby="workload-title"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="workload-progress-head">
        <div>
          <span className="eyebrow-mobile">Today’s workload</span>
          <h2 id="workload-title">{caughtUp ? 'You made it to the top.' : 'A little closer with every task.'}</h2>
        </div>
        <div className="workload-complete-count" aria-label={`${completed} of ${total} tasks completed`}>
          <strong>{completed}</strong>
          <span>/ {total || 0} done</span>
        </div>
      </div>

      <div
        className="workload-scene"
        role="progressbar"
        aria-label="Today’s task progress"
        aria-valuemin="0"
        aria-valuemax={total || 1}
        aria-valuenow={completed}
        aria-valuetext={caughtUp ? 'Fully caught up' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}
      >
        <svg className="workload-stairs" viewBox="0 0 360 220" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="workload-step-fill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#263057" />
              <stop offset="1" stopColor="#151a32" />
            </linearGradient>
            <linearGradient id="workload-step-reached" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#758cff" />
              <stop offset="1" stopColor="#9d72ea" />
            </linearGradient>
          </defs>
          {WORKLOAD_STEPS.map((_, index) => {
            const x = 12 + (index * 56);
            const y = 190 - (index * 24);
            return (
              <g className={index <= stepIndex ? 'is-reached' : ''} key={index}>
                <rect x={x} y={y} width="56" height={220 - y} rx="4" fill="url(#workload-step-fill)" />
                <path d={`M ${x + 5} ${y + 1} H ${x + 51}`} />
              </g>
            );
          })}
          <path className="workload-stair-outline" d="M12 190h56v-24h56v-24h56v-24h56V94h56V70h56" />
        </svg>

        <motion.div
          key={`${completed}-${total}`}
          className={`workload-climber ${stepIndex >= WORKLOAD_STEPS.length - 2 ? 'near-top' : ''}`}
          initial={reduceMotion ? false : {
            left: `${previousPosition.x}%`,
            bottom: `${previousPosition.bottom}%`,
            y: 7,
            scaleX: 1.08,
            scaleY: 0.9
          }}
          animate={{
            left: `${currentPosition.x}%`,
            bottom: `${currentPosition.bottom}%`,
            y: 0,
            scaleX: 1,
            scaleY: 1
          }}
          transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
        >
          <span className="workload-remaining-label">
            {caughtUp ? 'Fully caught up!' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} left`}
          </span>
          <motion.div
            className="workload-blob-wrap"
            animate={!reduceMotion && caughtUp ? {
              y: [0, -4, 0],
              rotate: [0, 2, 0, -2, 0]
            } : { y: 0, rotate: 0 }}
            transition={!reduceMotion && caughtUp ? {
              duration: 2.5,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatDelay: 0.35
            } : { duration: 0 }}
          >
            <svg className="workload-blob" viewBox="0 0 64 58" aria-hidden="true">
              <defs>
                <linearGradient id="workload-blob-fill" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#b6f37f" />
                  <stop offset="1" stopColor="#72d8a0" />
                </linearGradient>
              </defs>
              <path d="M10 42C5 29 9 13 23 7c13-6 29 2 33 16 3 11-2 26-14 30-12 4-28 1-32-11Z" fill="url(#workload-blob-fill)" />
              <ellipse cx="25" cy="29" rx="2.7" ry="3.5" fill="#172337" />
              <ellipse cx="43" cy="28" rx="2.7" ry="3.5" fill="#172337" />
              <path d={caughtUp ? 'M27 39c4 4 9 4 13-1' : 'M28 39c3 2 7 2 10 0'} fill="none" stroke="#172337" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="50" cy="35" r="3" fill="#f5a0ad" opacity=".58" />
              <circle cx="18" cy="36" r="3" fill="#f5a0ad" opacity=".58" />
            </svg>
          </motion.div>
          {caughtUp && (
            <div className="workload-celebration" aria-hidden="true">
              <motion.i animate={reduceMotion ? {} : { opacity: [0, 1, 0], y: [3, -8, -13], scale: [0.7, 1, 0.8] }} transition={{ duration: 1.8, repeat: Infinity }}>✦</motion.i>
              <motion.i animate={reduceMotion ? {} : { opacity: [0, 1, 0], y: [5, -6, -11], scale: [0.6, 1, 0.7] }} transition={{ duration: 2.1, delay: 0.45, repeat: Infinity }}>✦</motion.i>
            </div>
          )}
        </motion.div>
      </div>

      <div className="workload-progress-foot">
        <div className="workload-progress-track" aria-hidden="true">
          <motion.span
            initial={false}
            animate={{ width: `${Math.round(progress * 100)}%` }}
            transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
          />
        </div>
        <div className="workload-progress-meta">
          <span>{Math.round(progress * 100)}% complete</span>
          <span>{overdueCount ? `${overdueCount} overdue` : 'Nothing overdue'}</span>
          <span>{announcementCount} {announcementCount === 1 ? 'course update' : 'course updates'}</span>
        </div>
      </div>
    </motion.section>
  );
}

export function EmptyDeadlines({ connected, onConnect }) {
  return (
    <div className="empty-deadlines">
      <motion.svg
        viewBox="0 0 180 120"
        className="mx-auto h-[112px] w-[170px]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="empty-card-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#7293ff" />
            <stop offset="1" stopColor="#9d6cff" />
          </linearGradient>
          <filter id="empty-glow"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <ellipse cx="90" cy="104" rx="50" ry="7" fill="#5f79ff" opacity=".13" filter="url(#empty-glow)" />
        <motion.circle cx="145" cy="34" r="4" fill="#8aa0ff" animate={{ y: [0, -5, 0] }} transition={{ duration: 2.4, repeat: Infinity }} />
        <motion.circle cx="35" cy="56" r="3" fill="#9d6cff" animate={{ y: [0, 4, 0] }} transition={{ duration: 2.1, repeat: Infinity }} />
        <rect x="49" y="18" width="82" height="78" rx="15" fill="#11172b" stroke="#33416d" />
        <rect x="59" y="30" width="62" height="11" rx="5.5" fill="url(#empty-card-gradient)" opacity=".75" />
        <path d="M63 54h42M63 65h53M63 76h31" stroke="#42507a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="112" cy="77" r="15" fill="#18213d" stroke="#6f87ff" />
        <path d="m106 77 4 4 8-9" fill="none" stroke="#91a5ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
      <h3>{connected ? 'You are all caught up' : 'Bring your deadlines into focus'}</h3>
      <p>{connected ? 'No upcoming assignments need attention right now.' : 'Sync Canvas to see deadlines, urgency, and course priorities here.'}</p>
      <button type="button" className="empty-action" onClick={onConnect}>
        <Glyph name="sync" className="h-4 w-4" />
        {connected ? 'Sync again' : 'Connect Canvas'}
      </button>
    </div>
  );
}

/* eslint-disable-next-line react/no-multi-comp */
export function DeadlineSlider({ item, connected, onToggleDone, onCreateAgentJob, creatingJobId, setCreatingJobId }) {
  const [trayState, setTrayState] = useState({ open: false, x: 0, y: 0, anchorSide: 'right' });
  const [active, setActive] = useState(null);
  const trayRef = useRef(null);
  const triggerRef = useRef(null);
  const holdRef = useRef({ timer: null, startX: 0, startY: 0, active: false, released: false });

  const HOLD_MS = 350;
  const CANCEL_DIST = 12;
  const TRAY_W = 136;
  const TRAY_H = 76;
  const GAP = 8;

  const cleanup = () => {
    clearTimeout(holdRef.current.timer);
    holdRef.current.active = false;
    holdRef.current.released = false;
    setTrayState({ open: false, x: 0, y: 0, anchorSide: 'right' });
    setActive(null);
  };

  const getTargetAt = (cx, cy) => {
    if (!trayRef.current) return null;
    for (const el of trayRef.current.querySelectorAll('[data-action]')) {
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        return el.dataset.action;
      }
    }
    return null;
  };

  const computeTrayPosition = () => {
    if (!triggerRef.current) return { x: 0, y: 0, anchorSide: 'right' };
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Try positioning to the left of the trigger first (tray right-aligned to trigger left)
    let x = r.left - TRAY_W - GAP;
    let anchorSide = 'right';
    // If it would go off the left edge, position to the right of the trigger
    if (x < 8) {
      x = r.right + GAP;
      anchorSide = 'left';
    }
    // If it would go off the right edge, center under the trigger
    if (x + TRAY_W > vw - 8) {
      x = Math.max(8, Math.min(vw - TRAY_W - 8, r.left + r.width / 2 - TRAY_W / 2));
      anchorSide = 'center';
    }
    // Vertical: align top of tray with top of trigger
    let y = r.top;
    // If tray would go below viewport, position above
    if (y + TRAY_H > vh - 8) {
      y = Math.max(8, r.bottom - TRAY_H);
    }
    return { x, y, anchorSide };
  };

  const executeAction = async (action) => {
    if (action === 'done') {
      onToggleDone(item);
    } else if (action === 'agent') {
      if (creatingJobId) return;
      if (!canCreateAgentJob(item)) {
        alert('This assignment type may not be supported by Agentic Helper yet.');
        return;
      }
      setCreatingJobId(item.id);
      try {
        const job = await createAgentJobSafe(item, (err) => alert(`Could not create agent job:\n\n${err}`));
        if (job) onCreateAgentJob?.(job);
      } finally {
        setCreatingJobId(null);
      }
    }
  };

  // --- Pointer handlers owned by the trigger ---
  const onPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    holdRef.current = { timer: null, startX: e.clientX, startY: e.clientY, active: false, released: false };
    holdRef.current.timer = setTimeout(() => {
      if (holdRef.current.released) return;
      holdRef.current.active = true;
      const pos = computeTrayPosition();
      setTrayState({ open: true, ...pos });
    }, HOLD_MS);
  };

  const onPointerMove = (e) => {
    const h = holdRef.current;
    if (!h.active) {
      // Before threshold: cancel hold if finger moves too far
      const dx = Math.abs(e.clientX - h.startX);
      const dy = Math.abs(e.clientY - h.startY);
      if (dx > CANCEL_DIST || dy > CANCEL_DIST) {
        clearTimeout(h.timer);
        return;
      }
      return;
    }
    // After threshold: track which target finger is over
    const hit = getTargetAt(e.clientX, e.clientY);
    setActive(hit);
  };

  const onPointerUp = (e) => {
    const h = holdRef.current;
    if (h.active) {
      const hit = getTargetAt(e.clientX, e.clientY);
      if (hit) executeAction(hit);
    }
    cleanup();
  };

  const onPointerCancel = () => cleanup();

  const isCreating = creatingJobId === item.id;

  return (
    <div className="action-tray-wrap">
      {/* Trigger icon — the ONLY hold target */}
      <div
        ref={triggerRef}
        className="action-tray-trigger"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        role="button"
        tabIndex={0}
        aria-label="Assignment actions"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleDone(item);
          }
        }}
      >
        <Glyph name="spark" className="h-4 w-4" />
      </div>

      {/* Action tray — fixed positioned, escapes all ancestor overflow */}
      {trayState.open && (
        <div
          className="action-tray"
          ref={trayRef}
          style={{
            position: 'fixed',
            left: trayState.x,
            top: trayState.y,
            zIndex: 9999,
          }}
        >
          <button
            type="button"
            data-action="done"
            className={`action-tray-target action-done ${active === 'done' ? 'is-hovered' : ''}`}
          >
            <Glyph name="tasks" className="h-4 w-4" />
            <span className="action-tray-label">Done</span>
          </button>
          <button
            type="button"
            data-action="agent"
            className={`action-tray-target action-agent ${active === 'agent' ? 'is-hovered' : ''} ${isCreating ? 'is-creating' : ''}`}
            disabled={isCreating || !connected}
          >
            {isCreating ? <span className="agent-spinner-tiny" /> : <Glyph name="spark" className="h-4 w-4" />}
            <span className="action-tray-label">Agent</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function DeadlineList({ assignments, connected, onConnect, onToggleDone, onCreateAgentJob }) {
  const [creatingJobId, setCreatingJobId] = useState(null);
  const upcoming = smartSort(assignments).filter((item) => !item.done).slice(0, 5);

  return (
    <section className="section-card">
      <div className="section-card-head">
        <div>
          <span className="eyebrow-mobile">Next up</span>
          <h2>Upcoming deadlines</h2>
        </div>
        {upcoming.length > 0 && <span className="count-pill">{upcoming.length}</span>}
      </div>
      {upcoming.length === 0 ? (
        <EmptyDeadlines connected={connected} onConnect={onConnect} />
      ) : (
        <div className="home-deadline-list">
          {upcoming.map((item, index) => {
            const days = daysUntil(item.due);
            const dueText = days === null ? 'No due date' : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
            return (
              <motion.div
                key={item.id || `${item.title}-${index}`}
                className="deadline-row-animated"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: index * 0.05 }}
              >
                <div className="home-deadline-row">
                  <span className={`priority-rail ${item.priority || 'medium'}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-slate-100">{item.title || 'Untitled assignment'}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.subject || 'Course'} · {dueText}</p>
                  </div>
                  <DeadlineSlider item={item} connected={connected} onToggleDone={onToggleDone} onCreateAgentJob={onCreateAgentJob} creatingJobId={creatingJobId} setCreatingJobId={setCreatingJobId} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
