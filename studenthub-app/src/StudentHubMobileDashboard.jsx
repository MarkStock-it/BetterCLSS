import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform
} from 'motion/react';
import brandLogoUrl from '../../icons/icon-192.png';

const DRAWER_TRAVEL = 360;
const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const TASKS_PER_PAGE = 5;
const DECKS_PER_PAGE = 5;
const WORKLOAD_STEPS = [
  { x: 11, bottom: 14 },
  { x: 27, bottom: 25 },
  { x: 42, bottom: 36 },
  { x: 58, bottom: 47 },
  { x: 73, bottom: 58 },
  { x: 89, bottom: 69 }
];
const WORKLOAD_SPRING = { type: 'spring', stiffness: 230, damping: 17, mass: 0.82 };
const LEGACY_SEEDED_LINKS = new Set([
  'https://usc.instructure.com',
  'https://mail.usc.edu',
  'https://drive.google.com'
]);

const PRIMARY_VIEWS = ['home', 'tasks', 'calendar', 'study'];

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home', section: 'Main' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', section: 'Main' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', section: 'Main' },
  { id: 'study', label: 'Study', icon: 'study', section: 'Main' },
  { id: 'cards', label: 'Cards', icon: 'cards', section: 'Main' },
  { id: 'grades', label: 'Grades', icon: 'grades', section: 'Courses' },
  { id: 'announcements', label: 'Announcements', icon: 'bell', section: 'Courses' },
  { id: 'resources', label: 'Resources', icon: 'link', section: 'Workspace' },
  { id: 'settings', label: 'Settings', icon: 'settings', section: 'Workspace' }
];

const VIEW_COPY = {
  grades: ['Grades', 'Scores and course progress will appear after your next Canvas sync.'],
  announcements: ['Announcements', 'New Canvas announcements and instructor updates live here.'],
  resources: ['Resources', 'Keep your most-used course links and study materials together.'],
  settings: ['Settings', 'Manage Canvas, notifications, appearance, and installation preferences.']
};

function Glyph({ name, className = 'h-5 w-5' }) {
  const paths = {
    home: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    tasks: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 13 2 2 4-4" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    study: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    cards: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 1.8h9a4 4 0 0 1 4 4v11M3 7v9a4 4 0 0 0 4 4" /><path d="M8.5 9h7M8.5 13h5" /></>,
    grades: <><path d="M4 20V10M10 20V4M16 20v-7M2 20h20" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M14 21h-4" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
    arrow: <><path d="m9 18 6-6-6-6" /></>,
    sync: <><path d="M20 7h-5V2" /><path d="M4 17h5v5" /><path d="M5.5 9a8 8 0 0 1 13-3L20 7M4 17l1.5 1A8 8 0 0 0 18.5 15" /></>,
    spark: <><path d="m4 15 4-4 4 3 7-8" /><path d="M15 6h4v4" /></>,
    chevron: <><path d="m6 9 6 6 6-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    reset: <><path d="M4 4v6h6" /><path d="M5.5 15a7.5 7.5 0 1 0 1.2-8.7L4 10" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    notes: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
    tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><circle cx="8.5" cy="8.5" r="1.5" /></>,
    progress: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9h.01M15 9h.01" /></>
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.home}
    </svg>
  );
}

function BrandLogo({ className = '' }) {
  return <img className={className} src={brandLogoUrl} alt="" width="192" height="192" decoding="async" />;
}

function readDashboardData() {
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
    name: ''
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
        const remaining = daysUntil(due);
        return {
          id: item.id,
          title: item.title,
          subject: item.courseName || item.courseCode || 'Canvas',
          due,
          done,
          source: 'canvas',
          priority: remaining !== null && remaining <= 1 ? 'high' : remaining !== null && remaining <= 3 ? 'medium' : 'low'
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
        ...localAssignments.map((item) => ({ ...item, source: item.source || 'local' }))
      ],
      announcements: [
        ...(Array.isArray(canvas.announcements) ? canvas.announcements : []),
        ...(Array.isArray(local.announcements) ? local.announcements : [])
      ],
      events: Array.isArray(local.events) ? local.events : [],
      grades: [
        ...(Array.isArray(canvas.grades) ? canvas.grades : []),
        ...(Array.isArray(local.grades) ? local.grades : [])
      ],
      links,
      studyTasks: Array.isArray(local.studyTasks) ? local.studyTasks : [],
      studyHistory: Array.isArray(local.studyHistory) ? local.studyHistory : [],
      studyDecks: Array.isArray(local.studyDecks) ? local.studyDecks : [],
      studyNote: local.studyCurrentNote && typeof local.studyCurrentNote.content === 'string'
        ? local.studyCurrentNote.content
        : '',
      connected: Boolean(localStorage.getItem('bclss_canvas_token')),
      name: localStorage.getItem('bclss_student_name') || ''
    };
  } catch {
    return fallback;
  }
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due - today) / 86400000);
}

