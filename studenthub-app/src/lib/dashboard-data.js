const LEGACY_SEEDED_LINKS = new Set([
  'https://usc.instructure.com',
  'https://mail.usc.edu',
  'https://drive.google.com',
]);

export function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due - today) / 86400000);
}

export function readDashboardData() {
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
    name: '',
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
          priority: remaining !== null && remaining <= 1
            ? 'high'
            : remaining !== null && remaining <= 3
              ? 'medium'
              : 'low',
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
        ...localAssignments.map((item) => ({ ...item, source: item.source || 'local' })),
      ],
      announcements: [
        ...(Array.isArray(canvas.announcements) ? canvas.announcements : []),
        ...(Array.isArray(local.announcements) ? local.announcements : []),
      ],
      events: Array.isArray(local.events) ? local.events : [],
      grades: [
        ...(Array.isArray(canvas.grades) ? canvas.grades : []),
        ...(Array.isArray(local.grades) ? local.grades : []),
      ],
      links,
      studyTasks: Array.isArray(local.studyTasks) ? local.studyTasks : [],
      studyHistory: Array.isArray(local.studyHistory) ? local.studyHistory : [],
      studyDecks: Array.isArray(local.studyDecks) ? local.studyDecks : [],
      studyNote: local.studyCurrentNote && typeof local.studyCurrentNote.content === 'string'
        ? local.studyCurrentNote.content
        : '',
      connected: Boolean(localStorage.getItem('bclss_canvas_token')),
      name: localStorage.getItem('bclss_student_name') || '',
    };
  } catch {
    return fallback;
  }
}

export function updateStoredLocalData(updater) {
  try {
    const local = JSON.parse(localStorage.getItem('bclss_local') || '{}');
    const safeLocal = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
    updater(safeLocal);
    localStorage.setItem('bclss_local', JSON.stringify(safeLocal));
  } catch {
    // Keep the in-memory StudentHub state usable when browser storage is unavailable.
  }
}

export function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function weekStartKey(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
  return dateKey(start);
}

export function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatTimerValue(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function buildStudyStats(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  const currentWeek = weekStartKey();
  const weekEntries = safeHistory.filter((entry) => (
    entry.week === currentWeek || (entry.date && entry.date >= currentWeek)
  ));
  const focusedSeconds = weekEntries.reduce(
    (total, entry) => total + (Number(entry.durationSecs) || 0),
    0
  );
  const studiedDays = [...new Set(safeHistory.map((entry) => entry.date).filter(Boolean))].sort();
  let streak = 0;
  let longestStreak = 0;
  let previous = null;
  studiedDays.forEach((day) => {
    streak = previous && ((new Date(day) - new Date(previous)) / 86400000 === 1) ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = day;
  });
  return { sessions: weekEntries.length, focusedSeconds, longestStreak };
}

export function smartSort(assignments) {
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
  return [...assignments].sort((left, right) => (
    bucket(left) - bucket(right)
    || (priority[left.priority] ?? 3) - (priority[right.priority] ?? 3)
    || String(left.due || '9999').localeCompare(String(right.due || '9999'))
    || String(left.title || '').localeCompare(String(right.title || ''))
  ));
}

export function buildCourseDecks(assignments, savedDecks = []) {
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
      generated: false,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const generatedDecks = savedDecks.map((deck) => ({
    id: `ai-${deck.id}`,
    title: deck.title,
    cards: Array.isArray(deck.cards)
      ? deck.cards.map((card, index) => ({
        id: card.id || `${deck.id}-${index}`,
        title: card.front,
        answer: card.back,
        done: Boolean(card.done),
        due: card.due || null,
      }))
      : [],
    completed: Array.isArray(deck.cards) ? deck.cards.filter((card) => card.done).length : 0,
    dueToday: Array.isArray(deck.cards) ? deck.cards.filter((card) => !card.done).length : 0,
    generated: true,
  }));
  return [...generatedDecks, ...courseDecks];
}
