function renderAll() {
  updateConnectionStatus();
  updateBadges();
  renderSidebar();
  const active = (document.querySelector('.page.active') || {}).id || 'page-dashboard';
  renderPage(active.replace('page-', ''));
}

function updateBadges() {
  const all = allAssignments();
  const pending = all.filter(a => !a.done).length;
  const overdue = all.filter(a => !a.done && dueDays(a.due) !== null && dueDays(a.due) < 0).length;
  const done = all.filter(a => a.done).length;
  const ann = APP.canvas.announcements.length + APP.local.announcements.length;
  document.getElementById('badgePending').textContent = pending;
  const mobilePendingBadge = document.getElementById('badgePendingMobile');
  mobilePendingBadge.textContent = pending > 99 ? '99+' : pending;
  mobilePendingBadge.classList.toggle('empty', pending === 0);
  document.getElementById('badgeAnnounce').textContent = ann;
}  function renderSidebar() {
  const sidebarCourses = document.getElementById('sidebarCourses');
  if (sidebarCourses) {
    const courses = [...APP.canvas.courses].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    const count = courses.length;
    if (!count) {
      sidebarCourses.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted)">Not connected</div>';
    } else {
      // Smart sidebar: show the courses with the most current work first,
      // cap the list, and collapse the rest behind a "View all" toggle.
      const pendingBySubject = {};
      allAssignments().forEach(a => { if (!a.done && a.subject) pendingBySubject[a.subject] = (pendingBySubject[a.subject] || 0) + 1; });
      const ranked = courses
        .map(c => ({ ...c, pending: pendingBySubject[c.name] || 0 }))
        .sort((a, b) => b.pending - a.pending || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
      const SHOW = 5;
      const expanded = localStorage.getItem('bclss_courses_expanded') === '1';
      const visible = expanded ? ranked : ranked.slice(0, SHOW);
      const courseCode = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).join(' ') || 'Course';
      const row = (c) => '<div class="sidebar-course' + (c.pending ? ' has-work' : '') + '"><span class="sidebar-course-code">' + esc(courseCode(c.name)) + '</span><span class="sidebar-course-name">' + esc(c.name) + '</span>' + (c.pending ? '<span class="sidebar-course-count">' + c.pending + '</span>' : '') + '</div>';
      let html = visible.map(row).join('');
      if (count > SHOW) {
        html += '<button class="sidebar-courses-more" onclick="toggleSidebarCoursesExpanded()">' + (expanded ? '− Show fewer' : '+ View all ' + count) + '</button>';
      }
      sidebarCourses.innerHTML = html;
    }
  }
}