function updateStoredLocalData(updater) {
  try {
    const local = JSON.parse(localStorage.getItem('bclss_local') || '{}');
    const safeLocal = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
    updater(safeLocal);
    localStorage.setItem('bclss_local', JSON.stringify(safeLocal));
  } catch {
    // Keep the in-memory StudentHub state usable when browser storage is unavailable.
  }
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function weekStartKey(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
  return dateKey(start);
}

function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatTimerValue(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function buildStudyStats(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  const currentWeek = weekStartKey();
  const weekEntries = safeHistory.filter((entry) => (
    entry.week === currentWeek || (entry.date && entry.date >= currentWeek)
  ));
  const focusedSeconds = weekEntries.reduce((total, entry) => total + (Number(entry.durationSecs) || 0), 0);
  const studiedDays = [...new Set(safeHistory.map((entry) => entry.date).filter(Boolean))].sort();
  let streak = 0;
  let longestStreak = 0;
  let previous = null;
  studiedDays.forEach((day) => {
    streak = previous && ((new Date(day) - new Date(previous)) / 86400000 === 1) ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = day;
  });
  return {
    sessions: weekEntries.length,
    focusedSeconds,
    longestStreak
  };
}

function buildCourseDecks(assignments, savedDecks = []) {
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
      generated: false
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const generatedDecks = savedDecks.map((deck) => ({
    id: `ai-${deck.id}`,
    title: deck.title,
    cards: Array.isArray(deck.cards) ? deck.cards.map((card, index) => ({
      id: card.id || `${deck.id}-${index}`,
      title: card.front,
      answer: card.back,
      done: Boolean(card.done),
      due: card.due || null
    })) : [],
    completed: Array.isArray(deck.cards) ? deck.cards.filter((card) => card.done).length : 0,
    dueToday: Array.isArray(deck.cards) ? deck.cards.filter((card) => !card.done).length : 0,
    generated: true
  }));
  return [...generatedDecks, ...courseDecks];
}

function smartSort(assignments) {
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

  return [...assignments].sort((a, b) => (
    bucket(a) - bucket(b)
    || (priority[a.priority] ?? 3) - (priority[b.priority] ?? 3)
    || String(a.due || '9999').localeCompare(String(b.due || '9999'))
    || String(a.title || '').localeCompare(String(b.title || ''))
  ));
}

function WorkloadProgress({ assignments, overdueCount, announcementCount }) {
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

function EmptyDeadlines({ connected, onConnect }) {
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

function DeadlineList({ assignments, connected, onConnect, onToggleDone }) {
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
              <motion.button
                type="button"
                key={item.id || `${item.title}-${index}`}
                className="home-deadline-row"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: index * 0.05 }}
                onClick={() => onToggleDone(item)}
                aria-label={`Mark complete: ${item.title}`}
              >
                <span className={`priority-rail ${item.priority || 'medium'}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-100">{item.title || 'Untitled assignment'}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.subject || 'Course'} · {dueText}</p>
                </div>
                <span className="home-deadline-check" aria-hidden="true">
                  <Glyph name="spark" className="h-4 w-4" />
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SidebarDrawer({ x, opacity, open, onOpenChange, activeView, onNavigate }) {
  const sections = [...new Set(NAV_ITEMS.map((item) => item.section))];

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close navigation"
        className="fixed inset-0 z-40 bg-[#02030a]"
        style={{ opacity, pointerEvents: open ? 'auto' : 'none' }}
        onClick={() => onOpenChange(false)}
      />
      <motion.aside
        className="drawer-panel"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -DRAWER_TRAVEL, right: 0 }}
        dragElastic={0.09}
        dragMomentum
        onDragEnd={(_, info) => {
          onOpenChange(!(info.offset.x < -72 || info.velocity.x < -520));
        }}
      >
        <div className="drawer-glow" />
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-center justify-between px-5 pb-6 pt-[max(24px,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              <span className="brand-mark"><BrandLogo /></span>
              <div>
                <strong className="block text-sm text-white">BetterCLSS</strong>
                <span className="text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">StudentHub</span>
              </div>
            </div>
            <button type="button" className="drawer-close" onClick={() => onOpenChange(false)} aria-label="Close navigation">
              <Glyph name="close" className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-5">
            {sections.map((section) => (
              <div key={section} className="mb-5">
                <div className="px-3 pb-2 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-slate-600">{section}</div>
                <div className="space-y-1">
                  {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`drawer-link ${activeView === item.id ? 'active' : ''}`}
                      onClick={() => onNavigate(item.id)}
                    >
                      <span className="drawer-link-icon"><Glyph name={item.icon} className="h-[19px] w-[19px]" /></span>
                      <span>{item.label}</span>
                      {activeView === item.id && <motion.span layoutId="drawer-active-dot" className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8aa0ff] shadow-[0_0_12px_#718cff]" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

        </div>
      </motion.aside>
    </>
  );
}

function AssistantText({ text }) {
  return String(text || '').split('\n').filter((line, index, lines) => line.trim() || (
    index > 0 && index < lines.length - 1
  )).map((line, lineIndex) => {
    const cleanLine = line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ');
    const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={`${lineIndex}-${cleanLine.slice(0, 12)}`}>
        {parts.map((part, index) => (
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={index}>{part.slice(2, -2)}</strong>
            : <React.Fragment key={index}>{part}</React.Fragment>
        ))}
      </p>
    );
  });
}

function AssistantDrawer({ open, onClose, data, assignments, onCreateDeck }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi, I can use your live BetterCLSS dashboard to help you plan, review lessons, or create a study deck.' }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (open) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, open]);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    const userMessage = { role: 'user', content: message };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    const pending = assignments.filter((item) => !item.done);
    const context = {
      contextVersion: 3,
      activePage: 'studenthub',
      canvasConnected: data.connected,
      totals: {
        assignmentsTotal: assignments.length,
        pending: pending.length,
        overdue: pending.filter((item) => {
          const days = daysUntil(item.due);
          return days !== null && days < 0;
        }).length,
        submitted: assignments.filter((item) => item.done).length,
        announcements: data.announcements.length,
        courses: new Set(assignments.map((item) => item.subject).filter(Boolean)).size
      },
      dueSoon: smartSort(pending).slice(0, 20).map((item) => ({
        title: item.title,
        subject: item.subject,
        due: item.due,
        dueInDays: daysUntil(item.due),
        priority: item.priority
      })),
      grades: data.grades.slice(0, 12).map((grade) => ({
        course: grade.courseName || grade.courseCode || grade.subject,
        score: grade.currentScore ?? grade.score
      })),
      recentAnnouncements: data.announcements.slice(0, 12).map((item) => ({
        title: item.title,
        course: item.courseName,
        messagePreview: String(item.message || item.body || '').replace(/<[^>]*>/g, ' ').slice(0, 600)
      })),
      notes: data.studyNote ? [{ title: 'Current study note', preview: data.studyNote.slice(0, 1600) }] : [],
      existingDecks: data.studyDecks.map((deck) => ({ title: deck.title, cardCount: deck.cards?.length || 0 }))
    };

    try {
      let apiBase = '';
      let aiKey = '';
      let canvasToken = '';
      let canvasDomain = '';
      try {
        apiBase = (localStorage.getItem('bclss_api_base') || 'https://betterclss.onrender.com').replace(/\/+$/, '');
        aiKey = localStorage.getItem('bclss_ai_key') || '';
        canvasToken = localStorage.getItem('bclss_canvas_token') || '';
        canvasDomain = localStorage.getItem('bclss_canvas_domain') || '';
      } catch {
        apiBase = 'https://betterclss.onrender.com';
      }
      const headers = { 'Content-Type': 'application/json' };
      if (aiKey) headers['x-ai-key'] = aiKey;
      if (canvasToken) headers['x-canvas-token'] = canvasToken;
      if (canvasDomain) headers['x-canvas-domain'] = canvasDomain;
      const response = await fetch(`${apiBase}/api/assistant/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-12),
          context
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'The AI service is unavailable.');
      (Array.isArray(result.actions) ? result.actions : []).forEach((action) => {
        if (action.type === 'create_deck') onCreateDeck(action);
      });
      setMessages((current) => [...current, {
        role: 'assistant',
        content: result.reply || 'I completed that request.'
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        content: `I could not reach the BetterCLSS AI backend. ${error.message || 'Please try again.'}`
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="assistant-backdrop"
            aria-label="Close AI helper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="assistant-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={SPRING}
            drag="x"
            dragConstraints={{ left: -DRAWER_TRAVEL, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 || info.velocity.x < -500) onClose();
            }}
            aria-label="BetterCLSS AI helper"
          >
            <header className="assistant-drawer-head">
              <div className="assistant-avatar"><Glyph name="spark" className="h-5 w-5" /></div>
              <div>
                <strong>BetterCLSS AI</strong>
                <span>Connected to your dashboard</span>
              </div>
              <button type="button" className="drawer-close" onClick={onClose} aria-label="Close AI helper">
                <Glyph name="close" className="h-5 w-5" />
              </button>
            </header>
            <div className="assistant-message-list" ref={messagesRef}>
              {messages.map((message, index) => (
                <article className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
                  <AssistantText text={message.content} />
                </article>
              ))}
              {sending && <div className="assistant-typing"><i /><i /><i /></div>}
            </div>
            <form className="assistant-composer" onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your dashboard or create cards…"
                rows="2"
                aria-label="Message BetterCLSS AI"
              />
              <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">
                <Glyph name="arrow" className="h-4 w-4" />
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function ViewModeTabs({ label, value, options, onChange }) {
  return (
    <div className="view-mode-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
          key={option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TasksView({ assignments, filter, onFilterChange, connected, onConnect, onToggleDone }) {
  const [page, setPage] = useState(1);
  const listStartRef = useRef(null);
  const visible = useMemo(() => smartSort(assignments).filter((item) => {
    const days = daysUntil(item.due);
    if (filter === 'overdue') return !item.done && days !== null && days < 0;
    if (filter === 'submitted') return item.done;
    return !item.done;
  }), [assignments, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / TASKS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * TASKS_PER_PAGE;
  const pageItems = visible.slice(startIndex, startIndex + TASKS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const changePage = (nextPage) => {
    const clampedPage = Math.max(1, Math.min(nextPage, pageCount));
    if (clampedPage === safePage) return;
    setPage(clampedPage);
    window.requestAnimationFrame(() => {
      listStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <motion.section key={`tasks-${filter}`} className="view-stack tasks-view" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Coursework" title="Tasks" detail={`${filter[0].toUpperCase()}${filter.slice(1)} assignments`} />
      <ViewModeTabs
        label="Task filters"
        value={filter}
        onChange={onFilterChange}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'submitted', label: 'Submitted' }
        ]}
      />
      <section className="section-card tasks-card" ref={listStartRef}>
        {visible.length ? (
          <>
            <div className="task-page-summary" aria-live="polite">
              <span>Showing {startIndex + 1}–{Math.min(startIndex + TASKS_PER_PAGE, visible.length)} of {visible.length}</span>
              <strong>{filter}</strong>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${filter}-${safePage}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                {pageItems.map((item, index) => (
                  <button
                    type="button"
                    className="deadline-row task-toggle-row mb-3 last:mb-0"
                    key={`${item.id || item.title}-${startIndex + index}`}
                    onClick={() => onToggleDone(item)}
                    aria-pressed={Boolean(item.done)}
                    aria-label={`${item.done ? 'Mark pending' : 'Mark submitted'}: ${item.title}`}
                  >
                    <span className={`priority-rail ${item.priority || 'medium'}`} />
                    <div className="min-w-0 flex-1">
                      <h3 className="task-title truncate text-sm font-semibold">{item.title}</h3>
                      <p className="task-meta mt-1 text-xs">{item.subject || 'Course'} · {item.due || 'No due date'}</p>
                    </div>
                    <span className={`task-done-control ${item.done ? 'done' : ''}`} aria-hidden="true">
                      <Glyph name={item.done ? 'spark' : 'tasks'} className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
            {pageCount > 1 && (
              <nav className="task-pagination" aria-label="Task pages">
                <button
                  type="button"
                  onClick={() => changePage(safePage - 1)}
                  disabled={safePage === 1}
                  aria-label="Previous task page"
                >
                  <Glyph name="chevron" className="h-4 w-4 rotate-90" />
                  <span>Previous</span>
                </button>
                <span className="task-page-status">
                  <strong>{safePage}</strong>
                  <span>of {pageCount}</span>
                </span>
                <button
                  type="button"
                  onClick={() => changePage(safePage + 1)}
                  disabled={safePage === pageCount}
                  aria-label="Next task page"
                >
                  <span>Next</span>
                  <Glyph name="chevron" className="h-4 w-4 -rotate-90" />
                </button>
              </nav>
            )}
          </>
        ) : <EmptyDeadlines connected={connected} onConnect={onConnect} />}
      </section>
    </motion.section>
  );
}

function CalendarView({ calendarView, onViewChange, assignments, savedEvents }) {
  const days = Array.from({ length: 35 }, (_, index) => index < 3 ? 27 + index : index - 2);
  const events = useMemo(
    () => smartSort([
      ...assignments.filter((item) => !item.done),
      ...savedEvents.map((event) => ({
        id: `event-${event.id}`,
        title: event.title,
        subject: event.type || 'Event',
        due: event.date,
        done: false,
        priority: 'low'
      }))
    ]).slice(0, 8),
    [assignments, savedEvents]
  );

  return (
    <motion.section key={`calendar-${calendarView}`} className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Schedule" title="Calendar" detail={`${calendarView[0].toUpperCase()}${calendarView.slice(1)} view`} />
      <ViewModeTabs
        label="Calendar views"
        value={calendarView}
        onChange={onViewChange}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'agenda', label: 'Agenda' },
          { value: 'week', label: 'Week' },
          { value: 'day', label: 'Day' }
        ]}
      />
      <section className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <span className="eyebrow-mobile">Current month</span>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-white">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          </div>
          <span className="count-pill">{calendarView}</span>
        </div>
        <AnimatePresence mode="wait">
          {calendarView === 'month' && (
            <motion.div key="month-grid" className="mt-6 grid grid-cols-7 gap-2 text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {'SMTWTFS'.split('').map((day, index) => <span key={`${day}-${index}`} className="pb-2 text-[0.62rem] font-bold text-slate-600">{day}</span>)}
              {days.map((day, index) => (
                <motion.button
                  type="button"
                  key={`${day}-${index}`}
                  className={`calendar-day-mobile ${day === new Date().getDate() && index >= 3 ? 'today' : ''} ${index < 3 ? 'muted' : ''}`}
                  whileTap={{ scale: 0.86 }}
                >
                  {day}
                </motion.button>
              ))}
            </motion.div>
          )}

          {calendarView === 'agenda' && (
            <motion.div key="agenda-list" className="calendar-agenda" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {events.length ? events.map((event, index) => (
                <article className="agenda-event" key={event.id || `${event.title}-${index}`}>
                  <span className={`agenda-dot ${index === 0 ? 'urgent' : ''}`} />
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.subject || 'Course'} · {event.due || 'No due date'}</p>
                  </div>
                </article>
              )) : <p className="study-empty-copy">No scheduled coursework or events.</p>}
            </motion.div>
          )}

          {calendarView === 'week' && (
            <motion.div key="week-board" className="week-board" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => (
                <div className={`week-column ${index === 2 ? 'current' : ''}`} key={day}>
                  <span>{day}</span>
                  <strong>{new Date().getDate() + index - 2}</strong>
                  {(index === 1 || index === 2 || index === 4) && <i style={{ '--event-offset': `${18 + index * 9}px` }} />}
                </div>
              ))}
            </motion.div>
          )}

          {calendarView === 'day' && (
            <motion.div key="day-timeline" className="day-timeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {['09:00', '11:00', '14:00', '16:00'].map((time, index) => (
                <div className="timeline-row" key={time}>
                  <time>{time}</time>
                  <span />
                  {index === 1 && events[0] && <article><strong>{events[0].title}</strong><small>{events[0].subject || 'Coursework'}</small></article>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.section>
  );
}

const DEFAULT_STUDY_DURATIONS = { work: 25, break: 5, long: 15 };
const STUDY_DURATION_PROFILES = {
  Quick: { work: 15, break: 5, long: 10 },
  Balanced: DEFAULT_STUDY_DURATIONS,
  Deep: { work: 50, break: 10, long: 20 }
};
const MODE_CAROUSEL_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.82 };

function readStudyDurations() {
  try {
    const stored = JSON.parse(localStorage.getItem('bclss_study_durations') || '{}');
    const candidate = {
      work: Number(stored.work) || DEFAULT_STUDY_DURATIONS.work,
      break: Number(stored.break) || DEFAULT_STUDY_DURATIONS.break,
      long: Number(stored.long) || DEFAULT_STUDY_DURATIONS.long
    };
    return Object.values(STUDY_DURATION_PROFILES).find((profile) => (
      profile.work === candidate.work && profile.break === candidate.break && profile.long === candidate.long
    )) || DEFAULT_STUDY_DURATIONS;
  } catch {
    return DEFAULT_STUDY_DURATIONS;
  }
}

function readCustomSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem('bclss_custom_sessions') || '[]');
    return Array.isArray(stored)
      ? stored
        .map((session) => ({
          id: String(session.id || ''),
          label: String(session.label || '').trim().slice(0, 40),
          minutes: Math.max(1, Math.min(120, Number(session.minutes) || 25)),
          custom: true,
          icon: 'tag'
        }))
        .filter((session) => session.id && session.label)
      : [];
  } catch {
    return [];
  }
}

function StudySheet({ open, title, detail, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="study-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            className="study-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.34 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 85 || info.velocity.y > 650) onClose();
            }}
          >
            <div className="sheet-handle" />
            <header className="study-sheet-header">
              <div>
                <span className="eyebrow-mobile">Focus workspace</span>
                <h2>{title}</h2>
                <p>{detail}</p>
              </div>
              <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
                <Glyph name="close" className="h-5 w-5" />
              </button>
            </header>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TimerModeCarousel({ sessions, activeId, onSelect, onAdd, onEdit, editingDisabled = false }) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const viewportRef = useRef(null);
  const itemRefs = useRef([]);
  const draggedRef = useRef(false);
  const pressRef = useRef(null);
  const holdTimerRef = useRef(null);
  const trackX = useMotionValue(0);
  const [metrics, setMetrics] = useState({ width: 280, cardWidth: 280, gap: 12 });
  const activeIndex = Math.max(0, sessions.findIndex((session) => session.id === activeId));
  const stride = metrics.cardWidth + metrics.gap;
  const inset = (metrics.width - metrics.cardWidth) / 2;
  const addIndex = sessions.length;
  const positionForIndex = (index) => inset - (index * stride);

  const settleAt = (index, animateSettle = true) => {
    const target = positionForIndex(Math.max(0, Math.min(addIndex, index)));
    if (reduceMotion || !animateSettle) {
      trackX.set(target);
      return;
    }
    animate(trackX, target, MODE_CAROUSEL_SPRING);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const width = viewport.getBoundingClientRect().width || 280;
      setMetrics({
        width,
        cardWidth: width,
        gap: 12
      });
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    settleAt(activeIndex);
  }, [activeIndex, metrics.width, metrics.cardWidth]);

  const cancelPressHold = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const handlePointerDown = (event) => {
    if (reduceMotion || event.button !== 0 || event.target.closest('.timer-mode-edit')) return;
    pressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    cancelPressHold();
    holdTimerRef.current = window.setTimeout(() => {
      if (!pressRef.current || pressRef.current.pointerId !== event.pointerId) return;
      draggedRef.current = true;
      dragControls.start(event, { snapToCursor: false });
      navigator.vibrate?.(7);
    }, 180);
  };

  const handlePointerMove = (event) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || draggedRef.current) return;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 8) {
      cancelPressHold();
      pressRef.current = null;
    }
  };

  const finishPress = (event) => {
    if (pressRef.current?.pointerId === event.pointerId) pressRef.current = null;
    cancelPressHold();
  };

  useEffect(() => () => cancelPressHold(), []);

  const selectIndex = (index, { focus = false } = {}) => {
    const safeIndex = Math.max(0, Math.min(addIndex, index));
    if (safeIndex === addIndex) {
      settleAt(activeIndex);
      onAdd();
    } else {
      onSelect(sessions[safeIndex]);
      settleAt(safeIndex);
    }
    if (focus) window.requestAnimationFrame(() => itemRefs.current[safeIndex]?.focus());
  };

  const handleKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = Math.min(addIndex, index + 1);
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = addIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    if (nextIndex < addIndex) {
      onSelect(sessions[nextIndex]);
      settleAt(nextIndex);
    } else {
      settleAt(nextIndex);
    }
    window.requestAnimationFrame(() => itemRefs.current[nextIndex]?.focus());
  };

  const handleDragEnd = (_, info) => {
    const rawIndex = Math.round((inset - trackX.get()) / stride);
    const flickDirection = info.velocity.x < -460 ? 1 : info.velocity.x > 460 ? -1 : 0;
    const intendedIndex = rawIndex === activeIndex && flickDirection
      ? activeIndex + flickDirection
      : rawIndex;
    const nextIndex = Math.max(0, Math.min(addIndex, intendedIndex));
    if (nextIndex === addIndex) {
      settleAt(activeIndex);
      onAdd();
    } else {
      onSelect(sessions[nextIndex]);
      settleAt(nextIndex);
    }
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  return (
    <div className="timer-mode-carousel" role="region" aria-roledescription="carousel" aria-label="Timer sessions">
      <div
        className="timer-mode-viewport"
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPress}
        onPointerCancel={finishPress}
      >
        <motion.div
          className="timer-mode-track"
          style={{ x: trackX, '--mode-card-width': `${metrics.cardWidth}px`, gap: `${metrics.gap}px` }}
          drag={reduceMotion ? false : 'x'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{
            left: positionForIndex(addIndex),
            right: positionForIndex(0)
          }}
          dragElastic={0.16}
          dragMomentum={false}
          onDragStart={() => {
            draggedRef.current = true;
          }}
          onDragEnd={handleDragEnd}
        >
          {sessions.map((session, index) => (
            <div className="timer-mode-card-wrap" key={session.id}>
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                className={`timer-mode-card ${session.custom ? 'custom' : 'built-in'} ${session.id === activeId ? 'active' : ''}`}
                aria-pressed={session.id === activeId}
                aria-label={`${session.label}, ${session.minutes} minutes${session.custom ? ', custom session' : ''}`}
                tabIndex={session.id === activeId ? 0 : -1}
                onFocus={() => settleAt(index)}
                onClick={() => {
                  if (!draggedRef.current) selectIndex(index);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="timer-mode-card-icon"><Glyph name={session.icon} className="h-[18px] w-[18px]" /></span>
                <span className="timer-mode-card-copy">
                  <strong>{session.label}</strong>
                  <small>{session.minutes} min</small>
                </span>
                <span className="timer-mode-card-kind">{session.custom ? 'Custom' : 'Preset'}</span>
              </button>
              {session.custom && (
                <button
                  type="button"
                  className="timer-mode-edit"
                  aria-label={`Edit ${session.label}`}
                  tabIndex={session.id === activeId ? 0 : -1}
                  disabled={editingDisabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={() => settleAt(index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(session);
                  }}
                >
                  <Glyph name="settings" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="timer-mode-card-wrap add" key="add-session">
            <button
              ref={(element) => {
                itemRefs.current[addIndex] = element;
              }}
              type="button"
              className="timer-mode-card add"
              aria-label="Add custom timer session"
              tabIndex="0"
              onFocus={() => settleAt(addIndex)}
              onClick={() => {
                if (!draggedRef.current) {
                  settleAt(activeIndex);
                  onAdd();
                }
              }}
              onKeyDown={(event) => handleKeyDown(event, addIndex)}
            >
              <span className="timer-mode-add-icon" aria-hidden="true">+</span>
              <span className="timer-mode-card-copy">
                <strong>New session</strong>
                <small>Name your rhythm</small>
              </span>
            </button>
          </div>
        </motion.div>
      </div>
      <div className="timer-mode-position" aria-live="polite">
        <span><strong>{sessions[activeIndex]?.label}</strong> · {activeIndex + 1} of {sessions.length}</span>
        <div className="timer-mode-dots" aria-hidden="true">
          {sessions.map((session) => <i className={session.id === activeId ? 'active' : ''} key={session.id} />)}
        </div>
      </div>
    </div>
  );
}

const STUDY_AREA_TABS = [
  { id: 'timer', label: 'Timer', icon: 'clock' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'cards', label: 'Cards', icon: 'cards' }
];

function StudyBlobTabs({ value, onChange }) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);
  const wrapperRef = useRef(null);
  const tabRefs = useRef({});
  const holdTimerRef = useRef(null);
  const gestureRef = useRef(null);
  const dragTargetRef = useRef(null);
  const suppressClickRef = useRef(false);
  const isExpanded = Boolean(reduceMotion) || expanded;

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const tabAtPoint = (clientX, clientY) => {
    const wrapperBounds = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperBounds) return null;
    let nearest = null;
    let nearestDistance = 54;
    STUDY_AREA_TABS.forEach((tab, index) => {
      const distance = Math.hypot(
        clientX - (wrapperBounds.left + (wrapperBounds.width * ((index + 0.5) / STUDY_AREA_TABS.length))),
        clientY - (wrapperBounds.top + 28)
      );
      if (distance < nearestDistance) {
        nearest = tab.id;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const selectTab = (tabId, { collapse = true } = {}) => {
    if (!STUDY_AREA_TABS.some((tab) => tab.id === tabId)) return;
    onChange(tabId);
    if (collapse && !reduceMotion) setExpanded(false);
    dragTargetRef.current = null;
    setDragTarget(null);
  };

  const handleTabClick = (tabId) => {
    if (suppressClickRef.current) return;
    if (tabId === value) {
      if (!reduceMotion) setExpanded((current) => !current);
      return;
    }
    selectTab(tabId);
  };

  const handleKeyDown = (event, tabId) => {
    const currentIndex = STUDY_AREA_TABS.findIndex((tab) => tab.id === tabId);
    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % STUDY_AREA_TABS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + STUDY_AREA_TABS.length) % STUDY_AREA_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = STUDY_AREA_TABS.length - 1;
    if (event.key === 'Escape' && !reduceMotion) {
      event.preventDefault();
      setExpanded(false);
      tabRefs.current[value]?.focus();
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = STUDY_AREA_TABS[nextIndex];
    selectTab(nextTab.id);
    window.requestAnimationFrame(() => tabRefs.current[nextTab.id]?.focus());
  };

  const handlePointerDown = (event) => {
    if (reduceMotion || isExpanded || event.button !== 0) return;
    const tabButton = event.target.closest('[data-study-tab]');
    if (!tabButton || tabButton.dataset.studyTab !== value) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      if (!gestureRef.current || gestureRef.current.pointerId !== event.pointerId) return;
      gestureRef.current.dragging = true;
      wrapperRef.current?.setPointerCapture(event.pointerId);
      setExpanded(true);
      dragTargetRef.current = value;
      setDragTarget(value);
    }, 280);
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > 10) {
        clearHoldTimer();
        gestureRef.current = null;
      }
      return;
    }
    event.preventDefault();
    const nextTarget = tabAtPoint(event.clientX, event.clientY);
    dragTargetRef.current = nextTarget;
    setDragTarget(nextTarget);
  };

  const finishPointerGesture = (event, cancelled = false) => {
    clearHoldTimer();
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) {
      event.preventDefault();
      const selected = cancelled ? null : dragTargetRef.current;
      if (selected) selectTab(selected);
      else if (!reduceMotion) setExpanded(false);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (wrapperRef.current?.hasPointerCapture(event.pointerId)) {
        wrapperRef.current.releasePointerCapture(event.pointerId);
      }
    }
    gestureRef.current = null;
    dragTargetRef.current = null;
    setDragTarget(null);
  };

  useEffect(() => () => clearHoldTimer(), []);

  useEffect(() => {
    if (!expanded || reduceMotion) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [expanded, reduceMotion]);

  return (
    <motion.div
      ref={wrapperRef}
      className={`study-tabs study-blob-tabs study-dimmable ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${dragTarget ? 'is-dragging' : ''}`}
      role="tablist"
      aria-label="Study area"
      aria-orientation="horizontal"
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointerGesture(event)}
      onPointerCancel={(event) => finishPointerGesture(event, true)}
    >
      {STUDY_AREA_TABS.map((tab, index) => {
        const active = value === tab.id;
        const highlighted = dragTarget === tab.id;
        return (
          <motion.button
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`study-tab-${tab.id}`}
            aria-controls={`study-panel-${tab.id}`}
            aria-selected={active}
            aria-expanded={active ? isExpanded : undefined}
            aria-label={`${tab.label}${active && !isExpanded ? '. Activate to show all study tabs.' : ''}`}
            tabIndex={active ? 0 : -1}
            data-study-tab={tab.id}
            data-drag-target={highlighted ? 'true' : 'false'}
            className={`study-blob-tab ${active ? 'active' : ''}`}
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            animate={{
              left: isExpanded ? `${((index + 0.5) / STUDY_AREA_TABS.length) * 100}%` : '50%',
              width: isExpanded ? 54 : active ? 128 : 48,
              height: isExpanded ? 54 : active ? 50 : 44,
              opacity: isExpanded || active ? 1 : 0,
              scale: isExpanded || active ? 1 : 0.38,
              y: isExpanded ? -4 : active ? 0 : 9
            }}
            transition={reduceMotion ? { duration: 0 } : {
              type: 'spring',
              stiffness: 350,
              damping: 22,
              mass: 0.72,
              delay: isExpanded ? index * 0.045 : (STUDY_AREA_TABS.length - index - 1) * 0.018
            }}
          >
            <span className="study-blob-tab-icon"><Glyph name={tab.icon} className="h-4 w-4" /></span>
            <span className="study-blob-tab-label">{tab.label}</span>
          </motion.button>
        );
      })}
      <span className="study-blob-hint" aria-hidden="true">
        {isExpanded ? 'Choose a space' : 'Tap or hold'}
      </span>
    </motion.div>
  );
}

function CardsStudySection({ decks, onCreateDeck }) {
  const reduceMotion = useReducedMotion();
  const draggingRef = useRef(false);
  const deckListRef = useRef(null);
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [deckPage, setDeckPage] = useState(1);
  const [reviewCards, setReviewCards] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [reviewDirection, setReviewDirection] = useState(0);
  const [results, setResults] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [reviewLedger, setReviewLedger] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bclss_card_reviews') || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) || null;
  const activeCard = reviewCards[reviewIndex] || null;
  const reviewComplete = Boolean(selectedDeck && reviewCards.length && reviewIndex >= reviewCards.length);
  const today = dateKey();
  const deckPageCount = Math.max(1, Math.ceil(decks.length / DECKS_PER_PAGE));
  const safeDeckPage = Math.min(deckPage, deckPageCount);
  const deckPageStart = (safeDeckPage - 1) * DECKS_PER_PAGE;
  const visibleDecks = decks.slice(deckPageStart, deckPageStart + DECKS_PER_PAGE);

  useEffect(() => {
    try {
      localStorage.setItem('bclss_card_reviews', JSON.stringify(reviewLedger));
    } catch {
      // Review state remains available for the current session if storage is restricted.
    }
  }, [reviewLedger]);

  useEffect(() => {
    setDeckPage((current) => Math.min(current, deckPageCount));
  }, [deckPageCount]);

  const changeDeckPage = (nextPage) => {
    const clampedPage = Math.max(1, Math.min(nextPage, deckPageCount));
    if (clampedPage === safeDeckPage) return;
    setDeckPage(clampedPage);
    window.requestAnimationFrame(() => {
      deckListRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const cardReviewKey = (deckId, cardId) => `${deckId}:${cardId}`;
  const dueCountForDeck = (deck) => deck.cards.filter((card) => {
    if (card.done) return false;
    const review = reviewLedger[cardReviewKey(deck.id, card.id)];
    if (review?.date === today) return review.rating !== 'got-it';
    if (deck.generated) return true;
    const days = daysUntil(card.due);
    return days !== null && days <= 0;
  }).length;

  const startDeck = (deck, cardIds = null) => {
    setSelectedDeckId(deck.id);
    const cards = cardIds
      ? cardIds.map((id) => deck.cards.find((card) => String(card.id) === String(id))).filter(Boolean)
      : [...deck.cards];
    setReviewCards(cards);
    setReviewIndex(0);
    setCardFlipped(false);
    setReviewDirection(0);
    setResults({});
    setAnnouncement(cards.length ? `${deck.title} review started.` : `${deck.title} has no cards.`);
  };

  const leaveDeck = () => {
    setSelectedDeckId(null);
    setReviewCards([]);
    setReviewIndex(0);
    setCardFlipped(false);
    setResults({});
    setAnnouncement('Deck list opened.');
  };

  const markCard = (rating) => {
    if (!activeCard) return;
    const direction = rating === 'got-it' ? 1 : -1;
    const currentNumber = reviewIndex + 1;
    setReviewDirection(direction);
    setCardFlipped(false);
    setResults((current) => ({ ...current, [activeCard.id]: rating }));
    setReviewLedger((current) => ({
      ...current,
      [cardReviewKey(selectedDeck.id, activeCard.id)]: {
        rating,
        date: today,
        reviewedAt: new Date().toISOString()
      }
    }));
    setAnnouncement(`${rating === 'got-it' ? 'Got it' : 'Review again'} marked for card ${currentNumber}.`);
    setReviewIndex((current) => current + 1);
  };

  const toggleCard = () => {
    if (!activeCard || draggingRef.current) return;
    setCardFlipped((current) => !current);
    setAnnouncement(cardFlipped ? 'Card front shown.' : 'Card answer shown.');
  };

  if (!selectedDeck) {
    return (
      <motion.section
        className="cards-workspace"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <header className="cards-library-heading">
          <span className="cards-library-mark" aria-hidden="true"><Glyph name="study" className="h-5 w-5" /></span>
          <div>
            <span className="eyebrow-mobile">Your library</span>
            <h2>Choose a deck</h2>
            <p>Flip, decide, and move through one card at a time.</p>
          </div>
        </header>

        {decks.length ? (
          <>
            <div className="deck-page-summary" aria-live="polite">
              Showing {deckPageStart + 1}–{Math.min(deckPageStart + DECKS_PER_PAGE, decks.length)} of {decks.length} decks
            </div>
            <div className="deck-selection-list" ref={deckListRef} role="group" aria-label="Available study decks">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  className="deck-selection-page"
                  key={`deck-page-${safeDeckPage}`}
                  initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  {visibleDecks.map((deck, index) => {
                    const dueCount = dueCountForDeck(deck);
                    return (
                      <motion.button
                        type="button"
                        className="deck-selection-row"
                        onClick={() => startDeck(deck)}
                        key={deck.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: index * 0.035 }}
                        aria-label={`${deck.title}. ${deck.cards.length} cards. ${dueCount} due for review today.`}
                      >
                        <span className={`deck-selection-glyph ${deck.generated ? 'generated' : ''}`} aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span className="deck-selection-copy">
                          <strong>{deck.title}</strong>
                          <small>{deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}</small>
                        </span>
                        <span className={`deck-due-count ${dueCount ? '' : 'clear'}`}>
                          {dueCount ? `${dueCount} due today` : 'Caught up'}
                        </span>
                        <Glyph name="arrow" className="deck-selection-arrow h-4 w-4" />
                      </motion.button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            {deckPageCount > 1 && (
              <nav className="deck-pagination" aria-label="Deck pages">
                <button
                  type="button"
                  onClick={() => changeDeckPage(safeDeckPage - 1)}
                  disabled={safeDeckPage === 1}
                  aria-label="Previous deck page"
                >
                  <Glyph name="chevron" className="h-4 w-4 rotate-90" />
                  <span>Previous</span>
                </button>
                <span className="deck-page-status"><strong>{safeDeckPage}</strong><span>of {deckPageCount}</span></span>
                <button
                  type="button"
                  onClick={() => changeDeckPage(safeDeckPage + 1)}
                  disabled={safeDeckPage === deckPageCount}
                  aria-label="Next deck page"
                >
                  <span>Next</span>
                  <Glyph name="chevron" className="h-4 w-4 -rotate-90" />
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="cards-library-empty">
            <span className="cards-empty-stack" aria-hidden="true"><i /><i /><i /></span>
            <h2>No decks yet</h2>
            <p>Create a deck with BetterCLSS AI, then it will appear here ready to review.</p>
            <button type="button" onClick={onCreateDeck}>Create your first deck</button>
          </div>
        )}
        <span className="sr-only" aria-live="polite">{announcement}</span>
      </motion.section>
    );
  }

  if (!selectedDeck.cards.length) {
    return (
      <section
        className="cards-workspace cards-review-shell"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
      >
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <div className="cards-library-empty deck-is-empty">
          <span className="cards-empty-stack" aria-hidden="true"><i /><i /><i /></span>
          <h2>{selectedDeck.title} is empty</h2>
          <p>Add a few question-and-answer cards before starting a review.</p>
          <button type="button" onClick={onCreateDeck}>Create cards</button>
        </div>
      </section>
    );
  }

  if (reviewComplete) {
    const reviewAgainIds = Object.entries(results)
      .filter(([, rating]) => rating === 'again')
      .map(([cardId]) => cardId);
    const gotItCount = Object.values(results).filter((rating) => rating === 'got-it').length;
    return (
      <motion.section
        className="cards-workspace cards-review-shell"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <div className="cards-session-complete" role="status">
          <span className="cards-complete-mark" aria-hidden="true"><Glyph name="spark" className="h-7 w-7" /></span>
          <span className="eyebrow-mobile">Session complete</span>
          <h2>Deck cleared.</h2>
          <p>You worked through all {reviewCards.length} cards in {selectedDeck.title}.</p>
          <div className="cards-session-summary">
            <span><strong>{gotItCount}</strong><small>Got it</small></span>
            <span><strong>{reviewAgainIds.length}</strong><small>Review again</small></span>
          </div>
          {reviewAgainIds.length > 0 && (
            <button type="button" className="cards-review-missed" onClick={() => startDeck(selectedDeck, reviewAgainIds)}>
              Review missed again
            </button>
          )}
          <button type="button" className="cards-finish-button" onClick={leaveDeck}>Back to decks</button>
        </div>
      </motion.section>
    );
  }

  const remaining = reviewCards.length - reviewIndex - 1;
  const cardBack = activeCard.answer || [
    activeCard.due ? `Due ${activeCard.due}` : 'No due date',
    activeCard.priority ? `${activeCard.priority} priority` : 'Course review item',
    activeCard.done ? 'Already completed' : 'Still open'
  ].join(' · ');

  return (
    <section
      className="cards-workspace cards-review-shell"
      id="study-panel-cards"
      role="region"
      aria-label="Cards"
      tabIndex="0"
    >
      <header className="cards-review-heading">
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <span aria-live="polite"><strong>{reviewIndex + 1}</strong> of {reviewCards.length}</span>
      </header>

      <div className="cards-stack-stage">
        {remaining > 1 && <span className="cards-stack-layer far" aria-hidden="true" />}
        {remaining > 0 && <span className="cards-stack-layer near" aria-hidden="true" />}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.article
            className="cards-review-card"
            key={activeCard.id}
            drag={reduceMotion ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.72}
            dragMomentum={false}
            onDragStart={() => {
              draggingRef.current = true;
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 82 || info.velocity.x > 520) markCard('got-it');
              else if (info.offset.x < -82 || info.velocity.x < -520) markCard('again');
              window.setTimeout(() => {
                draggingRef.current = false;
              }, 0);
            }}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.965 }}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : {
              opacity: 0,
              x: reviewDirection * 430,
              y: -8,
              rotate: reviewDirection * 11,
              scale: 0.96
            }}
            transition={reduceMotion ? { duration: 0 } : SPRING}
          >
            <button
              type="button"
              className="cards-flip-surface"
              onClick={toggleCard}
              aria-label={`${cardFlipped ? 'Back' : 'Front'} of card ${reviewIndex + 1}: ${cardFlipped ? cardBack : activeCard.title}. Flip card.`}
            >
              <motion.span
                className="cards-flip-inner"
                animate={{ rotateY: cardFlipped ? 180 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
              >
                <span className="cards-face cards-face-front">
                  <small>Front</small>
                  <strong>{activeCard.title}</strong>
                  <em>Tap to reveal</em>
                </span>
                <span className="cards-face cards-face-back">
                  <small>Back</small>
                  <strong>{cardBack}</strong>
                  <em>Tap to return</em>
                </span>
              </motion.span>
            </button>
          </motion.article>
        </AnimatePresence>
      </div>

      <div className="cards-review-actions" role="group" aria-label="Card review actions">
        <button type="button" className="again" onClick={() => markCard('again')}>
          <Glyph name="reset" className="h-4 w-4" />
          <span>Review again<small>Swipe left</small></span>
        </button>
        <button type="button" className="flip" onClick={toggleCard}>
          <Glyph name="sync" className="h-4 w-4" />
          <span>Flip<small>Show {cardFlipped ? 'front' : 'back'}</small></span>
        </button>
        <button type="button" className="got-it" onClick={() => markCard('got-it')}>
          <Glyph name="spark" className="h-4 w-4" />
          <span>Got it<small>Swipe right</small></span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </section>
  );
}

function GestureTimerRing({
  running,
  timeLeft,
  formattedTime,
  remainingRatio,
  activeMode,
  blocked = false,
  onToggle,
  onReset,
  onScrub
}) {
  const reduceMotion = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [resetCommitted, setResetCommitted] = useState(false);
  const [scrubTick, setScrubTick] = useState(null);
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem('bclss_timer_ring_hint_seen') !== '1';
    } catch {
      return true;
    }
  });
  const surfaceRef = useRef(null);
  const gestureRef = useRef(null);
  const holdTimerRef = useRef(null);
  const tickIdRef = useRef(0);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem('bclss_timer_ring_hint_seen', '1');
    } catch {
      // The gesture hint can safely return when browser storage is unavailable.
    }
  };

  const angleAtPoint = (clientX, clientY) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    return Math.atan2(
      clientY - (bounds.top + (bounds.height / 2)),
      clientX - (bounds.left + (bounds.width / 2))
    ) * (180 / Math.PI);
  };

  const cancelHold = () => {
    clearHoldTimer();
    setHolding(false);
  };

  const handlePointerDown = (event) => {
    if (blocked || event.button !== 0) return;
    event.preventDefault();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    const startAngle = angleAtPoint(event.clientX, event.clientY);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSeconds: Math.max(60, Math.round(timeLeft / 60) * 60),
      lastSeconds: timeLeft,
      lastAngle: startAngle,
      totalAngle: 0,
      minuteDelta: 0,
      moved: false,
      scrubbing: false,
      resetCommitted: false
    };
    setHolding(true);
    setResetCommitted(false);
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      if (!gestureRef.current || gestureRef.current.pointerId !== event.pointerId) return;
      gestureRef.current.resetCommitted = true;
      setResetCommitted(true);
      onReset();
      dismissHint();
      navigator.vibrate?.([24, 35, 24]);
    }, 1000);
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.resetCommitted) return;
    const travel = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (travel <= 8 && !gesture.scrubbing) return;
    gesture.moved = true;
    cancelHold();
    if (running) return;

    gesture.scrubbing = true;
    setScrubbing(true);
    const nextAngle = angleAtPoint(event.clientX, event.clientY);
    let angleDelta = nextAngle - gesture.lastAngle;
    if (angleDelta > 180) angleDelta -= 360;
    if (angleDelta < -180) angleDelta += 360;
    gesture.lastAngle = nextAngle;
    gesture.totalAngle += angleDelta;

    const nextMinuteDelta = Math.round(gesture.totalAngle / 72);
    if (nextMinuteDelta === gesture.minuteDelta) return;
    const nextSeconds = Math.max(60, Math.min(120 * 60, gesture.startSeconds + (nextMinuteDelta * 60)));
    gesture.minuteDelta = nextMinuteDelta;
    if (nextSeconds === gesture.lastSeconds) return;
    const direction = nextSeconds > gesture.lastSeconds ? 1 : -1;
    gesture.lastSeconds = nextSeconds;
    onScrub(nextSeconds);
    tickIdRef.current += 1;
    setScrubTick({ id: tickIdRef.current, direction });
    navigator.vibrate?.(8);
  };

  const finishPointerGesture = (event, cancelled = false) => {
    clearHoldTimer();
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!cancelled && !gesture.resetCommitted && !gesture.scrubbing && !gesture.moved) {
      onToggle();
      dismissHint();
    }
    setHolding(false);
    setScrubbing(false);
    gestureRef.current = null;
    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => setResetCommitted(false), 280);
  };

  useEffect(() => () => clearHoldTimer(), []);

  useEffect(() => {
    if (!showHint) return undefined;
    const timeout = window.setTimeout(dismissHint, 7200);
    return () => window.clearTimeout(timeout);
  }, [showHint]);

  const stateLabel = blocked
    ? 'Choose above'
    : resetCommitted
    ? 'Reset'
    : holding
      ? 'Keep holding'
      : scrubbing
        ? 'Adjusting'
        : running
          ? 'In focus'
          : 'Ready';

  return (
    <div className="timer-ring-shell">
      <div
        ref={surfaceRef}
        className={`timer-hero timer-ring-control ${running ? 'is-running' : 'is-paused'} ${holding ? 'is-holding' : ''} ${scrubbing ? 'is-scrubbing' : ''} ${resetCommitted ? 'is-reset' : ''} ${blocked ? 'is-blocked' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        aria-hidden="true"
      >
        <div className={`timer-aura ${running ? 'active' : ''}`} />
        <svg className="timer-ring-svg" viewBox="0 0 320 320">
          <defs>
            <linearGradient id="focus-ring-gradient" x1="38" y1="42" x2="280" y2="286" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9d6cff" />
              <stop offset=".52" stopColor="#718cff" />
              <stop offset="1" stopColor="#43dec0" />
            </linearGradient>
            <linearGradient id="reset-ring-gradient" x1="30" y1="30" x2="290" y2="290" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4ba72" />
              <stop offset="1" stopColor="#ff7188" />
            </linearGradient>
            <filter id="focus-ring-glow"><feGaussianBlur stdDeviation="7" /></filter>
          </defs>
          <circle className="timer-track" cx="160" cy="160" r="135" />
          <motion.circle
            className="timer-ring-glow"
            cx="160"
            cy="160"
            r="135"
            pathLength="1"
            initial={false}
            animate={{ pathLength: remainingRatio }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
          />
          <motion.circle
            className="timer-ring-progress"
            cx="160"
            cy="160"
            r="135"
            pathLength="1"
            initial={false}
            animate={{ pathLength: remainingRatio }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
          />
          <motion.circle
            className="timer-reset-commit"
            cx="160"
            cy="160"
            r="149"
            pathLength="1"
            initial={false}
            animate={{ pathLength: holding ? 1 : 0, opacity: holding ? 1 : 0 }}
            transition={reduceMotion
              ? { duration: 0 }
              : holding
                ? { pathLength: { duration: 1, ease: 'linear' }, opacity: { duration: 0.12 } }
                : { duration: 0.18 }}
          />
          <AnimatePresence>
            {scrubTick && (
              <motion.circle
                key={scrubTick.id}
                className="timer-scrub-tick"
                cx="160"
                cy="160"
                r="143"
                pathLength="1"
                initial={{ opacity: 0, pathLength: 0.94, scale: 0.985 }}
                animate={{ opacity: [0, 0.78, 0], pathLength: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </svg>
        <motion.div
          className="timer-readout"
          key={scrubTick?.id || 'timer-readout'}
          initial={scrubTick && !reduceMotion ? { scale: 0.98 } : false}
          animate={{ scale: running ? 1.02 : 1 }}
          transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
        >
          <span>{stateLabel}</span>
          <strong>{formattedTime}</strong>
          <small>{blocked ? 'Resume or discard' : resetCommitted ? 'Timer restored' : holding ? 'Release to cancel' : activeMode === 'long' ? 'Long break' : activeMode}</small>
        </motion.div>
        <AnimatePresence>
          {scrubTick && scrubbing && (
            <motion.span
              key={`feedback-${scrubTick.id}`}
              className="timer-scrub-feedback"
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3 }}
              transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
            >
              {scrubTick.direction > 0 ? '+1 min' : '−1 min'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showHint && !blocked && (
          <motion.div
            className="timer-gesture-hint"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
          >
            <span><Glyph name="play" className="h-3.5 w-3.5" />Tap</span>
            <span><Glyph name="sync" className="h-3.5 w-3.5" />Paused: drag</span>
            <span><Glyph name="reset" className="h-3.5 w-3.5" />Hold to reset</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="timer-accessible-controls" role="group" aria-label="Timer controls">
        <button type="button" className="timer-accessible-control timer-primary-control" onClick={onToggle} disabled={blocked}>
          <Glyph name={running ? 'pause' : 'play'} className="h-4 w-4" />
          {running ? 'Pause timer' : remainingRatio < 1 && timeLeft > 0 ? 'Resume timer' : 'Start timer'}
        </button>
        <button type="button" className="timer-accessible-control timer-reset-control" onClick={onReset} disabled={blocked}>
          <Glyph name="reset" className="h-4 w-4" />
          Reset timer
        </button>
      </div>
      <span className="timer-screenreader-status" role="timer">
        {formattedTime} remaining. Timer {running ? 'running' : 'paused'}.
      </span>
    </div>
  );
}

function StudyView({ activeTab, onTabChange, onRunningChange, onCreateDeck, assignments, savedDecks, initialTasks, initialHistory, initialNote }) {
  const decks = useMemo(() => buildCourseDecks(assignments, savedDecks), [assignments, savedDecks]);
  const [activeMode, setActiveMode] = useState('work');
  const [durations, setDurations] = useState(readStudyDurations);
  const [customSessions, setCustomSessions] = useState(readCustomSessions);
  const [timeLeft, setTimeLeft] = useState(() => readStudyDurations().work * 60);
  const [timerDuration, setTimerDuration] = useState(() => readStudyDurations().work * 60);
  const [running, setRunning] = useState(false);
  const [interruptedSession, setInterruptedSession] = useState(null);
  const [modeEditor, setModeEditor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionNote, setSessionNote] = useState(initialNote);
  const [studyTasks, setStudyTasks] = useState(initialTasks);
  const [studyHistory, setStudyHistory] = useState(initialHistory);
  const noteReady = useRef(false);

  const remainingRatio = Math.max(0, Math.min(1, timeLeft / timerDuration));
  const formattedTime = formatTimerValue(timeLeft);
  const durationProfile = Object.entries(STUDY_DURATION_PROFILES).find(([, profile]) => (
    profile.work === durations.work && profile.break === durations.break && profile.long === durations.long
  ))?.[0] || 'Balanced';
  const studyStats = useMemo(() => buildStudyStats(studyHistory), [studyHistory]);
  const timerSessions = useMemo(() => ([
    { id: 'work', label: 'Work', minutes: durations.work, custom: false, icon: 'clock' },
    { id: 'break', label: 'Break', minutes: durations.break, custom: false, icon: 'smile' },
    { id: 'long', label: 'Long break', minutes: durations.long, custom: false, icon: 'spark' },
    ...customSessions
  ]), [customSessions, durations]);
  const activeTimerSession = timerSessions.find((session) => session.id === activeMode) || timerSessions[0];

  useEffect(() => {
    localStorage.setItem('bclss_study_durations', JSON.stringify(durations));
  }, [durations]);

  useEffect(() => {
    localStorage.setItem('bclss_custom_sessions', JSON.stringify(customSessions));
  }, [customSessions]);

  useEffect(() => {
    if (!noteReady.current) {
      noteReady.current = true;
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      updateStoredLocalData((local) => {
        local.studyCurrentNote = {
          ...(local.studyCurrentNote || {}),
          content: sessionNote,
          updatedAt: new Date().toISOString()
        };
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [sessionNote]);

  useEffect(() => {
    onRunningChange?.(running);
  }, [onRunningChange, running]);

  useEffect(() => () => onRunningChange?.(false), [onRunningChange]);

  useEffect(() => {
    if (activeTab !== 'timer') setRunning(false);
  }, [activeTab]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          if (activeMode === 'work' || activeTimerSession.custom) {
            const now = new Date();
            const entry = {
              id: now.getTime(),
              at: now.toISOString(),
              date: dateKey(now),
              week: weekStartKey(now),
              durationSecs: timerDuration,
              tagList: [activeTimerSession.label],
              notePreview: sessionNote.slice(0, 180),
              noteFull: sessionNote
            };
            setStudyHistory((currentHistory) => {
              const nextHistory = [entry, ...currentHistory].slice(0, 150);
              updateStoredLocalData((local) => {
                local.studyHistory = nextHistory;
                local.studyHours = +(nextHistory
                  .filter((item) => item.date === entry.date)
                  .reduce((total, item) => total + (Number(item.durationSecs) || 0), 0) / 3600)
                  .toFixed(2);
              });
              return nextHistory;
            });
          }
          navigator.vibrate?.([35, 50, 35]);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, activeMode, activeTimerSession.custom, activeTimerSession.label, timerDuration, sessionNote]);

  useEffect(() => {
    if (!settingsOpen && !modeEditor) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setSettingsOpen(false);
      setModeEditor(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [settingsOpen, modeEditor]);

  const chooseMode = (session) => {
    if (!session || session.id === activeMode) return;
    if (running) {
      setInterruptedSession({
        id: activeMode,
        label: activeTimerSession.label,
        timeLeft,
        duration: timerDuration
      });
      setRunning(false);
    }
    const nextDuration = session.minutes * 60;
    setActiveMode(session.id);
    setTimerDuration(nextDuration);
    setTimeLeft(nextDuration);
  };

  const resumeInterruptedSession = () => {
    if (!interruptedSession) return;
    setActiveMode(interruptedSession.id);
    setTimerDuration(interruptedSession.duration);
    setTimeLeft(interruptedSession.timeLeft);
    setInterruptedSession(null);
    setRunning(true);
  };

  const openModeEditor = (session = null) => {
    setModeEditor(session
      ? { id: session.id, label: session.label, minutes: session.minutes }
      : { id: '', label: '', minutes: 25 });
  };

  const saveCustomSession = (event) => {
    event.preventDefault();
    if (!modeEditor) return;
    const label = modeEditor.label.trim().slice(0, 40);
    const minutes = Math.max(1, Math.min(120, Number(modeEditor.minutes) || 25));
    if (!label) return;
    const savedSession = {
      id: modeEditor.id || `custom-${Date.now()}`,
      label,
      minutes,
      custom: true,
      icon: 'tag'
    };
    setCustomSessions((current) => (
      modeEditor.id
        ? current.map((session) => session.id === modeEditor.id ? savedSession : session)
        : [...current, savedSession]
    ));
    setModeEditor(null);
    if (!modeEditor.id) {
      chooseMode(savedSession);
    } else if (activeMode === savedSession.id && !running) {
      const nextDuration = savedSession.minutes * 60;
      setTimerDuration(nextDuration);
      setTimeLeft(nextDuration);
    }
  };

  const applyDurationProfile = (profileName) => {
    const profile = STUDY_DURATION_PROFILES[profileName] || DEFAULT_STUDY_DURATIONS;
    setDurations(profile);
    if (!running) {
      const nextDuration = (activeTimerSession.custom ? activeTimerSession.minutes : profile[activeMode]) * 60;
      setTimerDuration(nextDuration);
      setTimeLeft(nextDuration);
    }
  };

  const toggleTimer = () => {
    onTabChange('timer');
    if (timeLeft <= 0) setTimeLeft(timerDuration);
    setRunning((current) => !current);
  };

  const resetTimer = () => {
    setRunning(false);
    setTimeLeft(timerDuration);
  };

  const scrubTimer = (nextSeconds) => {
    if (running) return;
    setTimerDuration(nextSeconds);
    setTimeLeft(nextSeconds);
  };

  const toggleStudyTask = (taskId) => {
    setStudyTasks((current) => {
      const next = current.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
      updateStoredLocalData((local) => {
        local.studyTasks = next;
      });
      return next;
    });
  };

  return (
    <motion.section className={`study-view ${running ? 'timer-running' : ''} ${activeTab === 'cards' ? 'cards-active' : ''}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <motion.header className="study-heading study-dimmable" animate={{ opacity: running ? 0.16 : 1, y: running ? -5 : 0 }} transition={SPRING}>
        <div>
          <span className="eyebrow-mobile">Deep work</span>
          <h1>Study</h1>
          <p>{activeTab === 'cards' ? 'A tactile review space for every deck.' : 'One study space. Zero noise.'}</p>
        </div>
        {activeTab === 'timer' && (
          <button type="button" className="study-settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open timer settings">
            <Glyph name="settings" className="h-5 w-5" />
          </button>
        )}
      </motion.header>

      {activeTab !== 'cards' && <StudyBlobTabs value={activeTab} onChange={onTabChange} />}

      <AnimatePresence mode="wait">
          {activeTab === 'timer' && (
            <motion.div
              className="timer-workspace"
              key="study-timer"
              id="study-panel-timer"
              role="tabpanel"
              aria-labelledby="study-tab-timer"
              tabIndex="0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <GestureTimerRing
                running={running}
                timeLeft={timeLeft}
                formattedTime={formattedTime}
                remainingRatio={remainingRatio}
                activeMode={activeTimerSession.label}
                blocked={Boolean(interruptedSession)}
                onToggle={toggleTimer}
                onReset={resetTimer}
                onScrub={scrubTimer}
              />

              <TimerModeCarousel
                sessions={timerSessions}
                activeId={activeMode}
                onSelect={chooseMode}
                onAdd={() => openModeEditor()}
                onEdit={openModeEditor}
                editingDisabled={running}
              />

              <AnimatePresence>
                {interruptedSession && (
                  <motion.div
                    className="timer-interruption"
                    role="status"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    transition={SPRING}
                  >
                    <span className="timer-interruption-icon"><Glyph name="pause" className="h-4 w-4" /></span>
                    <span>
                      <strong>{interruptedSession.label} paused</strong>
                      <small>{formatTimerValue(interruptedSession.timeLeft)} remains</small>
                    </span>
                    <button type="button" onClick={resumeInterruptedSession}>Resume</button>
                    <button type="button" className="discard" onClick={() => setInterruptedSession(null)}>Discard</button>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {activeTab === 'notes' && (
            <motion.section
              className="study-secondary-panel"
              key="study-notes"
              id="study-panel-notes"
              role="tabpanel"
              aria-labelledby="study-tab-notes"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
              <span className="secondary-icon"><Glyph name="notes" className="h-5 w-5" /></span>
              <h2>Session notes</h2>
              <p>Saved to your BetterCLSS study workspace.</p>
              <textarea
                aria-label="Session notes"
                placeholder="What are you working through?"
                value={sessionNote}
                onChange={(event) => setSessionNote(event.target.value)}
              />
            </motion.section>
          )}

          {activeTab === 'tasks' && (
            <motion.section
              className="study-secondary-panel"
              key="study-tasks"
              id="study-panel-tasks"
              role="tabpanel"
              aria-labelledby="study-tab-tasks"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
              <span className="secondary-icon"><Glyph name="tasks" className="h-5 w-5" /></span>
              <h2>Focus queue</h2>
              <p>Your saved Study Area tasks.</p>
              {studyTasks.length ? studyTasks.map((task) => (
                <label className={`study-task-row ${task.done ? 'done' : ''}`} key={task.id}>
                  <input type="checkbox" checked={Boolean(task.done)} onChange={() => toggleStudyTask(task.id)} />
                  <span>{task.text}</span>
                </label>
              )) : <p className="study-empty-copy">No study tasks saved yet.</p>}
            </motion.section>
          )}

          {activeTab === 'progress' && (
            <motion.section
              className="study-secondary-panel"
              key="study-progress"
              id="study-panel-progress"
              role="tabpanel"
              aria-labelledby="study-tab-progress"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
              <span className="secondary-icon"><Glyph name="progress" className="h-5 w-5" /></span>
              <h2>This week</h2>
              <p>Calculated from your completed focus sessions.</p>
              <div className="focus-metrics">
                <div><strong>{studyStats.sessions}</strong><span>Sessions</span></div>
                <div><strong>{formatDuration(studyStats.focusedSeconds)}</strong><span>Focused</span></div>
                <div><strong>{studyStats.longestStreak}</strong><span>Streak</span></div>
              </div>
            </motion.section>
          )}
          {activeTab === 'cards' && (
            <CardsStudySection
              key="study-cards"
              decks={decks}
              onCreateDeck={onCreateDeck}
            />
          )}
      </AnimatePresence>

      <StudySheet
        open={settingsOpen}
        title="Timer settings"
        detail="Choose one timer rhythm."
        onClose={() => setSettingsOpen(false)}
      >
        <label className="timer-profile-select">
          <span>Session length</span>
          <div className="timer-profile-control">
            <span className="timer-profile-icon" aria-hidden="true">
              <Glyph name="clock" className="h-4 w-4" />
            </span>
            <select value={durationProfile} onChange={(event) => applyDurationProfile(event.target.value)}>
              <option value="Quick">Quick rhythm</option>
              <option value="Balanced">Balanced rhythm</option>
              <option value="Deep">Deep rhythm</option>
            </select>
            <Glyph name="chevron" className="timer-profile-chevron" />
          </div>
          <span className="timer-profile-breakdown" aria-live="polite">
            <span><strong>{durations.work}</strong><small>focus</small></span>
            <span><strong>{durations.break}</strong><small>break</small></span>
            <span><strong>{durations.long}</strong><small>long break</small></span>
          </span>
        </label>
        <button type="button" className="sheet-done-button" onClick={() => setSettingsOpen(false)}>Done</button>
      </StudySheet>

      <StudySheet
        open={Boolean(modeEditor)}
        title={modeEditor?.id ? 'Edit custom session' : 'New custom session'}
        detail="Give this timer a name and duration."
        onClose={() => setModeEditor(null)}
      >
        {modeEditor && (
          <form className="mode-editor-form" onSubmit={saveCustomSession}>
            <div className="sheet-field">
              <label htmlFor="custom-session-name">Session name</label>
              <input
                id="custom-session-name"
                value={modeEditor.label}
                maxLength="40"
                autoFocus
                placeholder="Reading sprint"
                onChange={(event) => setModeEditor((current) => ({ ...current, label: event.target.value }))}
              />
            </div>
            <div className="sheet-field">
              <label htmlFor="custom-session-duration">Duration in minutes</label>
              <input
                id="custom-session-duration"
                type="number"
                min="1"
                max="120"
                inputMode="numeric"
                value={modeEditor.minutes}
                onChange={(event) => setModeEditor((current) => ({ ...current, minutes: event.target.value }))}
              />
            </div>
            <p className="mode-editor-note">Custom sessions appear after the three fixed presets.</p>
            <button type="submit" className="sheet-done-button" disabled={!modeEditor.label.trim()}>
              {modeEditor.id ? 'Save changes' : 'Add session'}
            </button>
          </form>
        )}
      </StudySheet>
    </motion.section>
  );
}

function ViewHeading({ eyebrow, title, detail }) {
  return (
    <header className="view-heading">
      <span className="eyebrow-mobile">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </header>
  );
}

function SecondaryView({ view, announcements, grades, links, connected, onConnect }) {
  const [aiApiKey, setAiApiKey] = useState(() => {
    try {
      return localStorage.getItem('bclss_ai_key') || '';
    } catch {
      return '';
    }
  });
  const [aiKeyStatus, setAiKeyStatus] = useState('');
  const [title, detail] = VIEW_COPY[view] || ['StudentHub', 'Choose a destination from the navigation drawer.'];
  const gradePanels = grades.slice(0, 6).map((grade) => {
    const course = grade.courseName || grade.courseCode || grade.course || grade.subject || 'Course';
    const activity = grade.label || grade.currentGrade || grade.courseCode || '';
    let score = '';
    if (grade.currentScore != null && Number.isFinite(Number(grade.currentScore))) {
      score = `${Math.round(Number(grade.currentScore))}%`;
    } else if (grade.score != null && grade.total != null) {
      score = `${grade.score}/${grade.total}`;
    } else if (grade.score != null && Number.isFinite(Number(grade.score))) {
      score = `${Math.round(Number(grade.score))}%`;
    }
    return [course, [activity, score].filter(Boolean).join(' · '), 'grades'];
  });
  const announcementPanels = announcements.slice(0, 6).map((item) => [
    item.title || item.courseName || 'Course announcement',
    String(item.message || item.body || item.courseName || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    'bell'
  ]);
  const resourcePanels = links.slice(0, 6).map((item) => [
    item.name || item.title || 'Saved resource',
    item.url || '',
    'link'
  ]);
  const panels = {
    grades: gradePanels,
    announcements: announcementPanels,
    resources: resourcePanels,
    settings: [
      ['Canvas connection', connected ? 'Connected' : 'Not connected', 'sync']
    ]
  };
  const activePanels = panels[view] || [];
  const emptyMessages = {
    grades: connected ? 'No grade records are available from Canvas yet.' : 'Connect Canvas to load your grades.',
    announcements: connected ? 'No announcements are available.' : 'Connect Canvas to load announcements.',
    resources: 'No saved resources yet.'
  };
  const saveAiApiKey = (event) => {
    event.preventDefault();
    const cleanKey = aiApiKey.trim();
    try {
      if (cleanKey) localStorage.setItem('bclss_ai_key', cleanKey);
      else localStorage.removeItem('bclss_ai_key');
      setAiApiKey(cleanKey);
      setAiKeyStatus(cleanKey ? 'Saved on this device.' : 'Custom key removed.');
    } catch {
      setAiKeyStatus('This browser could not save the key.');
    }
  };
  const removeAiApiKey = () => {
    setAiApiKey('');
    try {
      localStorage.removeItem('bclss_ai_key');
      setAiKeyStatus('Custom key removed.');
    } catch {
      setAiKeyStatus('This browser could not remove the key.');
    }
  };

  return (
    <motion.section className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="StudentHub" title={title} detail={detail} />
      <section className="section-card secondary-list">
        {activePanels.map(([panelTitle, panelDetail, icon], index) => (
          <motion.article
            className="secondary-row"
            key={`${panelTitle}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: index * 0.06 }}
          >
            <span className="secondary-icon"><Glyph name={icon} className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2>{panelTitle}</h2>
              <p>{panelDetail}</p>
            </div>
          </motion.article>
        ))}
        {!activePanels.length && (
          <p className="study-empty-copy">{emptyMessages[view] || 'Nothing to show yet.'}</p>
        )}
        {view === 'settings' && (
          <form className="ai-key-settings" onSubmit={saveAiApiKey}>
            <div className="ai-key-settings-head">
              <span className="secondary-icon"><Glyph name="spark" className="h-5 w-5" /></span>
              <div>
                <h2>Gemini API key</h2>
                <p>Stored only in this browser’s local cache. BetterCLSS sends it through the backend to Google Gemini.</p>
              </div>
            </div>
            <label htmlFor="studenthub-ai-api-key">Gemini API key</label>
            <input
              id="studenthub-ai-api-key"
              type="password"
              value={aiApiKey}
              onChange={(event) => {
                setAiApiKey(event.target.value);
                setAiKeyStatus('');
              }}
              placeholder="Paste your Google AI Studio key"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
            />
            <div className="ai-key-settings-actions">
              <button type="submit">Save key</button>
              {aiApiKey && <button type="button" className="remove" onClick={removeAiApiKey}>Remove</button>}
            </div>
            {aiKeyStatus && <p className="ai-key-status" role="status">{aiKeyStatus}</p>}
          </form>
        )}
        {(view === 'settings' || (view === 'grades' && !connected)) && (
          <button type="button" className="secondary-action" onClick={onConnect}>
            <Glyph name="sync" className="h-4 w-4" />
            {connected ? 'Manage Canvas connection' : 'Connect Canvas'}
          </button>
        )}
      </section>
    </motion.section>
  );
}

export default function StudentHubMobileDashboard() {
  const data = useMemo(readDashboardData, []);
  const [assignments, setAssignments] = useState(data.assignments);
  const overdue = useMemo(() => {
    const nextPending = assignments.filter((item) => !item.done);
    return nextPending.filter((item) => {
      const days = daysUntil(item.due);
      return days !== null && days < 0;
    });
  }, [assignments]);

  const [activeView, setActiveView] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [edgeDragging, setEdgeDragging] = useState(false);
  const [taskFilter, setTaskFilter] = useState('pending');
  const [calendarView, setCalendarView] = useState('month');
  const [studySpace, setStudySpace] = useState('timer');
  const [studyRunning, setStudyRunning] = useState(false);
  const [studyDecks, setStudyDecks] = useState(data.studyDecks);
  const drawerX = useMotionValue(-DRAWER_TRAVEL);
  const backdropOpacity = useTransform(drawerX, [-DRAWER_TRAVEL, 0], [0, 0.74]);
  const edgeGesture = useRef(null);

  useEffect(() => {
    animate(drawerX, drawerOpen ? 0 : -DRAWER_TRAVEL, SPRING);
  }, [drawerOpen, drawerX]);

  const settleDrawer = (open) => {
    setDrawerOpen(open);
    animate(drawerX, open ? 0 : -DRAWER_TRAVEL, SPRING);
  };

  const navigate = (view) => {
    if (view === 'cards') {
      setStudySpace('cards');
      setActiveView('study');
    } else {
      if (view === 'study') setStudySpace('timer');
      setActiveView(view);
    }
    settleDrawer(false);
  };

  const handleEdgeDown = (event) => {
    edgeGesture.current = { x: event.clientX, time: performance.now(), pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setEdgeDragging(true);
  };

  const handleEdgeMove = (event) => {
    if (!edgeGesture.current || event.pointerId !== edgeGesture.current.pointerId) return;
    const distance = Math.max(0, event.clientX - edgeGesture.current.x);
    const resisted = distance <= DRAWER_TRAVEL
      ? distance
      : DRAWER_TRAVEL + (distance - DRAWER_TRAVEL) * 0.16;
    drawerX.set(Math.min(0, -DRAWER_TRAVEL + resisted));
  };

  const handleEdgeEnd = (event) => {
    if (!edgeGesture.current) return;
    const distance = Math.max(0, event.clientX - edgeGesture.current.x);
    const elapsed = Math.max(1, performance.now() - edgeGesture.current.time);
    const velocity = distance / elapsed;
    settleDrawer(distance > 78 || velocity > 0.58);
    edgeGesture.current = null;
    setEdgeDragging(false);
  };

  const connectCanvas = () => {
    try {
      localStorage.setItem('bclss_connect_return', 'studenthub');
    } catch {
      // The URL still carries the return target when browser storage is restricted.
    }
    window.location.href = '../index.html?connect=1&returnTo=studenthub#dashboard';
  };

  const toggleAssignmentDone = (assignment) => {
    const nextDone = !assignment.done;
    setAssignments((current) => current.map((item) => (
      item.id === assignment.id && item.source === assignment.source
        ? { ...item, done: nextDone }
        : item
    )));
    updateStoredLocalData((local) => {
      if (assignment.source === 'canvas') {
        local.canvasOverrides = local.canvasOverrides && typeof local.canvasOverrides === 'object'
          ? local.canvasOverrides
          : {};
        local.canvasOverrides[assignment.id] = {
          ...(local.canvasOverrides[assignment.id] || {}),
          done: nextDone,
          updatedAt: new Date().toISOString()
        };
        return;
      }
      local.assignments = (Array.isArray(local.assignments) ? local.assignments : []).map((item) => (
        String(item.id) === String(assignment.id) ? { ...item, done: nextDone } : item
      ));
    });
  };

  const createAssistantDeck = (action) => {
    const cards = (Array.isArray(action.cards) ? action.cards : [])
      .map((card, index) => ({
        id: `${Date.now()}-${index}`,
        front: String(card.front || '').trim().slice(0, 500),
        back: String(card.back || '').trim().slice(0, 1200),
        done: false
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 50);
    if (!cards.length) return;
    const deck = {
      id: action.id || Date.now(),
      title: String(action.title || 'AI study deck').trim().slice(0, 100),
      cards,
      createdAt: action.createdAt || new Date().toISOString(),
      source: 'assistant'
    };
    setStudyDecks((current) => {
      const next = [deck, ...current].slice(0, 30);
      updateStoredLocalData((local) => {
        local.studyDecks = next;
      });
      return next;
    });
    setStudySpace('cards');
    setActiveView('study');
  };

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={[
      'studenthub-shell',
      activeView === 'study' && studyRunning ? 'focus-session-active' : ''
    ].filter(Boolean).join(' ')}>
      <div
        className="edge-swipe-zone"
        onPointerDown={handleEdgeDown}
        onPointerMove={handleEdgeMove}
        onPointerUp={handleEdgeEnd}
        onPointerCancel={handleEdgeEnd}
        aria-hidden="true"
      >
        <motion.span animate={{ opacity: edgeDragging ? 1 : 0.28, scaleY: edgeDragging ? 1.2 : 1 }} />
      </div>

      <SidebarDrawer
        x={drawerX}
        opacity={backdropOpacity}
        open={drawerOpen}
        onOpenChange={settleDrawer}
        activeView={activeView === 'study' && studySpace === 'cards' ? 'cards' : activeView}
        onNavigate={navigate}
      />
      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        data={{ ...data, studyDecks }}
        assignments={assignments}
        onCreateDeck={createAssistantDeck}
      />
      {!assistantOpen && (
        <motion.button
          type="button"
          className="assistant-fab"
          onClick={() => setAssistantOpen(true)}
          aria-label="Open BetterCLSS AI"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING}
        >
          <Glyph name="smile" className="h-6 w-6" />
        </motion.button>
      )}

      <main className="studenthub-main">
        <div className="ambient-grid" />
        <header className="mobile-topbar">
          <BrandLogo className="topbar-logo" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[#7380a5]">{dateLabel}</span>
            <strong className="mt-1 block text-sm font-semibold text-slate-100">BetterCLSS</strong>
          </div>
          <button type="button" className="avatar-button" onClick={() => navigate('settings')} aria-label="Open settings">
            {data.name ? data.name.slice(0, 1).toUpperCase() : 'S'}
            <span />
          </button>
        </header>

        <div className="content-wrap">
          <AnimatePresence mode="wait">
            {activeView === 'home' && (
              <motion.div key="home" className="view-stack" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={SPRING}>
                <header className="dashboard-intro">
                  <span className="eyebrow-mobile">Student overview</span>
                  <h1>{data.name ? `Welcome back, ${data.name.split(' ')[0]}` : 'Your day, clearly.'}</h1>
                  <p>Priorities, deadlines, and focus tools without the noise.</p>
                </header>

                <WorkloadProgress
                  assignments={assignments}
                  overdueCount={overdue.length}
                  announcementCount={data.announcements.length}
                />

                <DeadlineList
                  assignments={assignments}
                  connected={data.connected}
                  onConnect={connectCanvas}
                  onToggleDone={toggleAssignmentDone}
                />
              </motion.div>
            )}
            {activeView === 'tasks' && (
              <TasksView
                key="tasks"
                assignments={assignments}
                filter={taskFilter}
                onFilterChange={setTaskFilter}
                connected={data.connected}
                onConnect={connectCanvas}
                onToggleDone={toggleAssignmentDone}
              />
            )}
            {activeView === 'calendar' && <CalendarView key="calendar" calendarView={calendarView} onViewChange={setCalendarView} assignments={assignments} savedEvents={data.events} />}
            {activeView === 'study' && (
              <StudyView
                key="study"
                activeTab={studySpace}
                onTabChange={setStudySpace}
                onRunningChange={setStudyRunning}
                onCreateDeck={() => setAssistantOpen(true)}
                assignments={assignments}
                savedDecks={studyDecks}
                initialTasks={data.studyTasks}
                initialHistory={data.studyHistory}
                initialNote={data.studyNote}
              />
            )}
            {!PRIMARY_VIEWS.includes(activeView) && (
              <SecondaryView
                key={activeView}
                view={activeView}
                announcements={data.announcements}
                grades={data.grades}
                links={data.links}
                connected={data.connected}
                onConnect={connectCanvas}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

    </div>
  );
}
