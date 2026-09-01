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

export function DeadlineSlider({ item, connected, onToggleDone, onCreateAgentJob, creatingJobId, setCreatingJobId, onClose }) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef({ startX: 0, dragging: false });
  const REVEAL = 84;
  const THRESHOLD = REVEAL * 0.55;

  const collapse = () => { setOpen(false); setDragX(0); onClose?.(); };

  const onPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    dragRef.current = { startX: e.clientX, dragging: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const delta = dragRef.current.startX - e.clientX;
    setDragX(Math.max(0, Math.min(delta, REVEAL)));
  };
  const onPointerUp = () => {
    dragRef.current.dragging = false;
    setDragX((prev) => {
      if (prev >= THRESHOLD) { setOpen(true); return REVEAL; }
      return 0;
    });
  };

  const handleDone = (e) => {
    e.stopPropagation(); collapse(); onToggleDone(item);
  };
  const handleAgent = async (e) => {
    e.stopPropagation();
    if (creatingJobId) return;
    if (!canCreateAgentJob(item)) { alert('This assignment type may not be supported by Agentic Helper yet.'); collapse(); return; }
    setCreatingJobId(item.id);
    try {
      const job = await createAgentJobSafe(item, (err) => alert(`Could not create agent job:\n\n${err}`));
      if (job) onCreateAgentJob?.(job);
    } finally { setCreatingJobId(null); collapse(); }
  };

  const isCreating = creatingJobId === item.id;
  const offset = open ? REVEAL : dragX;

  return (
    <div className="deadline-slider">
      <div className="deadline-slider-actions">
        <button type="button" className="slider-action-btn done-btn" onClick={handleDone} aria-label="Mark complete">
          <Glyph name="tasks" className="h-4 w-4" />
        </button>
        <button type="button" className="slider-action-btn agent-btn" onClick={handleAgent} disabled={isCreating || !connected} aria-label="Create agent job">
          {isCreating ? <span className="agent-spinner-tiny" /> : <Glyph name="spark" className="h-4 w-4" />}
        </button>
      </div>
      <div
        className="deadline-slider-thumb"
        style={{ transform: `translateX(-${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { dragRef.current.dragging = false; setDragX(0); }}
      >
        <Glyph name="spark" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function DeadlineList({ assignments, connected, onConnect, onToggleDone, onCreateAgentJob }) {
  const [creatingJobId, setCreatingJobId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const holdTimerRef = useRef(null);
  const upcoming = smartSort(assignments).filter((item) => !item.done).slice(0, 5);

  const startHold = (id) => {
    holdTimerRef.current = setTimeout(() => setActiveId(id), 350);
  };
  const cancelHold = () => {
    clearTimeout(holdTimerRef.current);
  };
  const clearActive = () => setActiveId(null);

  return (
    <section className="section-card" onClick={clearActive}>
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
            const isActive = activeId === (item.id || item.title);
            return (
              <motion.div
                key={item.id || `${item.title}-${index}`}
                className={`deadline-row-animated ${isActive ? 'is-active' : ''}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: index * 0.05 }}
                onPointerDown={(e) => { e.stopPropagation(); startHold(item.id || item.title); }}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
              >
                <div className="home-deadline-row">
                  <span className={`priority-rail ${item.priority || 'medium'}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-slate-100">{item.title || 'Untitled assignment'}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.subject || 'Course'} · {dueText}</p>
                  </div>
                  {isActive ? (
                    <DeadlineSlider item={item} connected={connected} onToggleDone={onToggleDone} onCreateAgentJob={onCreateAgentJob} creatingJobId={creatingJobId} setCreatingJobId={setCreatingJobId} onClose={clearActive} />
                  ) : (
                    <span className="home-deadline-check" aria-hidden="true"><Glyph name="spark" className="h-4 w-4" /></span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