function updateDashboardWelcome() {
  const greeting = document.getElementById('dashboardGreeting');
  const date = document.getElementById('dashboardDate');
  if (!greeting || !date) return;

  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const user = UserAuth.getCurrentUser();
  const firstName = String(user.name || '').trim().split(/\s+/)[0];
  greeting.textContent = firstName ? `${salutation}, ${firstName}` : 'Your dashboard';
  date.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

// ─── Dashboard: focused student workspace ─────────────────────────
// Hierarchy: (1) what needs attention now, (2) next up, (3) week +
// standing, (4) tools. Sections are open (no nested cards) and use
// typography + whitespace for hierarchy instead of borders.

function attentionItems(all) {
  const items = [];
  all
    .filter(a => !a.done && dueDays(a.due) !== null && dueDays(a.due) < 0)
    .sort((a, b) => dueDays(a.due) - dueDays(b.due))
    .slice(0, 3)
    .forEach(a => items.push({ kind: 'overdue', a }));
  all
    .filter(a => !a.done && (dueDays(a.due) === 0 || dueDays(a.due) === 1))
    .slice(0, 3)
    .forEach(a => items.push({ kind: dueDays(a.due) === 0 ? 'today' : 'tomorrow', a }));
  allAnnouncements()
    .filter(x => announcementTier(x) === 'urgent')
    .slice(0, 1)
    .forEach(x => items.push({ kind: 'news', a: x }));
  return items;
}

function attentionRow(item) {
  const a = item.a;
  const externalUrl = safeExternalUrl(a.canvasUrl || a.url);
  const open = externalUrl ? '<a class="dash-item-open" target="_blank" rel="noopener noreferrer" href="' + esc(externalUrl) + '">Open</a>' : '';
  let note;
  if (item.kind === 'overdue') note = 'Overdue by ' + Math.abs(dueDays(a.due)) + 'd · ' + esc(a.subject);
  else if (item.kind === 'today') note = 'Due today · ' + esc(a.subject);
  else if (item.kind === 'tomorrow') note = 'Due tomorrow · ' + esc(a.subject);
  else note = 'Posted in ' + esc(a.courseName || 'a course');
  const cls = item.kind === 'news' ? 'news' : (item.kind === 'overdue' ? 'overdue' : 'due');
  return '<div class="dash-attention-item ' + cls + '"><div class="dash-attention-info"><span class="dash-item-title">' + esc(a.title) + '</span><span class="dash-item-note">' + note + '</span></div>' + open + '</div>';
}

function renderAttention() {
  const el = document.getElementById('dashAttention');
  const head = document.getElementById('dashAttentionHead');
  if (!el) return;
  const items = attentionItems(allAssignments());
  if (!items.length) {
    if (head) head.textContent = 'Nothing urgent';
    el.innerHTML = '<div class="dash-calm">You are caught up. Deadlines and urgent posts will surface here.</div>';
    return;
  }
  if (head) head.textContent = items.length === 1 ? '1 thing needs your attention' : items.length + ' things need your attention';
  el.innerHTML = items.map(attentionRow).join('');
}

function renderNextUp() {
  const el = document.getElementById('dashNext');
  if (!el) return;
  const upcoming = allAssignments()
    .filter(a => !a.done && dueDays(a.due) !== null && dueDays(a.due) >= 0)
    .sort((a, b) => dueDays(a.due) - dueDays(b.due) || String(a.title).localeCompare(String(b.title)))
    .slice(0, 6);
  if (!upcoming.length) {
    el.innerHTML = '<div class="dash-calm">No upcoming assignments with due dates. Add one or sync Canvas.</div>';
    return;
  }
  const dayName = (d) => d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(Date.now() + d * 86400000).toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = (due) => {
    const dt = new Date(due + 'T00:00:00');
    return Number.isNaN(dt.getTime()) ? '' : ' · ' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  let html = '';
  let lastDay = null;
  upcoming.forEach((a) => {
    const d = dueDays(a.due);
    if (d !== lastDay) {
      if (lastDay !== null) html += '</div>';
      html += '<div class="dash-day-group"><div class="dash-day-label">' + dayName(d) + (d > 1 ? dateLabel(a.due) : '') + '</div>';
      lastDay = d;
    }
    const externalUrl = safeExternalUrl(a.url);
    html += '<div class="dash-work-row"><div class="dash-work-main"><span class="dash-item-title">' + esc(a.title) + '</span><span class="dash-item-note">' + esc(a.subject) + '</span></div>'
      + (externalUrl ? '<a class="dash-item-open" target="_blank" rel="noopener noreferrer" href="' + esc(externalUrl) + '">Open</a>' : '')
      + '</div>';
  });
  el.innerHTML = html + '</div>';
}

function renderWeek() {
  const el = document.getElementById('dashWeek');
  if (!el) return;
  const work = allAssignments().filter(a => !a.done && a.due);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const key = date.toISOString().split('T')[0];
    const due = work.filter(a => a.due === key);
    const evts = APP.local.events.filter(e => e.date === key);
    if (!due.length && !evts.length) continue;
    days.push({
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      rows: [
        ...due.map(a => '<div class="dash-week-row"><div class="priority-dot ' + a.priority + '"></div><span class="dash-week-text">' + esc(a.title) + '</span><span class="dash-week-course">' + esc(a.subject) + '</span></div>'),
        ...evts.map(e => '<div class="dash-week-row"><span class="dash-week-dot"></span><span class="dash-week-text">' + esc(e.title) + '</span><span class="dash-week-course">' + esc(e.type || 'Event') + '</span></div>'),
      ],
    });
  }
  if (!days.length) {
    el.innerHTML = '<div class="dash-calm">A clear week — nothing due in the next 7 days.</div>';
    return;
  }
  el.innerHTML = days.map(day => '<div class="dash-week-group"><div class="dash-week-day">' + day.label + '</div>' + day.rows.join('') + '</div>').join('');
}

function gradeBand(score) {
  if (score == null) return 'neutral';
  if (score < 70) return 'low';
  if (score < 85) return 'mid';
  return 'good';
}

function renderStanding() {
  const el = document.getElementById('dashGrades');
  if (!el) return;
  const live = [...APP.canvas.grades].sort((a, b) => String(a.courseName || a.courseCode || '').localeCompare(String(b.courseName || b.courseCode || ''), undefined, { sensitivity: 'base' }));
  if (!live.length) {
    el.innerHTML = '<div class="dash-calm">No grades yet. Connect Canvas and your course standing will appear here.</div>';
    return;
  }
  const rows = live.slice(0, 5).map((g) => {
    const band = gradeBand(g.currentScore);
    const score = g.currentScore == null ? '—' : Math.round(g.currentScore) + '%';
    return '<div class="dash-grade-row"><span class="dash-grade-course">' + esc(g.courseCode || g.courseName || 'Course') + '</span><span class="dash-grade-name">' + esc(g.courseName || '') + '</span><span class="dash-grade-val ' + band + '">' + score + '</span></div>';
  }).join('');
  el.innerHTML = '<div class="dash-grade-head"><span>Course</span><span>Current</span></div>' + rows
    + (live.length > 5 ? '<div class="dash-calm subtle">' + (live.length - 5) + ' more on the Grades page</div>' : '');
}

function renderNews() {
  const el = document.getElementById('dashNews');
  if (!el) return;
  const ann = allAnnouncements().slice(0, 2);
  if (!ann.length) {
    el.innerHTML = '<div class="dash-calm">No announcements. When instructors post, the latest shows up here.</div>';
    return;
  }
  el.innerHTML = ann.map((a) => {
    const tier = ANNOUNCE_TIER_META[announcementTier(a)];
    const externalUrl = safeExternalUrl(a.canvasUrl);
    const meta = [a.courseName, CanvasAPI.relativeTime(a.postedAt || a.createdAt || '')].filter(Boolean).join(' · ');
    return '<div class="dash-news-row"><span class="announce-badge mini ' + tier.cls + '">' + tier.label + '</span><div class="dash-news-main"><span class="dash-item-title">' + esc(a.title) + '</span><span class="dash-item-note">' + esc(meta) + '</span></div>'
      + (externalUrl ? '<a class="dash-item-open" target="_blank" rel="noopener noreferrer" href="' + esc(externalUrl) + '">Open</a>' : '')
      + '</div>';
  }).join('');
}

function formatStudyHours(h) {
  const total = Math.max(0, Math.round(Number(h) * 60));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return hh ? (mm ? hh + 'h ' + mm + 'm' : hh + 'h') : mm + 'm';
}

function renderStudyStrip() {
  const line = document.getElementById('dashStudyLine');
  if (!line) return;
  const hours = Number(APP.local.studyHours) || 0;
  const goal = Number(APP.local.studyGoal) || 4;
  line.textContent = hours > 0
    ? formatStudyHours(hours) + ' of your ' + formatStudyHours(goal) + ' goal today'
    : 'Nothing logged today yet — a short session counts.';
}

function renderDashboard() {
  updateDashboardWelcome();
  renderAttention();
  renderNextUp();
  renderWeek();
  renderStanding();
  renderNews();
  renderStudyStrip();
}

function filterAssign(filter, btn) {
  APP.ui.assignFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAssignments();
}

function setAssignmentSort(mode) {
  const allowed = ['smart', 'due', 'priority', 'status', 'course', 'title'];
  APP.ui.assignSort = allowed.includes(mode) ? mode : 'smart';
  localStorage.setItem('bclss_assign_sort', APP.ui.assignSort);
  if (typeof setPref === 'function') setPref('assignSort', APP.ui.assignSort);
  renderAssignments();
}

function renderAssignments() {
  let list = allAssignments();
  const filter = APP.ui.assignFilter;
  const q = APP.ui.searchQuery.toLowerCase();
  if (filter === 'pending') list = list.filter(a => !a.done);
  if (filter === 'overdue') list = list.filter(a => !a.done && dueDays(a.due) !== null && dueDays(a.due) < 0);
  if (filter === 'submitted') list = list.filter(a => a.done);
  if (filter === 'high') list = list.filter(a => a.priority === 'high');
  if (filter === 'canvas') list = list.filter(a => a.source === 'canvas');
  if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.subject.toLowerCase().includes(q));
  list = sortAssignments(list, APP.ui.assignSort);

  const el = document.getElementById('assignList');
  const count = document.getElementById('assignResultCount');
  const sortSelect = document.getElementById('assignSortSelect');
  const sortHint = document.getElementById('assignSortHint');
  const hintByMode = {
    smart: 'Overdue and upcoming work first',
    due: 'Earliest deadlines first',
    priority: 'High priority work first',
    status: 'Overdue, pending, then completed',
    course: 'Grouped alphabetically by course',
    title: 'Alphabetical by assignment name'
  };
  if (count) count.textContent = list.length + (list.length === 1 ? ' assignment' : ' assignments');
  if (sortSelect) sortSelect.value = APP.ui.assignSort;
  if (sortHint) sortHint.textContent = hintByMode[APP.ui.assignSort] || hintByMode.smart;
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-text">Nothing here</div></div>'; return; }

  el.innerHTML = list.map(a => {
    const chip = dueChip(dueDays(a.due));
    const checkIcon = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const xIcon = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const toggle = a.source === 'local'
      ? '<button class="check-btn" onclick="toggleLocalDone(' + a.localId + ')">' + (a.done ? checkIcon : '') + '</button>'
      : '<button class="check-btn" onclick="toggleCanvasDone(\'' + jsQuote(a.id) + '\',' + (a.done ? 'true' : 'false') + ')">' + (a.done ? checkIcon : '') + '</button>';
    const del = a.source === 'local' ? '<button class="btn btn-sm btn-danger" onclick="deleteLocalAssign(' + a.localId + ')">' + xIcon + '</button>' : '';
    const externalUrl = safeExternalUrl(a.url);
    const link = externalUrl ? '<a class="btn btn-sm btn-secondary" target="_blank" rel="noopener noreferrer" href="' + esc(externalUrl) + '">Open</a>' : '';
    return '<div class="assign-item ' + (a.done ? 'done' : '') + '"><div class="priority-dot ' + a.priority + '"></div><div class="assign-info"><div class="assign-title">' + esc(a.title) + '</div><div class="assign-sub">' + esc(a.subject) + (a.due ? ' · Due ' + esc(a.due) : '') + (a.source === 'canvas' && a.manualDone ? ' · Manual done' : '') + '</div></div><div class="assign-right"><span class="due-chip ' + chip.cls + '">' + chip.text + '</span>' + link + toggle + del + '</div></div>';
  }).join('');
}

