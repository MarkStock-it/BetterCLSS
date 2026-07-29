import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform
} from 'motion/react';
import brandLogoUrl from '../../icons/icon-192.png';

const DRAWER_TRAVEL = 360;
const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const TASKS_PER_PAGE = 5;
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
      due: null
    })) : [],
    completed: Array.isArray(deck.cards) ? deck.cards.filter((card) => card.done).length : 0,
    generated: true
  })).filter((deck) => deck.cards.length);
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

function StudyView({ studyMode, onModeChange, onRunningChange, assignments, savedDecks, initialTasks, initialHistory, initialNote }) {
  const decks = useMemo(() => buildCourseDecks(assignments, savedDecks), [assignments, savedDecks]);
  const [deckIndex, setDeckIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState('timer');
  const [activeMode, setActiveMode] = useState('work');
  const [durations, setDurations] = useState(readStudyDurations);
  const [timeLeft, setTimeLeft] = useState(() => readStudyDurations().work * 60);
  const [running, setRunning] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState(() => localStorage.getItem('bclss_study_session_title') || '');
  const [sessionNote, setSessionNote] = useState(initialNote);
  const [studyTasks, setStudyTasks] = useState(initialTasks);
  const [studyHistory, setStudyHistory] = useState(initialHistory);
  const noteReady = useRef(false);

  const totalSeconds = durations[activeMode] * 60;
  const remainingRatio = Math.max(0, Math.min(1, timeLeft / totalSeconds));
  const formattedTime = `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`;
  const durationProfile = Object.entries(STUDY_DURATION_PROFILES).find(([, profile]) => (
    profile.work === durations.work && profile.break === durations.break && profile.long === durations.long
  ))?.[0] || 'Balanced';
  const activeDeck = decks[Math.min(deckIndex, Math.max(0, decks.length - 1))];
  const deckProgress = activeDeck?.cards.length
    ? (activeDeck.completed / activeDeck.cards.length) * 100
    : 0;
  const nextCard = activeDeck?.cards.find((card) => !card.done) || activeDeck?.cards[0];
  const studyStats = useMemo(() => buildStudyStats(studyHistory), [studyHistory]);

  useEffect(() => {
    localStorage.setItem('bclss_study_durations', JSON.stringify(durations));
  }, [durations]);

  useEffect(() => {
    if (sessionTitle) localStorage.setItem('bclss_study_session_title', sessionTitle);
    else localStorage.removeItem('bclss_study_session_title');
  }, [sessionTitle]);

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
    setDeckIndex((current) => Math.min(current, Math.max(0, decks.length - 1)));
  }, [decks.length]);

  useEffect(() => {
    setCardFlipped(false);
  }, [deckIndex, nextCard?.id]);

  useEffect(() => {
    onRunningChange?.(running && studyMode === 'focus');
  }, [onRunningChange, running, studyMode]);

  useEffect(() => () => onRunningChange?.(false), [onRunningChange]);

  useEffect(() => {
    if (studyMode !== 'focus') setRunning(false);
  }, [studyMode]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          if (activeMode === 'work') {
            const now = new Date();
            const entry = {
              id: now.getTime(),
              at: now.toISOString(),
              date: dateKey(now),
              week: weekStartKey(now),
              durationSecs: durations.work * 60,
              tagList: sessionTitle ? [sessionTitle] : [],
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
  }, [running, activeMode, durations.work, sessionNote, sessionTitle]);

  useEffect(() => {
    if (!setupOpen && !settingsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setSetupOpen(false);
      setSettingsOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [setupOpen, settingsOpen]);

  const chooseMode = (mode) => {
    setRunning(false);
    setActiveMode(mode);
    setTimeLeft(durations[mode] * 60);
  };

  const applyDurationProfile = (profileName) => {
    const profile = STUDY_DURATION_PROFILES[profileName] || DEFAULT_STUDY_DURATIONS;
    setDurations(profile);
    if (!running) setTimeLeft(profile[activeMode] * 60);
  };

  const toggleTimer = () => {
    setActiveTab('timer');
    setSetupOpen(false);
    if (timeLeft <= 0) setTimeLeft(totalSeconds);
    setRunning((current) => !current);
  };

  const resetTimer = () => {
    setRunning(false);
    setTimeLeft(totalSeconds);
  };

  const changeDeck = (direction) => {
    if (decks.length < 2) return;
    setDeckIndex((current) => (current + direction + decks.length) % decks.length);
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

  const tabs = [
    ['timer', 'Timer'],
    ['notes', 'Notes'],
    ['tasks', 'Tasks'],
    ['progress', 'Progress']
  ];

  return (
    <motion.section key={`study-${studyMode}`} className={`study-view ${running ? 'timer-running' : ''}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <motion.header className="study-heading study-dimmable" animate={{ opacity: running ? 0.16 : 1, y: running ? -5 : 0 }} transition={SPRING}>
        <div>
          <span className="eyebrow-mobile">Deep work</span>
          <h1>Study</h1>
          <p>{studyMode === 'focus' ? 'One session. Zero noise.' : 'Swipe through decks built from your courses.'}</p>
        </div>
        <button type="button" className="study-settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open study settings">
          <Glyph name="settings" className="h-5 w-5" />
        </button>
      </motion.header>

      <motion.div className="study-mode-picker study-dimmable" animate={{ opacity: running ? 0.12 : 1 }} transition={SPRING}>
        <ViewModeTabs
          label="Study modes"
          value={studyMode}
          onChange={onModeChange}
          options={[
            { value: 'focus', label: 'Focus' },
            { value: 'cards', label: 'Cards' }
          ]}
        />
      </motion.div>

      {studyMode === 'focus' && (
        <motion.div className="study-tabs study-dimmable" role="tablist" aria-label="Study area" initial={{ opacity: 0, y: -6 }} animate={{ opacity: running ? 0.12 : 1, y: 0 }} transition={SPRING}>
          {tabs.map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? 'active' : ''}
              key={id}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </motion.div>
      )}

      {studyMode === 'focus' ? (
        <AnimatePresence mode="wait">
          {activeTab === 'timer' && (
            <motion.div className="timer-workspace" key="study-timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <motion.button
                type="button"
                className="session-setup-summary study-dimmable"
                onClick={() => setSetupOpen(true)}
                animate={{ opacity: running ? 0.1 : 1, scale: running ? 0.97 : 1 }}
                transition={SPRING}
                aria-label="Open session setup"
              >
                <span className="session-summary-icon"><Glyph name="tag" className="h-4 w-4" /></span>
                <span>
                  <strong>{sessionTitle || 'Focus session'}</strong>
                  <small>{durations.work} minute focus</small>
                </span>
                <Glyph name="chevron" className="ml-auto h-4 w-4 -rotate-90" />
              </motion.button>

              <motion.div className="timer-mode-switch study-dimmable" animate={{ opacity: running ? 0.12 : 1 }} transition={SPRING}>
                {[
                  ['work', 'Work'],
                  ['break', 'Break'],
                  ['long', 'Long break']
                ].map(([id, label]) => (
                  <button type="button" className={activeMode === id ? 'active' : ''} onClick={() => chooseMode(id)} key={id}>
                    {label}
                  </button>
                ))}
              </motion.div>

              <div className="timer-hero" aria-live="polite" aria-label={`${formattedTime} remaining`}>
                <div className={`timer-aura ${running ? 'active' : ''}`} />
                <svg className="timer-ring-svg" viewBox="0 0 320 320" aria-hidden="true">
                  <defs>
                    <linearGradient id="focus-ring-gradient" x1="38" y1="42" x2="280" y2="286" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#9d6cff" />
                      <stop offset=".52" stopColor="#718cff" />
                      <stop offset="1" stopColor="#43dec0" />
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
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                  <motion.circle
                    className="timer-ring-progress"
                    cx="160"
                    cy="160"
                    r="135"
                    pathLength="1"
                    initial={false}
                    animate={{ pathLength: remainingRatio }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                </svg>
                <motion.div className="timer-readout" animate={{ scale: running ? 1.02 : 1 }} transition={SPRING}>
                  <span>{running ? 'In focus' : activeMode === 'work' ? 'Ready' : 'Recovery'}</span>
                  <strong>{formattedTime}</strong>
                  <small>{activeMode === 'long' ? 'Long break' : activeMode}</small>
                </motion.div>
              </div>

              <div className="timer-controls">
                <motion.button type="button" className="timer-primary-control" onClick={toggleTimer} whileTap={{ scale: 0.96 }}>
                  <Glyph name={running ? 'pause' : 'play'} className="h-5 w-5" />
                  {running ? 'Pause' : timeLeft === totalSeconds ? 'Start' : 'Resume'}
                </motion.button>
                <motion.button type="button" className="timer-reset-control" onClick={resetTimer} whileTap={{ scale: 0.94 }} aria-label="Reset timer">
                  <Glyph name="reset" className="h-5 w-5" />
                </motion.button>
              </div>

            </motion.div>
          )}

          {activeTab === 'notes' && (
            <motion.section className="study-secondary-panel" key="study-notes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
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
            <motion.section className="study-secondary-panel" key="study-tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
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
            <motion.section className="study-secondary-panel" key="study-progress" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
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
        </AnimatePresence>
      ) : (
        <section className="deck-carousel" aria-label="Course decks">
          {activeDeck ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={activeDeck.id}
                className="study-deck-card"
                initial={{ opacity: 0, x: 28, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -28, scale: 0.97 }}
                transition={SPRING}
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -55 || info.velocity.x < -450) changeDeck(1);
                  if (info.offset.x > 55 || info.velocity.x > 450) changeDeck(-1);
                }}
              >
                <div className="deck-orbit"><Glyph name="study" className="h-8 w-8" /></div>
                <span className="eyebrow-mobile">Course deck</span>
                <h2>{activeDeck.title}</h2>
                <p>{activeDeck.cards.length} items · {activeDeck.cards.length - activeDeck.completed} pending</p>
                {nextCard && (
                  nextCard.answer ? (
                    <button
                      type="button"
                      className={`deck-next-card generated-card-content ${cardFlipped ? 'flipped' : ''}`}
                      onClick={() => setCardFlipped((current) => !current)}
                    >
                      <span>{cardFlipped ? 'Answer' : 'Question'}</span>
                      <strong>{cardFlipped ? nextCard.answer : nextCard.title}</strong>
                      <small>Tap to {cardFlipped ? 'show question' : 'reveal answer'}</small>
                    </button>
                  ) : (
                    <div className="deck-next-card">
                      <span>Next item</span>
                      <strong>{nextCard.title}</strong>
                      <small>{nextCard.due || 'No due date'}</small>
                    </div>
                  )
                )}
                <div className="deck-progress">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${deckProgress}%` }} transition={{ ...SPRING, delay: 0.12 }} />
                </div>
              </motion.article>
            </AnimatePresence>
          ) : (
            <div className="study-deck-card deck-empty">
              <div className="deck-orbit"><Glyph name="study" className="h-8 w-8" /></div>
              <h2>No course decks yet</h2>
              <p>Connect or sync Canvas to build decks from your coursework.</p>
            </div>
          )}
          {decks.length > 1 && (
            <div className="deck-navigation">
              <button type="button" onClick={() => changeDeck(-1)} aria-label="Previous course deck">
                <Glyph name="chevron" className="h-4 w-4 rotate-90" />
              </button>
              <div className="deck-dots" aria-label={`Deck ${deckIndex + 1} of ${decks.length}`}>
                {decks.map((deck, index) => (
                  <button type="button" className={index === deckIndex ? 'active' : ''} onClick={() => setDeckIndex(index)} aria-label={`Open ${deck.title} deck`} key={deck.id} />
                ))}
              </div>
              <button type="button" onClick={() => changeDeck(1)} aria-label="Next course deck">
                <Glyph name="chevron" className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          )}
        </section>
      )}

      <StudySheet
        open={setupOpen}
        title="Session setup"
        detail="Name what you’re working on."
        onClose={() => setSetupOpen(false)}
      >
        <div className="sheet-field">
          <label htmlFor="study-session-title">Session title</label>
          <input id="study-session-title" value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} />
        </div>
        <button type="button" className="sheet-done-button" onClick={() => setSetupOpen(false)}>Save session</button>
      </StudySheet>

      <StudySheet
        open={settingsOpen}
        title="Timer settings"
        detail="Choose one timer rhythm."
        onClose={() => setSettingsOpen(false)}
      >
        <label className="timer-profile-select">
          <span>Session length</span>
          <select value={durationProfile} onChange={(event) => applyDurationProfile(event.target.value)}>
            <option value="Quick">Quick · 15 / 5 / 10 min</option>
            <option value="Balanced">Balanced · 25 / 5 / 15 min</option>
            <option value="Deep">Deep · 50 / 10 / 20 min</option>
          </select>
        </label>
        <button type="button" className="sheet-done-button" onClick={() => setSettingsOpen(false)}>Done</button>
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
                <h2>Personal AI API key</h2>
                <p>Stored only in this browser’s local cache and sent directly to the BetterCLSS AI backend.</p>
              </div>
            </div>
            <label htmlFor="studenthub-ai-api-key">AI API key</label>
            <input
              id="studenthub-ai-api-key"
              type="password"
              value={aiApiKey}
              onChange={(event) => {
                setAiApiKey(event.target.value);
                setAiKeyStatus('');
              }}
              placeholder="Paste your API key"
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
  const { pending, overdue, submitted } = useMemo(() => {
    const nextPending = assignments.filter((item) => !item.done);
    return {
      pending: nextPending,
      overdue: nextPending.filter((item) => {
        const days = daysUntil(item.due);
        return days !== null && days < 0;
      }),
      submitted: assignments.filter((item) => item.done)
    };
  }, [assignments]);

  const [activeView, setActiveView] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [edgeDragging, setEdgeDragging] = useState(false);
  const [taskFilter, setTaskFilter] = useState('pending');
  const [calendarView, setCalendarView] = useState('month');
  const [studyMode, setStudyMode] = useState('focus');
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
    setStudyMode('cards');
    setActiveView('study');
  };

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={[
      'studenthub-shell',
      activeView === 'study' && studyRunning ? 'focus-session-active' : '',
      activeView === 'study' && studyMode === 'cards' ? 'cards-screen' : ''
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
        activeView={activeView}
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

                <section>
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <span className="eyebrow-mobile">At a glance</span>
                      <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-white">Today’s workload</h2>
                    </div>
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
                studyMode={studyMode}
                onModeChange={setStudyMode}
                onRunningChange={setStudyRunning}
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
