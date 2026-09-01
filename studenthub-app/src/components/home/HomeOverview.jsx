import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [trayState, setTrayState] = useState({ open: false, x: 0, y: 0 });
  const [active, setActive] = useState(null);
  const trayRef = useRef(null);
  const triggerRef = useRef(null);
  const holdRef = useRef(null);
  const ignoreTrayClickRef = useRef(false);
  const executingRef = useRef(false);

  const HOLD_MS = 350;
  const MOVE_CANCEL_DISTANCE = 12;
  const TRAY_W = 262;  // Two 120px buttons + gap + padding
  const TRAY_H = 56;
  const TARGET_W = 120;
  const TARGET_H = 56;
  const TARGET_GAP = 6;
  const TRAY_PAD = 8;
  const FINGER_OFFSET = 16;

  const removeGestureListeners = (gesture) => {
    if (!gesture) return;
    document.removeEventListener('pointermove', gesture.onMove, true);
    document.removeEventListener('pointerup', gesture.onEnd, true);
    document.removeEventListener('pointercancel', gesture.onCancel, true);
  };

  const cleanup = (gesture = holdRef.current) => {
    if (gesture && holdRef.current !== gesture) return;
    if (gesture) {
      clearTimeout(gesture.timer);
      removeGestureListeners(gesture);
      // Release pointer capture to return control to the browser
      if (triggerRef.current && document.pointerLockElement !== triggerRef.current) {
        try {
          triggerRef.current.releasePointerCapture(gesture.pointerId);
        } catch {
          // Ignore errors if pointer was already released
        }
      }
      holdRef.current = null;
    }
    setTrayState({ open: false, x: 0, y: 0 });
    setActive(null);
  };

  const getTargetAt = (cx, cy, position) => {
    // Prefer the measured DOM target once React has rendered the portal.
    if (trayRef.current) {
      for (const el of trayRef.current.querySelectorAll('[data-action]')) {
        const r = el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          return el.dataset.action;
        }
      }
    }

    if (!position) return null;
    const top = position.y + TRAY_PAD + 1;
    const bottom = top + TARGET_H;
    // Check if pointer is within the vertical bounds of the tray
    if (cy < top || cy > bottom) return null;
    
    // Horizontal detection: agent on left, submit on right
    const agentLeft = position.x + TRAY_PAD + 1;
    const agentRight = agentLeft + TARGET_W;
    const submitLeft = agentRight + TARGET_GAP;
    const submitRight = submitLeft + TARGET_W;
    
    if (cx >= agentLeft && cx <= agentRight) return 'agent';
    if (cx >= submitLeft && cx <= submitRight) return 'submit';
    return null;
  };

  const computeTrayPosition = (fingerX, fingerY) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Position tray to the right of the trigger, or centered if enough space
    let x = fingerX + 40;
    if (x + TRAY_W > vw - 8) {
      x = fingerX - TRAY_W - 40;
    }
    x = Math.max(8, Math.min(vw - TRAY_W - 8, x));
    
    // Vertical: center on finger, adjust if near edges
    let y = fingerY - TRAY_H / 2;
    if (y < 8) y = 8;
    if (y + TRAY_H > vh - 8) y = vh - TRAY_H - 8;
    
    return { x, y };
  };

  const executeAction = async (action) => {
    if (executingRef.current) return;
    if (action === 'agent' && creatingJobId) return;
    if (action === 'agent' && !canCreateAgentJob(item)) {
      alert('This assignment type may not be supported by Agentic Helper yet.');
      return;
    }
    executingRef.current = true;
    if (action === 'agent') {
      try {
        setCreatingJobId(item.id);
        const job = await createAgentJobSafe(item, (err) => alert(`Could not create agent job:\n\n${err}`));
        if (job) onCreateAgentJob?.(job);
      } finally {
        setCreatingJobId(null);
        executingRef.current = false;
      }
    } else if (action === 'submit') {
      try {
        onToggleDone(item);
      } finally {
        executingRef.current = false;
      }
    } else {
      executingRef.current = false;
    }
  };

  const actionIsAvailable = (action) => (
    action === 'submit' || (action === 'agent' && connected && !creatingJobId)
  );

  // Horizontal gesture: hold the trigger, then drag left-to-right.
  // This interaction does not conflict with vertical page scrolling.
  // Pointer capture ensures all movement stays with this gesture.
  const onPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // Capture this pointer so all pointer events stay with this element,
    // even if the finger moves away from the trigger. This prevents the browser
    // from interpreting the movement as a page scroll.
    if (triggerRef.current) {
      triggerRef.current.setPointerCapture(e.pointerId);
    }
    cleanup();

    const gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
      opened: false,
      position: null,
      onMove: null,
      onEnd: null,
      onCancel: null,
    };

    gesture.onMove = (event) => {
      if (event.pointerId !== gesture.pointerId || holdRef.current !== gesture) return;

      if (!gesture.opened) {
        const moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (moved > MOVE_CANCEL_DISTANCE) cleanup(gesture);
        return;
      }

      if (event.cancelable) event.preventDefault();
      const hit = getTargetAt(event.clientX, event.clientY, gesture.position);
      setActive(actionIsAvailable(hit) ? hit : null);
    };

    gesture.onEnd = (event) => {
      if (event.pointerId !== gesture.pointerId || holdRef.current !== gesture) return;
      const hit = gesture.opened
        ? getTargetAt(event.clientX, event.clientY, gesture.position)
        : null;
      cleanup(gesture);
      if (actionIsAvailable(hit)) {
        // A touch that begins on the trigger can still synthesize a click on a
        // tray button in some mobile browsers. Suppress that follow-up click so
        // one release always maps to one action.
        ignoreTrayClickRef.current = true;
        setTimeout(() => { ignoreTrayClickRef.current = false; }, 0);
        void executeAction(hit);
      }
    };

    gesture.onCancel = (event) => {
      if (event.pointerId === gesture.pointerId) cleanup(gesture);
    };

    holdRef.current = gesture;
    gesture.timer = setTimeout(() => {
      if (holdRef.current !== gesture) return;
      gesture.opened = true;
      const pos = computeTrayPosition(gesture.startX, gesture.startY);
      gesture.position = pos;
      setTrayState({ open: true, ...pos });
    }, HOLD_MS);
    document.addEventListener('pointermove', gesture.onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', gesture.onEnd, true);
    document.addEventListener('pointercancel', gesture.onCancel, true);
  };

  useEffect(() => () => {
    const gesture = holdRef.current;
    if (!gesture) return;
    clearTimeout(gesture.timer);
    removeGestureListeners(gesture);
    holdRef.current = null;
  }, []);

  const isCreating = creatingJobId === item.id;

  return (
    <div className="action-tray-wrap">
      {/* Trigger icon — the ONLY hold target */}
      <div
        ref={triggerRef}
        className="action-tray-trigger"
        onPointerDown={onPointerDown}
        role="button"
        tabIndex={0}
        aria-label="Assignment actions"
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pos = computeTrayPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
            setTrayState({ open: true, ...pos });
          } else if (e.key === 'Escape') {
            cleanup();
          }
        }}
      >
        <Glyph name="spark" className="h-4 w-4" />
      </div>

      {/* Action tray — fixed positioned, escapes all ancestor overflow */}
      {trayState.open && createPortal(
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
            data-action="agent"
            className={`action-tray-target action-agent ${active === 'agent' ? 'is-hovered' : ''} ${isCreating ? 'is-creating' : ''}`}
            disabled={isCreating || !connected}
            aria-pressed={active === 'agent'}
            onClick={(e) => {
              if (ignoreTrayClickRef.current) {
                e.preventDefault();
                return;
              }
              cleanup();
              void executeAction('agent');
            }}
          >
            {isCreating ? <span className="agent-spinner-tiny" /> : <Glyph name="spark" className="h-4 w-4" />}
            <span className="action-tray-label">Agentic Start</span>
          </button>
          <button
            type="button"
            data-action="submit"
            className={`action-tray-target action-submit ${active === 'submit' ? 'is-hovered' : ''}`}
            aria-pressed={active === 'submit'}
            onClick={(e) => {
              if (ignoreTrayClickRef.current) {
                e.preventDefault();
                return;
              }
              cleanup();
              void executeAction('submit');
            }}
          >
            <Glyph name="tasks" className="h-4 w-4" />
            <span className="action-tray-label">Submit</span>
          </button>
        </div>,
        document.body
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