function openAddAssignment() {
  openModal('<div class="modal-title">Add Assignment</div><div class="form-group"><label class="form-label">Title *</label><input id="a-title" type="text"></div><div class="form-group"><label class="form-label">Subject *</label><input id="a-sub" type="text"></div><div class="form-row"><div class="form-group"><label class="form-label">Due *</label><input id="a-due" type="date"></div><div class="form-group"><label class="form-label">Priority</label><select id="a-pri"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAssignment()">Add</button></div>');
  document.getElementById('a-due').value = daysFromToday(7);
}

function submitAssignment() {
  const title = document.getElementById('a-title').value.trim();
  const subject = document.getElementById('a-sub').value.trim();
  const due = document.getElementById('a-due').value;
  const priority = document.getElementById('a-pri').value;
  if (!title || !subject || !due) { toast('Please fill required fields', 'warn'); return; }
  APP.local.assignments.push({ id: uid(), title, subject, due, priority, done: false });
  save(); closeModal(); renderAll(); switchPage('assignments', document.querySelector('[data-page="assignments"]')); toast('Assignment added', 'success');
}

function toggleLocalDone(id) { const item = APP.local.assignments.find(a => a.id === id); if (item) { item.done = !item.done; save(); renderAll(); } }
function toggleCanvasDone(id, currentDone) {
  if (!APP.local.canvasOverrides || typeof APP.local.canvasOverrides !== 'object') APP.local.canvasOverrides = {};
  APP.local.canvasOverrides[id] = { ...(APP.local.canvasOverrides[id] || {}), done: !currentDone };
  save();
  renderAll();
  toast(!currentDone ? 'Marked as done' : 'Marked as pending', 'info');
}
function deleteLocalAssign(id) { APP.local.assignments = APP.local.assignments.filter(a => a.id !== id); save(); renderAll(); toast('Assignment removed', 'warn'); }

