import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform
} from 'motion/react';

const DRAWER_TRAVEL = 360;
const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };

const PRIMARY_VIEWS = ['home', 'tasks', 'calendar', 'study'];

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home', section: 'Main' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', section: 'Main' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', section: 'Main' },
  { id: 'study', label: 'Study', icon: 'study', section: 'Main' },
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
    grades: <><path d="M4 20V10M10 20V4M16 20v-7M2 20h20" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M14 21h-4" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
    arrow: <><path d="m9 18 6-6-6-6" /></>,
    sync: <><path d="M20 7h-5V2" /><path d="M4 17h5v5" /><path d="M5.5 9a8 8 0 0 1 13-3L20 7M4 17l1.5 1A8 8 0 0 0 18.5 15" /></>,
    spark: <><path d="m4 15 4-4 4 3 7-8" /><path d="M15 6h4v4" /></>,
    chevron: <><path d="m6 9 6 6 6-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.home}
    </svg>
  );
}

function readDashboardData() {
  const fallback = {
    assignments: [],
    announcements: [],
    connected: false,
    name: ''
  };

  try {
    const local = JSON.parse(localStorage.getItem('bclss_local') || '{}');
    const canvas = JSON.parse(localStorage.getItem('bclss_canvas_cache') || '{}');
    const localAssignments = Array.isArray(local.assignments) ? local.assignments : [];
    const canvasAssignments = Array.isArray(canvas.assignments)
      ? canvas.assignments.map((item) => {
        const state = String(item.submissionState || '').toLowerCase();
        const done = Boolean(
          item.graded
          || item.submitted
          || item.submittedAt
          || ['submitted', 'graded', 'pending_review', 'complete'].includes(state)
        );
        const due = item.dueAt ? String(item.dueAt).split('T')[0] : null;
        const remaining = daysUntil(due);
        return {
          id: item.id,
          title: item.title,
          subject: item.courseName || item.courseCode || 'Canvas',
          due,
          done,
          priority: remaining !== null && remaining <= 1 ? 'high' : remaining !== null && remaining <= 3 ? 'medium' : 'low'
        };
      })
      : [];
    return {
      assignments: [...canvasAssignments, ...localAssignments],
      announcements: [
        ...(Array.isArray(canvas.announcements) ? canvas.announcements : []),
        ...(Array.isArray(local.announcements) ? local.announcements : [])
      ],
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

function StatCard({ label, value, detail, tone, icon, index }) {
  return (
    <motion.article
      className={`stat-card-mobile stat-${tone}`}
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, delay: index * 0.055 }}
      whileTap={{ scale: 0.975 }}
    >
      <div className="flex items-start justify-between">
        <span className="stat-icon"><Glyph name={icon} className="h-[18px] w-[18px]" /></span>
        <span className="stat-glow" />
      </div>
      <div className="mt-5">
        <div className="text-[1.9rem] font-extrabold leading-none tracking-[-0.055em] text-white">{value}</div>
        <div className="mt-3 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-slate-300">{label}</div>
        <div className="mt-1 text-[0.68rem] text-slate-500">{detail}</div>
      </div>
    </motion.article>
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

function CanvasBanner({ connected, onConnect }) {
  const [collapsed, setCollapsed] = useState(() => (
    connected || localStorage.getItem('bclss_mobile_canvas_collapsed') === '1'
  ));

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('bclss_mobile_canvas_collapsed', next ? '1' : '0');
  };

  if (collapsed) {
    return (
      <motion.button
        type="button"
        layout
        className="canvas-collapsed"
        onClick={toggle}
        whileTap={{ scale: 0.985 }}
      >
        <span className={`status-pulse ${connected ? 'connected' : ''}`} />
        <span>{connected ? 'Canvas connected' : 'Connect Canvas for live coursework'}</span>
        <Glyph name="chevron" className="ml-auto h-4 w-4 -rotate-90 text-slate-500" />
      </motion.button>
    );
  }

  return (
    <motion.section
      layout
      className="canvas-hero"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="canvas-orb"><Glyph name="sync" className="h-6 w-6" /></div>
      <button type="button" onClick={toggle} className="canvas-collapse-button" aria-label="Collapse Canvas banner">
        <Glyph name="chevron" className="h-4 w-4" />
      </button>
      <div className="relative z-10 mt-5">
        <span className="eyebrow-mobile">{connected ? 'Live connection' : 'One-minute setup'}</span>
        <h2>{connected ? 'Canvas is keeping you current' : 'See the work that matters next'}</h2>
        <p>{connected ? 'Assignments and course updates are ready to sync.' : 'Connect once to pull deadlines, grades, and announcements into StudentHub.'}</p>
        <button type="button" className="canvas-action" onClick={onConnect}>
          {connected ? 'Sync Canvas' : 'Connect Canvas'}
          <Glyph name="arrow" className="h-4 w-4" />
        </button>
      </div>
    </motion.section>
  );
}

function DeadlineList({ assignments, connected, onConnect }) {
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
        <div className="mt-4 space-y-3">
          {upcoming.map((item, index) => {
            const days = daysUntil(item.due);
            const dueText = days === null ? 'No due date' : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
            return (
              <motion.article
                key={item.id || `${item.title}-${index}`}
                className="deadline-row"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: index * 0.05 }}
              >
                <span className={`priority-rail ${item.priority || 'medium'}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-100">{item.title || 'Untitled assignment'}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.subject || 'Course'}</p>
                </div>
                <span className={`due-pill ${days !== null && days < 0 ? 'overdue' : ''}`}>{dueText}</span>
              </motion.article>
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
              <span className="brand-mark"><Glyph name="study" className="h-5 w-5" /></span>
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

          <div className="drawer-tip">
            <span className="gesture-line" />
            <div>
              <strong>Gesture tip</strong>
              <p>Drag this panel left to close it.</p>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function LongPressTab({ id, label, icon, active, options = [], menuAlign = 'center', onTap, onSelect }) {
  const timer = useRef(null);
  const start = useRef({ x: 0, y: 0 });
  const menuOpen = useRef(false);
  const selectedRef = useRef(0);
  const [showMenu, setShowMenu] = useState(false);
  const [selected, setSelected] = useState(0);

  const clearPress = () => {
    window.clearTimeout(timer.current);
    timer.current = null;
  };

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY };
    menuOpen.current = false;
    selectedRef.current = 0;
    setSelected(0);
    clearPress();
    if (options.length) {
      timer.current = window.setTimeout(() => {
        menuOpen.current = true;
        setShowMenu(true);
        navigator.vibrate?.(12);
      }, 380);
    }
  };

  const handlePointerMove = (event) => {
    const horizontal = Math.abs(event.clientX - start.current.x);
    const vertical = start.current.y - event.clientY;
    if (!menuOpen.current) {
      if (horizontal > 14 || Math.abs(vertical) > 14) clearPress();
      return;
    }
    const nextIndex = Math.max(0, Math.min(options.length - 1, Math.floor(Math.max(0, vertical - 25) / 48)));
    selectedRef.current = nextIndex;
    setSelected(nextIndex);
  };

  const finishPress = () => {
    const wasMenu = menuOpen.current;
    clearPress();
    if (wasMenu) {
      onSelect?.(options[selectedRef.current]);
      navigator.vibrate?.(8);
    } else {
      onTap();
    }
    menuOpen.current = false;
    setShowMenu(false);
  };

  return (
    <button
      type="button"
      className={`launchpad-tab ${active ? 'active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPress}
      onPointerCancel={() => {
        clearPress();
        menuOpen.current = false;
        setShowMenu(false);
      }}
      aria-label={options.length ? `${label}. Hold and slide for quick options.` : label}
    >
      <AnimatePresence>
        {showMenu && (
          <motion.div
            className={`quick-menu align-${menuAlign}`}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={SPRING}
          >
            <div className="quick-menu-label">Slide to choose</div>
            <div className="flex flex-col-reverse gap-1.5">
              {options.map((option, index) => (
                <motion.div
                  key={option.value}
                  className={`quick-option ${selected === index ? 'selected' : ''}`}
                  animate={{ x: selected === index ? -5 : 0 }}
                  transition={SPRING}
                >
                  <span>{option.label}</span>
                  {selected === index && <span className="quick-option-dot" />}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {active && <motion.span layoutId="launchpad-active" className="launchpad-active-bg" transition={SPRING} />}
      <span className="relative z-10"><Glyph name={icon} className="h-[21px] w-[21px]" /></span>
      <span className="relative z-10 text-[0.64rem] font-semibold">{label}</span>
      {options.length > 0 && <span className="hold-indicator" />}
    </button>
  );
}

function BottomLaunchpad({ activeView, onNavigate, onGestureChoice }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: 'tasks',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'overdue', label: 'Overdue' },
        { value: 'submitted', label: 'Submitted' }
      ]
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: 'calendar',
      options: [
        { value: 'month', label: 'Month' },
        { value: 'agenda', label: 'Agenda' },
        { value: 'week', label: 'Week' },
        { value: 'day', label: 'Day' }
      ]
    },
    {
      id: 'study',
      label: 'Study',
      icon: 'study',
      align: 'right',
      options: [
        { value: 'focus', label: 'Focus timer' },
        { value: 'flashcards', label: 'Flashcards' },
        { value: 'database', label: 'Databases' },
        { value: 'algorithms', label: 'Algorithms' }
      ]
    }
  ];

  return (
    <div className="launchpad-wrap">
      <nav className="launchpad" aria-label="Primary navigation">
        {tabs.map((tab) => (
          <LongPressTab
            key={tab.id}
            {...tab}
            menuAlign={tab.align || 'center'}
            active={activeView === tab.id}
            onTap={() => onNavigate(tab.id)}
            onSelect={(option) => onGestureChoice(tab.id, option)}
          />
        ))}
      </nav>
      <div className="safe-area-fill" />
    </div>
  );
}

function TasksView({ assignments, filter, connected, onConnect }) {
  const visible = smartSort(assignments).filter((item) => {
    const days = daysUntil(item.due);
    if (filter === 'overdue') return !item.done && days !== null && days < 0;
    if (filter === 'submitted') return item.done;
    return !item.done;
  });

  return (
    <motion.section key={`tasks-${filter}`} className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Coursework" title="Tasks" detail={`${filter[0].toUpperCase()}${filter.slice(1)} assignments`} />
      <div className="gesture-context"><span className="gesture-context-dot" />Hold Tasks in the launchpad and slide to change this filter.</div>
      <section className="section-card">
        {visible.length ? visible.map((item, index) => (
          <div className="deadline-row mb-3 last:mb-0" key={item.id || index}>
            <span className={`priority-rail ${item.priority || 'medium'}`} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{item.subject || 'Course'} · {item.due || 'No due date'}</p>
            </div>
          </div>
        )) : <EmptyDeadlines connected={connected} onConnect={onConnect} />}
      </section>
    </motion.section>
  );
}

function CalendarView({ calendarView, assignments }) {
  const days = Array.from({ length: 35 }, (_, index) => index < 3 ? 27 + index : index - 2);
  const upcoming = smartSort(assignments).filter((item) => !item.done).slice(0, 4);
  const fallbackEvents = [
    { title: 'Review course notes', subject: 'Study block', due: 'Today · 4:00 PM' },
    { title: 'Plan tomorrow', subject: 'Personal', due: 'Today · 7:30 PM' }
  ];
  const events = upcoming.length ? upcoming : fallbackEvents;

  return (
    <motion.section key={`calendar-${calendarView}`} className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Schedule" title="Calendar" detail={`${calendarView[0].toUpperCase()}${calendarView.slice(1)} view`} />
      <div className="gesture-context"><span className="gesture-context-dot" />Hold Calendar and slide upward to jump between views.</div>
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
              {events.map((event, index) => (
                <article className="agenda-event" key={event.id || `${event.title}-${index}`}>
                  <span className={`agenda-dot ${index === 0 ? 'urgent' : ''}`} />
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.subject || 'Course'} · {event.due || 'No due date'}</p>
                  </div>
                </article>
              ))}
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
                  {index === 1 && <article><strong>{events[0]?.title}</strong><small>{events[0]?.subject || 'Coursework'}</small></article>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.section>
  );
}

function StudyView({ studyMode }) {
  const decks = {
    flashcards: ['Recently studied', '12 cards due', '78% recall'],
    database: ['Database Systems', '28 cards', 'Normalization · SQL'],
    algorithms: ['Algorithms', '34 cards', 'Graphs · Complexity']
  };
  const activeDeck = decks[studyMode];

  return (
    <motion.section key={`study-${studyMode}`} className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Deep work" title="Study" detail={studyMode === 'focus' ? 'Focus timer ready' : `${studyMode[0].toUpperCase()}${studyMode.slice(1)} selected`} />
      <div className="gesture-context"><span className="gesture-context-dot" />Hold Study and slide to peek at subjects, decks, or the timer.</div>
      {studyMode === 'focus' ? (
        <section className="focus-card">
          <div className="focus-orbit">
            <motion.div className="focus-ring" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} />
            <div>
              <strong>25:00</strong>
              <span>Focus</span>
            </div>
          </div>
          <button type="button" className="focus-start">Start session</button>
        </section>
      ) : (
        <motion.section className="study-deck-card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING}>
          <div className="deck-orbit"><Glyph name="study" className="h-8 w-8" /></div>
          <span className="eyebrow-mobile">Quick deck</span>
          <h2>{activeDeck?.[0]}</h2>
          <p>{activeDeck?.[1]} · {activeDeck?.[2]}</p>
          <div className="deck-progress"><motion.span initial={{ width: 0 }} animate={{ width: studyMode === 'flashcards' ? '78%' : '46%' }} transition={{ ...SPRING, delay: 0.12 }} /></div>
          <button type="button" className="focus-start">Open deck</button>
        </motion.section>
      )}
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

function SecondaryView({ view, announcements, connected, onConnect }) {
  const [title, detail] = VIEW_COPY[view] || ['StudentHub', 'Choose a destination from the navigation drawer.'];
  const panels = {
    grades: [
      ['Course progress', 'Grade details arrive with your next Canvas sync.', 'grades'],
      ['What-if scores', 'Open the full BetterCLSS workspace to model upcoming assignments.', 'spark']
    ],
    announcements: announcements.length
      ? announcements.slice(0, 4).map((item) => [
        item.title || 'Course announcement',
        item.message || item.courseName || 'Open Canvas for the full update.',
        'bell'
      ])
      : [['All caught up', 'New instructor updates will collect here after a Canvas sync.', 'bell']],
    resources: [
      ['Canvas courses', 'Assignments, modules, and course links in one place.', 'link'],
      ['Study workspace', 'Jump into flashcards or a focus session from the launchpad.', 'study']
    ],
    settings: [
      ['Canvas connection', connected ? 'Connected and ready to sync.' : 'Connect Canvas to populate StudentHub.', 'sync'],
      ['Gesture controls', 'Edge swipe and hold-to-slide shortcuts are enabled.', 'settings']
    ]
  };

  return (
    <motion.section className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="StudentHub" title={title} detail={detail} />
      <section className="section-card secondary-list">
        {(panels[view] || []).map(([panelTitle, panelDetail, icon], index) => (
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
  const assignments = data.assignments;
  const pending = assignments.filter((item) => !item.done);
  const overdue = pending.filter((item) => {
    const days = daysUntil(item.due);
    return days !== null && days < 0;
  });
  const submitted = assignments.filter((item) => item.done);

  const [activeView, setActiveView] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edgeDragging, setEdgeDragging] = useState(false);
  const [taskFilter, setTaskFilter] = useState('pending');
  const [calendarView, setCalendarView] = useState('month');
  const [studyMode, setStudyMode] = useState('focus');
  const [gestureNotice, setGestureNotice] = useState('');
  const drawerX = useMotionValue(-DRAWER_TRAVEL);
  const backdropOpacity = useTransform(drawerX, [-DRAWER_TRAVEL, 0], [0, 0.74]);
  const edgeGesture = useRef(null);

  useEffect(() => {
    animate(drawerX, drawerOpen ? 0 : -DRAWER_TRAVEL, SPRING);
  }, [drawerOpen, drawerX]);

  useEffect(() => {
    if (!gestureNotice) return undefined;
    const timeout = window.setTimeout(() => setGestureNotice(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [gestureNotice]);

  const settleDrawer = (open) => {
    setDrawerOpen(open);
    animate(drawerX, open ? 0 : -DRAWER_TRAVEL, SPRING);
  };

  const navigate = (view) => {
    setActiveView(view);
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

  const handleGestureChoice = (tab, option) => {
    if (!option) return;
    setActiveView(tab);
    if (tab === 'tasks') setTaskFilter(option.value);
    if (tab === 'calendar') setCalendarView(option.value);
    if (tab === 'study') setStudyMode(option.value);
    setGestureNotice(`${option.label} selected`);
  };

  const connectCanvas = () => {
    window.location.href = '../index.html?connect=1#dashboard';
  };

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="studenthub-shell">
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
        open={drawerOpen || edgeDragging}
        onOpenChange={settleDrawer}
        activeView={activeView}
        onNavigate={navigate}
      />

      <main className="studenthub-main">
        <div className="ambient-grid" />
        <header className="mobile-topbar">
          <button type="button" className="menu-button" onClick={() => settleDrawer(true)} aria-label="Open navigation">
            <Glyph name="menu" className="h-5 w-5" />
          </button>
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

                <CanvasBanner connected={data.connected} onConnect={connectCanvas} />

                <section>
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <span className="eyebrow-mobile">At a glance</span>
                      <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-white">Today’s workload</h2>
                    </div>
                    <span className="gesture-hint">Swipe edge for menu</span>
                  </div>
                  <div className="stats-grid-mobile">
                    <StatCard index={0} label="Pending" value={pending.length} detail="assignments" tone="blue" icon="tasks" />
                    <StatCard index={1} label="Overdue" value={overdue.length} detail="need attention" tone="red" icon="bell" />
                    <StatCard index={2} label="Submitted" value={submitted.length} detail="completed" tone="green" icon="spark" />
                    <StatCard index={3} label="Announcements" value={data.announcements.length} detail="course updates" tone="violet" icon="bell" />
                  </div>
                </section>

                <DeadlineList assignments={assignments} connected={data.connected} onConnect={connectCanvas} />
              </motion.div>
            )}
            {activeView === 'tasks' && <TasksView key="tasks" assignments={assignments} filter={taskFilter} connected={data.connected} onConnect={connectCanvas} />}
            {activeView === 'calendar' && <CalendarView key="calendar" calendarView={calendarView} assignments={assignments} />}
            {activeView === 'study' && <StudyView key="study" studyMode={studyMode} />}
            {!PRIMARY_VIEWS.includes(activeView) && (
              <SecondaryView
                key={activeView}
                view={activeView}
                announcements={data.announcements}
                connected={data.connected}
                onConnect={connectCanvas}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {gestureNotice && (
          <motion.div className="gesture-toast" initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={SPRING}>
            <span />
            {gestureNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <BottomLaunchpad activeView={activeView} onNavigate={navigate} onGestureChoice={handleGestureChoice} />
    </div>
  );
}
