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
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statAnnounce').textContent = ann;
}

function renderSidebar() {
  const due = allAssignments().filter(a => !a.done).slice(0, 6);
  const sidebarDue = document.getElementById('sidebarDue');
  if (sidebarDue) {
    sidebarDue.innerHTML = due.length ? due.map(a => { const chip = dueChip(dueDays(a.due)); return '<div class="mini-item"><div class="priority-dot ' + a.priority + '"></div><div class="mini-item-info"><div class="mini-item-title">' + esc(a.title) + '</div><div class="mini-item-due">' + chip.text + ' · ' + esc(a.subject) + '</div></div></div>'; }).join('') : '<div style="font-size:0.75rem;color:var(--text-muted)">Nothing pending</div>';
  }
  const sidebarCourses = document.getElementById('sidebarCourses');
  if (sidebarCourses) {
    const courses = [...APP.canvas.courses].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    sidebarCourses.innerHTML = courses.length ? courses.map(c => '<div style="font-size:0.78rem;color:var(--text-dim);padding:4px 0">' + esc(c.name) + '</div>').join('') : '<div style="font-size:0.75rem;color:var(--text-muted)">Not connected</div>';
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

function dashboardFeed(items) {
  if (!items.length) return '<div class="empty-state"><div class="empty-text">Nothing to show</div></div>';
  return items.map(a => { const chip = dueChip(dueDays(a.due)); return '<div class="feed-item"><div class="priority-dot ' + a.priority + '"></div><div class="feed-info"><div class="feed-title">' + esc(a.title) + '</div><div class="feed-meta">' + esc(a.subject) + '</div></div><div class="due-chip ' + chip.cls + '">' + chip.text + '</div></div>'; }).join('');
}

function renderDashboard() {
  updateDashboardWelcome();
  const all = allAssignments();
  const upcoming = all.filter(a => !a.done && (dueDays(a.due) === null || dueDays(a.due) >= 0)).slice(0, 6);
  const urgent = all.filter(a => !a.done && (a.priority === 'high' || (dueDays(a.due) !== null && dueDays(a.due) < 0))).slice(0, 6);
  document.getElementById('dashUpcoming').innerHTML = dashboardFeed(upcoming);
  document.getElementById('dashOverdue').innerHTML = dashboardFeed(urgent);
  const grades = [...APP.canvas.grades].sort((a, b) => String(a.courseName || a.courseCode || '').localeCompare(String(b.courseName || b.courseCode || ''), undefined, { sensitivity: 'base' }));
  document.getElementById('dashGrades').innerHTML = grades.length ? grades.slice(0, 6).map(g => '<div class="feed-item"><div class="feed-info"><div class="feed-title">' + esc(g.courseName || g.courseCode || 'Course') + '</div><div class="feed-meta">' + esc(g.courseCode || '') + '</div></div><div class="grade-val">' + (g.currentScore == null ? '--' : Math.round(g.currentScore) + '%') + '</div></div>').join('') : '<div class="empty-state"><div class="empty-text">No grade data</div></div>';
  const ann = allAnnouncements().slice(0, 4);
  document.getElementById('dashAnnouncements').innerHTML = ann.length ? ann.map(a => '<div class="feed-item"><div class="feed-info"><div class="feed-title">' + esc(a.title) + '</div><div class="feed-meta">' + esc(a.courseName || a.time || '') + '</div></div></div>').join('') : '<div class="empty-state"><div class="empty-text">No announcements</div></div>';
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
    const toggle = a.source === 'local'
      ? '<button class="check-btn" onclick="toggleLocalDone(' + a.localId + ')">' + (a.done ? '✓' : '') + '</button>'
      : '<button class="check-btn" onclick="toggleCanvasDone(\'' + jsQuote(a.id) + '\',' + (a.done ? 'true' : 'false') + ')">' + (a.done ? '✓' : '') + '</button>';
    const del = a.source === 'local' ? '<button class="btn btn-sm btn-danger" onclick="deleteLocalAssign(' + a.localId + ')">✕</button>' : '';
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
  panel.innerHTML = assign.map(a => '<div class="cal-event-row"><div class="priority-dot ' + a.priority + '"></div><div style="flex:1">' + esc(a.title) + ' · ' + esc(a.subject) + '</div></div>').join('') + events.map(e => '<div class="cal-event-row"><div style="width:8px;height:8px;border-radius:50%;background:var(--yellow)"></div><div style="flex:1">' + esc(e.title) + ' · ' + esc(e.type) + '</div><button class="btn btn-sm btn-danger" onclick="deleteEvent(' + e.id + ')">✕</button></div>').join('');
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

function renderGrades() {
  const overview = document.getElementById('gradesOverview');
  const log = document.getElementById('gradeLog');
  const live = [...APP.canvas.grades].sort((a, b) => String(a.courseName || a.courseCode || '').localeCompare(String(b.courseName || b.courseCode || ''), undefined, { sensitivity: 'base' }));
  overview.innerHTML = live.length ? live.map(g => { const score = g.currentScore == null ? '--' : Math.round(g.currentScore) + '%'; return '<div class="grade-card"><div class="grade-course">' + esc(g.courseCode || g.courseName || '') + '</div><div class="grade-val">' + score + '</div></div>'; }).join('') : '<div style="font-size:0.82rem;color:var(--text-muted)">Sync Canvas to see live grades.</div>';
  if (!APP.local.grades.length) { log.innerHTML = '<div class="empty-state"><div class="empty-text">No manually logged grades yet</div></div>'; return; }
  log.innerHTML = '<table class="grade-table"><thead><tr><th>Course</th><th>Activity</th><th style="text-align:right">Score</th><th></th></tr></thead><tbody>' + APP.local.grades.map(g => '<tr><td>' + esc(g.subject) + '</td><td>' + esc(g.label) + '</td><td style="text-align:right">' + g.score + '/' + g.total + '</td><td style="text-align:right"><button class="btn btn-sm btn-danger" onclick="deleteLocalGrade(' + g.id + ')">✕</button></td></tr>').join('') + '</tbody></table>';
}

function openAddGrade() {
  openModal('<div class="modal-title">Log Grade</div><div class="form-group"><label class="form-label">Course *</label><input id="g-sub" type="text"></div><div class="form-group"><label class="form-label">Activity</label><input id="g-label" type="text"></div><div class="form-row"><div class="form-group"><label class="form-label">Score *</label><input id="g-score" type="text"></div><div class="form-group"><label class="form-label">Out of *</label><input id="g-total" type="text"></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitGrade()">Log</button></div>');
}

function submitGrade() {
  const subject = document.getElementById('g-sub').value.trim();
  const label = document.getElementById('g-label').value.trim() || 'Grade';
  const score = parseFloat(document.getElementById('g-score').value);
  const total = parseFloat(document.getElementById('g-total').value);
  if (!subject || Number.isNaN(score) || Number.isNaN(total) || total <= 0) { toast('Please fill fields correctly', 'warn'); return; }
  APP.local.grades.push({ id: uid(), subject, label, score, total });
  save(); closeModal(); renderGrades(); toast('Grade logged', 'success');
}

function deleteLocalGrade(id) { APP.local.grades = APP.local.grades.filter(g => g.id !== id); save(); renderGrades(); }

function renderAnnouncements() {
  const list = allAnnouncements();
  const el = document.getElementById('announceList');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-text">No announcements yet</div></div>'; return; }
  el.innerHTML = list.map(a => '<div class="announce-card"><div class="announce-icon">' + (a.canvas ? '🎓' : '📌') + '</div><div class="announce-body-wrap"><div class="announce-title">' + esc(a.title) + '</div><div class="announce-body">' + esc(a.message || a.body || '') + '</div><div class="announce-time">' + esc(a.courseName || a.time || '') + '</div></div>' + (a.canvas ? '' : '<button class="btn btn-sm btn-danger" onclick="deleteLocalAnnouncement(' + a.id + ')">✕</button>') + '</div>').join('');
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
  el.innerHTML = APP.local.notes.map(n => '<div class="note-card ' + n.color + '"><button class="note-del-btn" onclick="deleteNote(' + n.id + ')">✕</button><div class="note-title">' + esc(n.title) + '</div><div class="note-body">' + esc(n.content) + '</div><div class="note-date">' + esc(n.date || '') + '</div></div>').join('') + '<div class="add-note-card" onclick="openAddNote()"><div class="plus">+</div><div>Add Note</div></div>';
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