function onSearch(value) {
  APP.ui.searchQuery = value.trim();
  if (APP.ui.searchQuery) {
    switchPage('assignments', document.querySelector('[data-page="assignments"]'));
  } else if ((document.querySelector('.page.active') || {}).id === 'page-assignments') {
    renderAssignments();
  }
}

function renderCalendar() {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthLabel').textContent = monthNames[APP.ui.calMonth] + ' ' + APP.ui.calYear;
  const first = new Date(APP.ui.calYear, APP.ui.calMonth, 1).getDay();
  const total = new Date(APP.ui.calYear, APP.ui.calMonth + 1, 0).getDate();
  const prevTotal = new Date(APP.ui.calYear, APP.ui.calMonth, 0).getDate();
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const highlights = new Set([...APP.local.assignments.map(a => a.due), ...APP.canvas.assignments.filter(a => a.dueAt).map(a => a.dueAt.split('T')[0]), ...APP.local.events.map(e => e.date)].filter(Boolean));
  let html = dayNames.map(d => '<div class="cal-day-name">' + d + '</div>').join('');
  for (let i = 0; i < first; i += 1) html += '<div class="cal-day other-month">' + (prevTotal - first + i + 1) + '</div>';
  for (let d = 1; d <= total; d += 1) {
    const ds = APP.ui.calYear + '-' + String(APP.ui.calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isToday = ds === todayISO();
    const hasDue = highlights.has(ds);
    const selected = APP.ui.selectedDate === ds;
    html += '<div class="cal-day ' + (isToday ? 'today' : '') + ' ' + (hasDue ? 'has-due' : '') + ' ' + (selected && !isToday ? 'selected' : '') + '" onclick="selectCalDay(\'' + ds + '\')">' + d + '</div>';
  }
  const remaining = (7 - ((first + total) % 7)) % 7;
  for (let i = 1; i <= remaining; i += 1) html += '<div class="cal-day other-month">' + i + '</div>';
  document.getElementById('calGrid').innerHTML = html;
  renderCalPanel(APP.ui.selectedDate || todayISO());
}

function selectCalDay(day) { APP.ui.selectedDate = day; renderCalendar(); }

function renderCalPanel(day) {
  const assign = allAssignments().filter(a => a.due === day);
  const events = APP.local.events.filter(e => e.date === day);
  const panel = document.getElementById('calPanel');
  if (!assign.length && !events.length) { panel.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted)">No items on this day.</div>'; return; }
  panel.innerHTML = assign.map(a => '<div class="cal-event-row"><div class="priority-dot ' + a.priority + '"></div><div style="flex:1">' + esc(a.title) + ' · ' + esc(a.subject) + '</div></div>').join('') + events.map(e => '<div class="cal-event-row"><div style="width:8px;height:8px;border-radius:50%;background:var(--yellow)"></div><div style="flex:1">' + esc(e.title) + ' · ' + esc(e.type) + '</div><button class="btn btn-sm btn-danger" onclick="deleteEvent(' + e.id + ')"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>').join('');
}

function changeMonth(direction) {
  if (direction === 0) {
    APP.ui.calMonth = new Date().getMonth();
    APP.ui.calYear = new Date().getFullYear();
  } else {
    APP.ui.calMonth += direction;
    if (APP.ui.calMonth < 0) { APP.ui.calMonth = 11; APP.ui.calYear -= 1; }
    if (APP.ui.calMonth > 11) { APP.ui.calMonth = 0; APP.ui.calYear += 1; }
  }
  APP.ui.selectedDate = null;
  renderCalendar();
}

function openAddEvent() {
  openModal('<div class="modal-title">Add Event</div><div class="form-group"><label class="form-label">Title *</label><input id="e-title" type="text"></div><div class="form-group"><label class="form-label">Date *</label><input id="e-date" type="date"></div><div class="form-group"><label class="form-label">Type</label><select id="e-type"><option>Event</option><option>Exam</option><option>Meeting</option></select></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEvent()">Add</button></div>');
  document.getElementById('e-date').value = APP.ui.selectedDate || daysFromToday(1);
}

function submitEvent() {
  const title = document.getElementById('e-title').value.trim();
  const date = document.getElementById('e-date').value;
  const type = document.getElementById('e-type').value;
  if (!title || !date) { toast('Please fill required fields', 'warn'); return; }
  APP.local.events.push({ id: uid(), title, date, type });
  save(); closeModal(); renderCalendar(); toast('Event added', 'success');
}

function deleteEvent(id) { APP.local.events = APP.local.events.filter(e => e.id !== id); save(); renderCalendar(); }

// ─── Grades: academic performance workspace ──────────────────────
// Hierarchy: (1) overall standing, (2) per-course performance with
// expandable evidence, (3) recent activity, (4) full history.
// No trend arrows are shown: BetterCLSS keeps no grade snapshots,
// so any trend would be invented data.

function percentFromParts(score, total) {
  const s = Number(score);
  const t = Number(total);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) return null;
  return (s / t) * 100;
}

function computeStanding() {
  const scored = APP.canvas.grades.filter(g => g.currentScore != null);
  const hasUnits = APP.canvas.courses.length > 0 && APP.canvas.courses.every(c => c.units != null);
  return {
    gpa: scored.length ? scored.reduce((sum, g) => sum + Number(g.currentScore), 0) / scored.length : null,
    scoredCount: scored.length,
    courseCount: APP.canvas.grades.length || APP.canvas.courses.length,
    hasUnits,
    unitCount: hasUnits ? APP.canvas.courses.reduce((sum, c) => sum + (Number(c.units) || 0), 0) : 0,
  };
}

function renderGpaStanding() {
  const el = document.getElementById('gpaStanding');
  if (!el) return;
  if (APP.canvas.syncing && !APP.canvas.grades.length && !APP.canvas.courses.length) {
    el.innerHTML = '<div class="gpa-skeleton" aria-hidden="true"></div><div class="gpa-skeleton-line" aria-hidden="true"></div>';
    return;
  }
  if (!APP.canvas.connected && !APP.canvas.grades.length) {
    el.innerHTML = '<div class="gpa-calm"><div class="gpa-calm-title">No grades yet</div><p>Your grades will appear here once Canvas has synced your courses.</p><button class="btn btn-secondary btn-sm" onclick="showCanvasSetup()">Connect Canvas</button></div>';
    return;
  }
  const standing = computeStanding();
  if (!standing.scoredCount) {
    el.innerHTML = '<div class="gpa-calm"><div class="gpa-calm-title">' + standing.courseCount + ' course' + (standing.courseCount === 1 ? '' : 's') + ' synced</div><p>Canvas has not published scores yet. Your average will appear here as soon as grading starts.</p></div>';
    return;
  }
  let meta = standing.scoredCount + ' of ' + (standing.courseCount || standing.scoredCount) + ' courses currently graded'
    + (standing.hasUnits ? ' · ' + standing.unitCount + ' units' : '');
  if (standing.courseCount > standing.scoredCount) {
    meta += '<span class="gpa-meta-note">' + (standing.courseCount - standing.scoredCount) + ' course' + (standing.courseCount - standing.scoredCount === 1 ? ' has' : 's have') + ' no posted score yet</span>';
  }
  el.innerHTML = '<div class="gpa-value">' + standing.gpa.toFixed(2) + '</div><div class="gpa-caption">Current average</div><div class="gpa-meta">' + meta + '</div>';
}

function coursesForGrades() {
  const list = [];
  const indexByKey = {};
  APP.canvas.grades.forEach((g) => {
    const row = { courseId: g.courseId ?? g.id ?? null, courseName: g.courseName || g.courseCode || '', courseCode: g.courseCode || null, currentScore: g.currentScore, currentGrade: g.currentGrade, finalScore: g.finalScore ?? null };
    const key = String(row.courseId ?? row.courseName ?? '');
    indexByKey[key] = row;
    list.push(row);
  });
  APP.canvas.courses.forEach((c) => {
    const key = String(c.courseId ?? c.id ?? c.name ?? '');
    if (indexByKey[key]) {
      if (!indexByKey[key].courseCode && c.courseCode) indexByKey[key].courseCode = c.courseCode;
      return;
    }
    const byName = list.find(r => r.courseName && c.name && r.courseName.toLowerCase() === String(c.name).toLowerCase());
    if (byName) return;
    list.push({ courseId: c.courseId ?? c.id ?? null, courseName: c.name || 'Course', courseCode: c.courseCode || null, currentScore: null, currentGrade: null, finalScore: null });
  });
  return list.sort((a, b) => String(a.courseName || a.courseCode || '').localeCompare(String(b.courseName || b.courseCode || ''), undefined, { sensitivity: 'base' }));
}

function gradeEvidenceFor(course) {
  const graded = APP.canvas.assignments.filter((a) => {
    if (!a.graded || typeof a.score !== 'number' || !a.pointsPossible) return false;
    if (course.courseId != null && a.courseId != null) return String(a.courseId) === String(course.courseId);
    return Boolean(course.courseName) && a.courseName === course.courseName;
  });
  const manual = APP.local.grades.filter((g) => {
    const subject = String(g.subject || '').toLowerCase().trim();
    const name = String(course.courseName || '').toLowerCase().trim();
    const code = String(course.courseCode || '').toLowerCase().trim();
    if (!subject || (!name && !code)) return false;
    return (name && (subject === name || name.includes(subject) || subject.includes(name)))
      || (code && (subject === code || subject.includes(code)));
  });
  return { graded, manual };
}

function gradeRowTime(a) { return a.submittedAt || a.dueAt || null; }

function assessmentGroup(label) {
  const text = String(label || '').toLowerCase();
  if (/exam|final|midterm|test\b/.test(text)) return 'Exams';
  if (/quiz/.test(text)) return 'Quizzes';
  if (/project|portfolio|capstone/.test(text)) return 'Projects';
  return 'Assignments';
}

const GRADE_GROUP_ORDER = ['Exams', 'Quizzes', 'Projects', 'Assignments'];

function courseDetailHtml(course) {
  const { graded, manual } = gradeEvidenceFor(course);
  const groups = {};
  graded.forEach((a) => {
    const pct = percentFromParts(a.score, a.pointsPossible);
    if (pct == null) return;
    const group = assessmentGroup(a.title);
    (groups[group] = groups[group] || []).push({ label: a.title, pct, at: gradeRowTime(a) });
  });
  let html = '';
  const sections = GRADE_GROUP_ORDER.filter(name => groups[name] && groups[name].length);
  if (sections.length) {
    html += '<div class="gdetail-block"><div class="gdetail-label">Assessment breakdown · Canvas</div>';
    sections.forEach((name) => {
      const rows = groups[name].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
      html += '<div class="gdetail-group"><div class="gdetail-group-name">' + esc(name) + '</div>'
        + rows.map(r => '<div class="gdetail-row"><span class="gdetail-name">' + esc(r.label) + '</span><span class="gdetail-val">' + Math.round(r.pct) + '%</span></div>').join('')
        + '</div>';
    });
    html += '</div>';
  }
  if (manual.length) {
    html += '<div class="gdetail-block"><div class="gdetail-label">Logged manually</div>'
      + manual.map(g => '<div class="gdetail-row"><span class="gdetail-name">' + esc(g.label) + '</span><span class="gdetail-val">' + esc(String(g.score) + '/' + String(g.total)) + '</span></div>').join('')
      + '</div>';
  }
  if (!html) {
    html = '<div class="gpa-calm subtle"><p>Canvas has not returned graded work for this course yet. Assessment details appear here once instructors publish scores.</p></div>';
  }
  return html;
}

function renderGradesCourseList() {
  const el = document.getElementById('gradesCourseList');
  if (!el) return;
  const courses = coursesForGrades();
  if (!courses.length) {
    const skeleton = APP.canvas.syncing && !APP.canvas.grades.length;
    el.innerHTML = skeleton
      ? '<div class="skeleton-row" style="width:82%" aria-hidden="true"></div><div class="skeleton-row" style="width:64%" aria-hidden="true"></div><div class="skeleton-row" style="width:74%" aria-hidden="true"></div>'
      : '<div class="gpa-calm subtle"><p>No courses yet. Once Canvas syncs your enrollments, they will appear here.</p></div>';
    return;
  }
  el.innerHTML = courses.map((course) => {
    const key = String(course.courseId ?? course.courseName);
    const open = APP.ui.courseDetail === key;
    const pct = course.currentScore == null ? null : Number(course.currentScore);
    const value = pct == null ? '—' : Math.round(pct) + '%';
    const sub = [course.courseCode, course.currentGrade].filter(Boolean).map(esc).join(' · ');
    return '<div class="gcourse' + (open ? ' open' : '') + (pct == null ? ' unscored' : '') + '">'
      + '<button class="gcourse-row" onclick=\"toggleCourseDetail(\'' + jsQuote(key) + '\')\" aria-expanded="' + open + '">'
      + '<span class="gcourse-identity"><span class="gcourse-name">' + esc(course.courseName || course.courseCode || 'Course') + '</span>'
      + (sub ? '<span class="gcourse-sub">' + sub + '</span>' : '') + '</span>'
      + '<span class="gcourse-value"><span class="gcourse-pct">' + value + '</span>'
      + '<svg class="gcourse-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></span>'
      + '</button>'
      + '<div class="gcourse-detail" id="gdetail-' + esc(key) + '"' + (open ? '' : ' hidden') + '>' + courseDetailHtml(course) + '</div>'
      + '</div>';
  }).join('');
}

function toggleCourseDetail(key) {
  APP.ui.courseDetail = APP.ui.courseDetail === key ? null : key;
  renderGradesCourseList();
}

function renderGradesActivity() {
  const el = document.getElementById('gradesActivity');
  if (!el) return;
  const canvasRows = APP.canvas.assignments
    .filter(a => a.graded && typeof a.score === 'number' && a.pointsPossible)
    .map(a => ({ at: gradeRowTime(a), course: a.courseName || a.courseCode || '', label: a.title, value: percentFromParts(a.score, a.pointsPossible), kind: 'canvas' }));
  const manualRows = APP.local.grades
    .map(g => ({ at: g.loggedAt || null, course: g.subject, label: g.label, value: String(g.score) + '/' + String(g.total), kind: 'manual' }));
  const timeOf = (r) => (r.at && Date.parse(r.at)) || 0;
  const rows = [...canvasRows, ...manualRows].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 8);
  if (!rows.length) {
    el.innerHTML = APP.canvas.syncing
      ? '<div class="skeleton-row" style="width:70%" aria-hidden="true"></div><div class="skeleton-row" style="width:55%" aria-hidden="true"></div>'
      : '<div class="gpa-calm subtle"><p>No grade activity yet. Scores appear here as instructors grade your work.</p></div>';
    return;
  }
  el.innerHTML = rows.map((r) => {
    const value = r.kind === 'manual' ? esc(r.value) : (r.value == null ? '—' : Math.round(r.value) + '%');
    const when = r.at ? esc(CanvasAPI.relativeTime(r.at)) : 'Logged manually';
    return '<div class="gactivity-row"><div class="gactivity-main"><span class="gactivity-course">' + esc(r.course || 'Course') + '</span><span class="gactivity-title">' + esc(r.label) + '</span></div><div class="gactivity-side"><span class="gactivity-value">' + value + '</span><span class="gactivity-when">' + when + '</span></div></div>';
  }).join('');
}

function renderGradeHistory() {
  const el = document.getElementById('gradeLog');
  const toggle = document.getElementById('gradesHistoryToggle');
  if (!el) return;
  const entries = [...APP.local.grades].sort((a, b) => ((b.loggedAt && Date.parse(b.loggedAt)) || 0) - ((a.loggedAt && Date.parse(a.loggedAt)) || 0));
  if (!entries.length) {
    if (toggle) toggle.hidden = true;
    el.innerHTML = '<div class="gpa-calm subtle"><p>No manually logged grades yet. Use “Log grade” to record results Canvas does not track.</p></div>';
    return;
  }
  const expanded = APP.ui.gradesHistoryExpanded;
  const visible = expanded ? entries : entries.slice(0, 6);
  if (toggle) {
    toggle.hidden = entries.length <= 6;
    toggle.textContent = expanded ? 'Show fewer' : 'Show all (' + entries.length + ')';
  }
  el.innerHTML = '<table class="grade-table"><thead><tr><th scope="col">Course</th><th scope="col">Activity</th><th scope="col" class="num">Score</th><th scope="col"><span class="visually-hidden">Delete</span></th></tr></thead><tbody>'
    + visible.map(g => '<tr><td>' + esc(g.subject) + '</td><td>' + esc(g.label) + '</td><td class="num">' + esc(String(g.score) + '/' + String(g.total)) + '</td><td class="num"><button class="grade-del" onclick="deleteLocalGrade(' + g.id + ')" aria-label="Delete logged grade ' + esc(g.label) + '"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td></tr>').join('')
    + '</tbody></table>';
}

function toggleGradesHistory() {
  APP.ui.gradesHistoryExpanded = !APP.ui.gradesHistoryExpanded;
  renderGradeHistory();
}

function renderGradesSyncError() {
  const el = document.getElementById('gradesSyncError');
  if (!el) return;
  const hasData = APP.canvas.grades.length > 0;
  if (APP.canvas.lastSyncError && !APP.canvas.syncing) {
    el.innerHTML = '<div class="sync-error-main"><span class="sync-error-title">Canvas couldn\u2019t be synced.</span><span class="sync-error-note">'
      + (hasData ? 'Your last synced grades are still available.' : 'Connect and try again to load your grades.')
      + '</span></div><button class="btn btn-secondary btn-sm" onclick="syncCanvas()">Try again</button>';
    el.hidden = false;
    return;
  }
  el.hidden = true;
  el.innerHTML = '';
}

function updateGradesSyncState() {
  const label = document.getElementById('gradesSyncState');
  if (!label) return;
  if (APP.canvas.syncing) { label.textContent = 'Syncing Canvas…'; return; }
  let savedAt = null;
  try { savedAt = (JSON.parse(localStorage.getItem('bclss_canvas_cache') || 'null') || {}).savedAt || null; } catch (_) { savedAt = null; }
  if (savedAt) label.textContent = 'Synced ' + CanvasAPI.relativeTime(savedAt) + ' · Canvas + manually logged';
  else if (APP.canvas.connected) label.textContent = 'Connected to Canvas';
  else label.textContent = 'Not connected — sync to load your live grades';
}

function renderGrades() {
  updateGradesSyncState();
  renderGradesSyncError();
  renderGpaStanding();
  renderGradesCourseList();
  renderGradesActivity();
  renderGradeHistory();
}

function openAddGrade() {
  openModal('<div class="modal-title">Log grade</div><div class="form-group"><label class="form-label">Course *</label><input id="g-sub" type="text" placeholder="e.g. CIS 2101"></div><div class="form-group"><label class="form-label">Assessment</label><input id="g-label" type="text" placeholder="e.g. Midterm exam"></div><div class="form-row"><div class="form-group"><label class="form-label">Score *</label><input id="g-score" type="text" inputmode="decimal"></div><div class="form-group"><label class="form-label">Out of *</label><input id="g-total" type="text" inputmode="decimal"></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitGrade()">Log grade</button></div>');
}

function submitGrade() {
  const subject = document.getElementById('g-sub').value.trim();
  const label = document.getElementById('g-label').value.trim() || 'Grade';
  const score = parseFloat(document.getElementById('g-score').value);
  const total = parseFloat(document.getElementById('g-total').value);
  if (!subject || Number.isNaN(score) || Number.isNaN(total) || total <= 0) { toast('Please fill fields correctly', 'warn'); return; }
  APP.local.grades.push({ id: uid(), subject, label, score, total, loggedAt: new Date().toISOString() });
  APP.ui.gradesHistoryExpanded = true;
  save(); closeModal(); renderGrades(); toast('Grade logged', 'success');
}

function deleteLocalGrade(id) { APP.local.grades = APP.local.grades.filter(g => g.id !== id); save(); renderGrades(); toast('Logged grade removed', 'info'); }

function toggleSidebarCoursesExpanded() {
  const expanded = localStorage.getItem('bclss_courses_expanded') === '1';
  localStorage.setItem('bclss_courses_expanded', expanded ? '0' : '1');
  renderSidebar();
}

// Semantic announcement tiers: color carries meaning (red = act now, amber =
// this week, teal = informational) so users can scan the feed in seconds.
function announcementTier(a) {
  const text = String(a.title + ' ' + (a.message || a.body || '')).toLowerCase();
  if (/(urgent|asap|immediately|deadline today|due today|last day|closes today|exam|emergency)/.test(text)) return 'urgent';
  const d = dueDays(a.due);
  if (a.due && d !== null && d >= 0 && d <= 7) return 'due';
  if (/(quiz|exam|test|due|submit|deadline|registration|register)/.test(text)) return 'due';
  const ageDays = (Date.now() - Date.parse(a.postedAt || a.createdAt || '')) / 86400000;
  if (Number.isFinite(ageDays) && ageDays <= 3) return 'new';
  return 'fyi';
}

const ANNOUNCE_TIER_META = {
  urgent: { cls: 'urgent', label: 'URGENT', icon: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' },
  due:    { cls: 'due',    label: 'DUE SOON', icon: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  new:    { cls: 'new',    label: 'NEW',      icon: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
  fyi:    { cls: 'fyi',    label: 'FYI',      icon: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' },
};

function announcementSnippet(a) {
  const raw = String(a.message || a.body || '').replace(/\s+/g, ' ').trim();
  const words = raw.split(' ');
  if (words.length <= 22) return raw;
  return words.slice(0, 22).join(' ') + '…';
}

function announcementMeta(a) {
  const parts = [];
  if (a.courseName) parts.push(esc(a.courseName));
  const posted = a.postedAt || a.createdAt;
  if (posted && Number.isFinite(Date.parse(posted))) {
    parts.push(esc(new Date(posted).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })));
  } else if (a.time) {
    parts.push(esc(a.time));
  }
  if (a.author) parts.push(esc(a.author));
  return parts.join(' · ');
}

function renderAnnouncements() {
  const list = allAnnouncements();
  const el = document.getElementById('announceList');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-text">No announcements yet</div></div>'; return; }
  // Urgency-first: urgent and due-soon items float to the top of the feed.
  const tierOrder = { urgent: 0, due: 1, new: 2, fyi: 3 };
  const sorted = [...list].sort((a, b) => {
    const ta = tierOrder[announcementTier(a)];
    const tb = tierOrder[announcementTier(b)];
    if (ta !== tb) return ta - tb;
    return (Date.parse(b.postedAt || b.createdAt || '') || 0) - (Date.parse(a.postedAt || a.createdAt || '') || 0);
  });
  el.innerHTML = sorted.map((a) => {
    const tier = ANNOUNCE_TIER_META[announcementTier(a)];
    const snippet = announcementSnippet(a);
    const externalUrl = safeExternalUrl(a.canvasUrl);
    const bodyHtml = snippet
      ? '<p class="announce-snippet">' + esc(snippet) + '</p>'
      : '';
    return '<article class="announce-card tier-' + tier.cls + '">'
      + '<div class="announce-top">'
      + '<span class="announce-badge ' + tier.cls + '">' + tier.icon + tier.label + '</span>'
      + '<div class="announce-heading"><h3 class="announce-title">' + esc(a.title) + '</h3>'
      + '<span class="announce-posted">' + esc(CanvasAPI.relativeTime(a.postedAt || a.createdAt || '')) + '</span></div>'
      + '</div>'
      + bodyHtml
      + '<div class="announce-meta"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
      + '<span>' + (announcementMeta(a) || 'General') + '</span>'
      + (externalUrl ? '<a class="announce-open" target="_blank" rel="noopener noreferrer" href="' + esc(externalUrl) + '">Open in Canvas</a>' : '')
      + (a.canvas ? '' : '<button class="announce-del" onclick="deleteLocalAnnouncement(' + a.id + ')" aria-label="Delete announcement"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>')
      + '</div></article>';
  }).join('');
}

function openAddAnnouncement() {
  openModal('<div class="modal-title">Post Announcement</div><div class="form-group"><label class="form-label">Title *</label><input id="n-title" type="text"></div><div class="form-group"><label class="form-label">Message</label><textarea id="n-body"></textarea></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAnnouncement()">Post</button></div>');
}

function submitAnnouncement() {
  const title = document.getElementById('n-title').value.trim();
  const body = document.getElementById('n-body').value.trim();
  if (!title) { toast('Title required', 'warn'); return; }
  APP.local.announcements.unshift({ id: uid(), title, body, time: 'Just now', createdAt: new Date().toISOString() });
  save(); closeModal(); renderAnnouncements(); updateBadges();
}

function deleteLocalAnnouncement(id) { APP.local.announcements = APP.local.announcements.filter(a => a.id !== id); save(); renderAnnouncements(); updateBadges(); }

function renderNotes() {
  const el = document.getElementById('notesGrid');
  el.innerHTML = APP.local.notes.map(n => '<div class="note-card ' + n.color + '"><button class="note-del-btn" onclick="deleteNote(' + n.id + ')"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div class="note-title">' + esc(n.title) + '</div><div class="note-body">' + esc(n.content) + '</div><div class="note-date">' + esc(n.date || '') + '</div></div>').join('') + '<div class="add-note-card" onclick="openAddNote()"><div class="plus">+</div><div>Add Note</div></div>';
}

function openAddNote() {
  openModal('<div class="modal-title">New Note</div><div class="form-group"><label class="form-label">Title *</label><input id="note-title" type="text"></div><div class="form-group"><label class="form-label">Content</label><textarea id="note-body"></textarea></div><div class="form-group"><label class="form-label">Color</label><select id="note-color"><option value="yellow">Yellow</option><option value="blue">Blue</option><option value="pink">Pink</option><option value="green">Green</option></select></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNote()">Save</button></div>');
}

function submitNote() {
  const title = document.getElementById('note-title').value.trim();
  const content = document.getElementById('note-body').value.trim();
  const color = document.getElementById('note-color').value;
  if (!title) { toast('Title required', 'warn'); return; }
  APP.local.notes.push({ id: uid(), title, content, color, date: 'Just now' });
  save(); closeModal(); renderNotes();
}

function deleteNote(id) { APP.local.notes = APP.local.notes.filter(n => n.id !== id); save(); renderNotes(); }

function renderLinks() {
  const el = document.getElementById('linksGrid');
  el.innerHTML = APP.local.links.map((l) => {
    const url = safeExternalUrl(l.url);
    if (!url) return '';
    const host = new URL(url).hostname;
    return '<a class="link-card" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><div class="link-icon-box">' + esc(l.icon || '🌐') + '</div><div><div class="link-name">' + esc(l.name) + '</div><div class="link-host">' + esc(host) + '</div></div></a>';
  }).join('') + '<div class="link-card" style="cursor:pointer;border-style:dashed" onclick="openAddLink()"><div class="link-icon-box">+</div><div><div class="link-name">Add Link</div></div></div>';
}

function openAddLink() {
  openModal('<div class="modal-title">Add Resource Link</div><div class="form-group"><label class="form-label">Name *</label><input id="l-name" type="text"></div><div class="form-group"><label class="form-label">URL *</label><input id="l-url" type="url"></div><div class="form-group"><label class="form-label">Icon</label><input id="l-icon" type="text" value="🌐"></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitLink()">Add</button></div>');
}

function submitLink() {
  const name = document.getElementById('l-name').value.trim();
  let url = document.getElementById('l-url').value.trim();
  const icon = document.getElementById('l-icon').value.trim() || '🌐';
  if (!name || !url) { toast('Name and URL required', 'warn'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  url = safeExternalUrl(url);
  if (!url) { toast('Enter a valid http or https URL', 'warn'); return; }
  APP.local.links.push({ id: uid(), name, url, icon });
  save(); closeModal(); renderLinks();
}
