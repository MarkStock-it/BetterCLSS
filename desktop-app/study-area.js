function ensureStudyDefaults() {
  APP.local.studySettings = APP.local.studySettings || {};
  const storedIntervals = readStoredStudyIntervals() || {};
  const initialWork = Number(APP.local.studySettings.workMins) || Number(storedIntervals.workMins) || 25;
  const initialBreak = Number(APP.local.studySettings.breakMins) || Number(storedIntervals.breakMins) || 5;
  const initialLong = Number(APP.local.studySettings.longBreakMins) || Number(storedIntervals.longBreakMins) || 15;
  APP.local.studySettings.workMins = Math.max(10, Math.min(180, initialWork));
  APP.local.studySettings.breakMins = Math.max(3, Math.min(60, initialBreak));
  APP.local.studySettings.longBreakMins = Math.max(10, Math.min(90, initialLong));
  APP.local.studySettings.dailyGoalHours = Number(APP.local.studySettings.dailyGoalHours) || 4;
  APP.local.studySettings.ambientMode = APP.local.studySettings.ambientMode || 'off';
  APP.local.studySettings.ambientVolume = Number(APP.local.studySettings.ambientVolume) || 30;
  APP.local.studySettings.studyTheme = APP.local.studySettings.studyTheme || 'dark';
  APP.local.studySettings.editorSplit = Number(APP.local.studySettings.editorSplit) || 50;
  APP.local.studyTasks = Array.isArray(APP.local.studyTasks) ? APP.local.studyTasks : [];
  APP.local.studyHistory = Array.isArray(APP.local.studyHistory) ? APP.local.studyHistory : [];
  APP.local.studyCurrentNote = APP.local.studyCurrentNote || { content: '', updatedAt: null };
  APP.local.studyTasks = APP.local.studyTasks.map((t) => ({ ...t, priority: t.priority || 'medium' }));
  saveStudyIntervalsToStorage();
}

function applyStudyTheme() {
  const page = document.getElementById('page-study');
  if (!page) return;
  const isLight = APP.local.studySettings.studyTheme === 'light';
  page.classList.toggle('study-theme-light', isLight);
  const btn = document.getElementById('studyThemeBtn');
  if (btn) btn.textContent = 'Study Theme: ' + (isLight ? 'Light' : 'Dark');
}

function toggleStudyTheme() {
  APP.local.studySettings.studyTheme = APP.local.studySettings.studyTheme === 'light' ? 'dark' : 'light';
  applyStudyTheme();
  save();
}

function toggleFocusMode() {
  studyFocusMode = !studyFocusMode;
  document.body.classList.toggle('study-focus-mode', studyFocusMode);
  document.body.classList.toggle('focus-mode-active', studyFocusMode);
  const btn = document.getElementById('focusModeBtn');
  if (btn) btn.textContent = studyFocusMode ? 'Exit Focus Mode' : 'Focus Mode';
}

function readStoredStudyIntervals() {
  try {
    const raw = localStorage.getItem(STUDY_INTERVALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveStudyIntervalsToStorage() {
  localStorage.setItem(STUDY_INTERVALS_STORAGE_KEY, JSON.stringify({
    workMins: APP.local.studySettings.workMins,
    breakMins: APP.local.studySettings.breakMins,
    longBreakMins: APP.local.studySettings.longBreakMins
  }));
}

function updateStudyIntervalSliderUI(inputId, valueId) {
  const input = document.getElementById(inputId);
  const valueNode = document.getElementById(valueId);
  if (!input) return;
  const value = Number(input.value) || 0;
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((value - min) / Math.max(1, max - min)) * 100;
  input.style.setProperty('--pct', pct + '%');
  if (valueNode) valueNode.textContent = value + ' min';
}

function bindStudyIntervalSliders() {
  const sliderMap = [
    { inputId: 'workInterval', valueId: 'workIntervalValue', key: 'workMins', min: 10, max: 180, phase: 'work' },
    { inputId: 'breakInterval', valueId: 'breakIntervalValue', key: 'breakMins', min: 3, max: 60, phase: 'break' },
    { inputId: 'longBreakInterval', valueId: 'longBreakIntervalValue', key: 'longBreakMins', min: 10, max: 90, phase: 'long' }
  ];

  sliderMap.forEach((cfg) => {
    const input = document.getElementById(cfg.inputId);
    if (!input) return;
    input.oninput = () => {
      const value = Math.max(cfg.min, Math.min(cfg.max, Number(input.value) || cfg.min));
      input.value = String(value);
      APP.local.studySettings[cfg.key] = value;
      updateStudyIntervalSliderUI(cfg.inputId, cfg.valueId);
      saveStudyIntervalsToStorage();
      save();
      if (!studyTimerRunning && studyPhase === cfg.phase) {
        studyTimerSecs = value * 60;
        setStudyTimerDisplay();
      }
    };
    updateStudyIntervalSliderUI(cfg.inputId, cfg.valueId);
  });
}

function renderStudyPresets() {
  const presets = [
    { key: 'deep', label: 'Deep Work', work: 90, brk: 15, long: 20 },
    { key: 'quick', label: 'Quick Session', work: 25, brk: 5, long: 15 },
    { key: 'review', label: 'Review', work: 15, brk: 3, long: 10 }
  ];
  const row = document.getElementById('presetRow');
  if (!row) return;
  row.innerHTML = presets.map((p) => '<button class="preset-pill" onclick="applyStudyPreset(\'' + p.key + '\')">' + p.label + '</button>').join('');
}

function applyStudyPreset(key) {
  const map = {
    deep: { work: 90, brk: 15, long: 20 },
    quick: { work: 25, brk: 5, long: 15 },
    review: { work: 15, brk: 3, long: 10 }
  };
  const preset = map[key] || map.quick;
  APP.local.studySettings.workMins = preset.work;
  APP.local.studySettings.breakMins = preset.brk;
  APP.local.studySettings.longBreakMins = preset.long;
  const workInput = document.getElementById('workInterval');
  const breakInput = document.getElementById('breakInterval');
  const longInput = document.getElementById('longBreakInterval');
  if (workInput) workInput.value = String(preset.work);
  if (breakInput) breakInput.value = String(preset.brk);
  if (longInput) longInput.value = String(preset.long);
  updateStudyIntervalSliderUI('workInterval', 'workIntervalValue');
  updateStudyIntervalSliderUI('breakInterval', 'breakIntervalValue');
  updateStudyIntervalSliderUI('longBreakInterval', 'longBreakIntervalValue');
  setStudyPhase('work');
  resetStudyTimer();
  saveStudyIntervalsToStorage();
  save();
}

function syncStudyIntervalsFromUI() {
  const workInput = document.getElementById('workInterval');
  const breakInput = document.getElementById('breakInterval');
  const longInput = document.getElementById('longBreakInterval');
  if (workInput) APP.local.studySettings.workMins = Math.max(10, Math.min(180, Number(workInput.value) || 25));
  if (breakInput) APP.local.studySettings.breakMins = Math.max(3, Math.min(60, Number(breakInput.value) || 5));
  if (longInput) APP.local.studySettings.longBreakMins = Math.max(10, Math.min(90, Number(longInput.value) || 15));
  updateStudyIntervalSliderUI('workInterval', 'workIntervalValue');
  updateStudyIntervalSliderUI('breakInterval', 'breakIntervalValue');
  updateStudyIntervalSliderUI('longBreakInterval', 'longBreakIntervalValue');
  saveStudyIntervalsToStorage();
  save();
}

function getPhaseMinutes(phase) {
  if (phase === 'break') return APP.local.studySettings.breakMins;
  if (phase === 'long') return APP.local.studySettings.longBreakMins;
  return APP.local.studySettings.workMins;
}

function phaseLabel(phase) {
  const icons = {
    work:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
    break: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
    long:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
  };
  const labels = { work: 'Work', break: 'Break', long: 'Long Break' };
  return (icons[phase] || icons.work) + (labels[phase] || 'Work');
}

function setStudyPhase(phase) {
  studyPhase = phase;
  const chips = document.querySelectorAll('.phase-chip');
  chips.forEach((chip) => chip.classList.toggle('active', chip.getAttribute('data-phase') === phase));
  const label = document.getElementById('studySessionType');
  if (label) label.innerHTML = phaseLabel(phase);
  studyTimerSecs = getPhaseMinutes(phase) * 60;
  setStudyTimerDisplay();
  updateStudyRing();
  updateStudyLabel();
}

function updateStudyRing() {
  const ring = document.getElementById('studyRingProgress');
  if (!ring) return;
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = String(circumference);
  const total = getPhaseMinutes(studyPhase) * 60;
  const progress = total ? studyTimerSecs / total : 0;
  ring.style.strokeDashoffset = String(circumference * (1 - Math.max(0, Math.min(1, progress))));
}

function setStudyTimerDisplay() {
  const d = document.getElementById('studyTimerDisplay');
  if (!d) return;
  const m = String(Math.floor(studyTimerSecs / 60)).padStart(2, '0');
  const s = String(studyTimerSecs % 60).padStart(2, '0');
  d.textContent = m + ':' + s;
  updateStudyRing();
}

function updateStudyLabel() {
  const hero = document.getElementById('studyTimerWrap');
  if (hero) hero.classList.toggle('running', !!studyTimerRunning);
}

function resetStudyTimer() {
  syncStudyIntervalsFromUI();
  clearInterval(studyTimer);
  studyTimerRunning = false;
  studyTimerSecs = getPhaseMinutes(studyPhase) * 60;
  const btn = document.getElementById('studyStartPauseBtn');
  if (btn) btn.textContent = 'Start';
  setStudyTimerDisplay();
  updateStudyLabel();
}

function notifyStudyPhaseComplete(nextPhase) {
  playStudyBeep();
  const wrap = document.getElementById('studyTimerWrap');
  if (wrap) {
    wrap.classList.add('study-flash');
    setTimeout(() => wrap.classList.remove('study-flash'), 900);
  }
  toast(nextPhase === 'work' ? 'Back to focus mode' : 'Switching to ' + phaseLabel(nextPhase), 'success');
}

function completeStudyPhase() {
  if (studyPhase === 'work') {
    studyCompletedCycles += 1;
    APP.local.pomoSessions += 1;
    const focusDurationMins = APP.local.studySettings.workMins;
    APP.local.studyHours = +(APP.local.studyHours + focusDurationMins / 60).toFixed(2);
    const content = (document.getElementById('studyNoteEditor') || {}).value || APP.local.studyCurrentNote.content || '';
    const tagsRaw = (document.getElementById('sessionTagInput') || {}).value || '';
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    APP.local.studyHistory.unshift({
      id: uid(),
      at: new Date().toISOString(),
      date: getTodayKey(),
      week: getWeekStartKey(new Date()),
      durationSecs: focusDurationMins * 60,
      tagList: tags,
      notePreview: content.slice(0, 180),
      noteFull: content
    });
    APP.local.studyHistory = APP.local.studyHistory.slice(0, 150);
    if (APP.local.studyHours >= APP.local.studySettings.dailyGoalHours) celebrateGoal();
    const next = studyCompletedCycles % 4 === 0 ? 'long' : 'break';
    setStudyPhase(next);
  } else {
    setStudyPhase('work');
  }
  notifyStudyPhaseComplete(studyPhase);
  renderStudyStatsAndHistory();
  save();
}

function toggleStudyTimer() {
  syncStudyIntervalsFromUI();
  const btn = document.getElementById('studyStartPauseBtn');
  if (studyTimerRunning) {
    clearInterval(studyTimer);
    studyTimerRunning = false;
    if (btn) btn.textContent = 'Resume';
    pulseButton(btn);
    updateStudyLabel();
    return;
  }
  studyTimerRunning = true;
  if (btn) btn.textContent = 'Pause';
  pulseButton(btn);
  updateStudyLabel();
  studyTimer = setInterval(() => {
    studyTimerSecs -= 1;
    setStudyTimerDisplay();
    if (studyTimerSecs <= 0) completeStudyPhase();
  }, 1000);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStartKey(dateValue) {
  const d = new Date(dateValue);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function fmtDur(secs) {
  const total = Math.round((secs || 0) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return m + 'm';
  return h + 'h ' + m + 'm';
}

function buildStudyStats() {
  const today = getTodayKey();
  const week = getWeekStartKey(new Date());
  const history = APP.local.studyHistory || [];
  const todaySecs = history.filter((h) => h.date === today).reduce((n, h) => n + (h.durationSecs || 0), 0);
  const weekSecs = history.filter((h) => h.week === week).reduce((n, h) => n + (h.durationSecs || 0), 0);
  const avgSecs = history.length ? Math.round(history.reduce((n, h) => n + (h.durationSecs || 0), 0) / history.length) : 0;
  const sortedDays = [...new Set(history.map((h) => h.date))].sort();
  let streak = 0;
  let longest = 0;
  let prev = null;
  sortedDays.forEach((day) => {
    if (!prev) streak = 1;
    else streak = ((new Date(day) - new Date(prev)) / 86400000 === 1) ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    prev = day;
  });
  return { todaySecs, weekSecs, avgSecs, longestStreak: longest };
}

function renderSparkline() {
  const svg = document.getElementById('studySparkline');
  if (!svg) return;
  const points = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const secs = (APP.local.studyHistory || []).filter((h) => h.date === key).reduce((n, h) => n + (h.durationSecs || 0), 0);
    points.push(Math.round(secs / 60));
  }
  const max = Math.max(1, ...points);
  const coords = points.map((v, i) => {
    const x = (i / 6) * 320;
    const y = 72 - ((v / max) * 64);
    return x + ',' + y;
  }).join(' ');
  svg.innerHTML = '<polyline points="' + coords + '" fill="none" stroke="url(#sparkGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
    '<defs><linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#667eea"/><stop offset="100%" stop-color="#764ba2"/></linearGradient></defs>';
}

function updateProgressMotivation(hours, goal) {
  const node = document.getElementById('studyProgressMotivation');
  if (!node) return;
  if (hours >= goal) node.textContent = '🎉 Goal complete!';
  else if (hours >= goal * 0.5) node.textContent = '🔥 Halfway there!';
  else if (hours >= 1) node.textContent = '⚡ Momentum building';
  else node.textContent = 'Keep going';
}

function renderStudyStatsAndHistory() {
  const stats = buildStudyStats();
  const statsPanel = document.getElementById('studyStatsPanel');
  if (statsPanel) {
    statsPanel.innerHTML =
      '<div class="metric-card"><div class="metric-value">' + fmtDur(stats.todaySecs) + '</div><div class="metric-label">Today</div></div>' +
      '<div class="metric-card"><div class="metric-value">' + fmtDur(stats.weekSecs) + '</div><div class="metric-label">This Week</div></div>' +
      '<div class="metric-card"><div class="metric-value">' + fmtDur(stats.avgSecs) + '</div><div class="metric-label">Avg Session</div></div>' +
      '<div class="metric-card"><div class="metric-value">' + stats.longestStreak + '</div><div class="metric-label">Streak (days)</div></div>';
  }
  const history = document.getElementById('studyHistoryList');
  if (history) {
    if (!APP.local.studyHistory.length) {
      history.innerHTML = '<div class="empty-state"><div class="empty-text">No sessions yet</div></div>';
    } else {
      history.innerHTML = APP.local.studyHistory.slice(0, 20).map((item) => {
        const tags = (item.tagList || []).join(', ') || 'General';
        return '<details class="timeline-item"><summary><span class="timeline-duration">' + fmtDur(item.durationSecs) + '</span><span class="timeline-date">' + esc(item.date) + '</span><span class="timeline-tags">' + esc(tags) + '</span></summary><div class="timeline-note">' + esc(item.noteFull || item.notePreview || '') + '</div></details>';
      }).join('');
    }
  }
  const progressFill = document.getElementById('studyProgressFill');
  const progressLabel = document.getElementById('studyProgressLabel');
  const goal = APP.local.studySettings.dailyGoalHours || 4;
  const todayHours = +(stats.todaySecs / 3600).toFixed(2);
  const pct = Math.max(0, Math.min(100, Math.round((todayHours / goal) * 100)));
  if (progressFill) progressFill.style.width = pct + '%';
  if (progressLabel) progressLabel.textContent = todayHours.toFixed(2) + 'h / ' + goal + 'h';
  updateProgressMotivation(todayHours, goal);
  renderSparkline();
}

function markdownToHtml(md) {
  let out = String(md || '');
  out = esc(out);
  out = out.replace(/^###\s(.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^##\s(.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^#\s(.+)$/gm, '<h1>$1</h1>');
  out = out.replace(/^\-\s(.+)$/gm, '<li>$1</li>');
  out = out.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.replace(/\b(function|const|let|return|if|else|for|class|import|export)\b/g, '<span class="code-kw">$1</span>') + '</code></pre>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

function updateLineNumbers() {
  const editor = document.getElementById('studyNoteEditor');
  const gutter = document.getElementById('studyLineNumbers');
  if (!editor || !gutter) return;
  const lines = (editor.value.split('\n').length || 1);
  gutter.innerHTML = Array.from({ length: lines }, (_, i) => '<span>' + (i + 1) + '</span>').join('');
  gutter.scrollTop = editor.scrollTop;
}

function updateStudyPreview() {
  const editor = document.getElementById('studyNoteEditor');
  const preview = document.getElementById('studyNotePreview');
  if (!editor || !preview) return;
  preview.innerHTML = markdownToHtml(editor.value);
  updateLineNumbers();
}

function saveStudyNote() {
  const editor = document.getElementById('studyNoteEditor');
  if (!editor) return;
  APP.local.studyCurrentNote.content = editor.value;
  APP.local.studyCurrentNote.updatedAt = new Date().toISOString();
  save();
  updateStudyPreview();
  toast('Study note saved', 'info');
}

function formatStudyNote(type) {
  const editor = document.getElementById('studyNoteEditor');
  if (!editor) return;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || 'text';
  let wrap = selected;
  if (type === 'bold') wrap = '**' + selected + '**';
  if (type === 'italic') wrap = '*' + selected + '*';
  if (type === 'h2') wrap = '## ' + selected;
  if (type === 'ul') wrap = '- ' + selected;
  editor.setRangeText(wrap, start, end, 'end');
  updateStudyPreview();
}

function insertCodeBlock() {
  const editor = document.getElementById('studyNoteEditor');
  if (!editor) return;
  editor.setRangeText('\n```\nconst example = true;\n```\n', editor.selectionStart, editor.selectionEnd, 'end');
  updateStudyPreview();
}

function exportStudyNote(kind) {
  const note = (document.getElementById('studyNoteEditor') || {}).value || '';
  const now = new Date();
  const stats = buildStudyStats();
  const meta = '\n\n---\nExported: ' + now.toISOString() + '\nToday: ' + fmtDur(stats.todaySecs) + '\nSession Type: ' + phaseLabel(studyPhase) + '\n';
  if (kind === 'pdf') {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<html><head><title>Study Note Export</title></head><body><pre style="white-space:pre-wrap;font-family:monospace">' + esc(note + meta) + '</pre></body></html>');
    win.document.close();
    win.print();
    return;
  }
  const content = kind === 'txt' ? note.replace(/[#*_`>-]/g, '') + meta : note + meta;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'study-note-' + now.toISOString().slice(0, 10) + '.' + (kind === 'txt' ? 'txt' : 'md');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function addStudyTask() {
  const input = document.getElementById('studyTaskInput');
  const prioritySelect = document.getElementById('studyTaskPriority');
  if (!input || !input.value.trim()) return;
  APP.local.studyTasks.unshift({ id: uid(), text: input.value.trim(), done: false, priority: (prioritySelect || {}).value || 'medium' });
  input.value = '';
  save();
  renderStudyTasks();
}

function toggleStudyTask(id) {
  const task = APP.local.studyTasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  save();
  renderStudyTasks();
}

function removeStudyTask(id) {
  APP.local.studyTasks = APP.local.studyTasks.filter((t) => t.id !== id);
  save();
  renderStudyTasks();
}

function dragStartTask(id) {
  window.__dragTaskId = id;
}

function dragOverTask(e) {
  e.preventDefault();
}

function dropTask(targetId) {
  const dragId = window.__dragTaskId;
  if (!dragId || dragId === targetId) return;
  const list = APP.local.studyTasks;
  const from = list.findIndex((t) => t.id === dragId);
  const to = list.findIndex((t) => t.id === targetId);
  if (from === -1 || to === -1) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  save();
  renderStudyTasks();
  window.__dragTaskId = null;
}

function renderStudyTasks() {
  const list = document.getElementById('studyTaskList');
  if (!list) return;
  if (!APP.local.studyTasks.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-text">No tasks yet</div></div>';
    return;
  }
  list.innerHTML = APP.local.studyTasks.map((t) => '<div class="study-task-item ' + (t.done ? 'done' : '') + '" draggable="true" ondragstart="dragStartTask(' + t.id + ')" ondragover="dragOverTask(event)" ondrop="dropTask(' + t.id + ')"><button class="check-btn" onclick="toggleStudyTask(' + t.id + ')">' + (t.done ? '✓' : '') + '</button><span class="priority-dot ' + (t.priority || 'medium') + '"></span><span class="task-text">' + esc(t.text) + '</span><button class="btn btn-danger btn-sm" onclick="removeStudyTask(' + t.id + ')">✕</button></div>').join('');
}

function initAmbientContext() {
  if (!ambientContext) ambientContext = new (window.AudioContext || window.webkitAudioContext)();
  if (ambientContext.state === 'suspended') ambientContext.resume().catch(() => {});
  return ambientContext;
}

function stopAmbient() {
  ambientNodes.forEach((n) => {
    try { if (n.stop) n.stop(); } catch (_) {}
    try { if (n.disconnect) n.disconnect(); } catch (_) {}
  });
  ambientNodes = [];
}

function createNoiseSource(ctx, gainValue, filterType, filterFreq) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  ambientNodes.push(source, filter, gain);
}

function toggleAmbientPanel(forceClose) {
  const row = document.getElementById('ambientCardRow');
  const volPanel = document.getElementById('ambientVolumePanel');
  const header = document.getElementById('ambientCollapseHeader');
  if (!row || !header) return;
  const expanded = forceClose ? true : header.getAttribute('aria-expanded') === 'true';
  header.setAttribute('aria-expanded', String(!expanded));
  row.classList.toggle('ambient-expanded', !expanded);
  if (volPanel) volPanel.classList.toggle('ambient-vol-expanded', !expanded);
}

function syncAmbientUI() {
  const mode = APP.local.studySettings.ambientMode || 'off';
  document.querySelectorAll('.ambient-card').forEach((card) => card.classList.toggle('active', card.getAttribute('data-mode') === mode));
  const text = document.getElementById('ambientPlayingText');
  if (text) text.textContent = mode === 'off' ? 'Not playing' : 'Now playing: ' + mode;
  const eq = document.querySelector('.eq-bars');
  if (eq) eq.classList.toggle('active', mode !== 'off');
  const subtitle = document.getElementById('ambientCollapseSubtitle');
  if (subtitle) {
    const labels = { white: 'White Noise', rain: 'Rain', lofi: 'Lo-fi Tone', off: 'Off' };
    subtitle.textContent = labels[mode] || mode;
  }
  // sync volume slider display
  const vol = APP.local.studySettings.ambientVolume || 30;
  const slider = document.getElementById('ambientVolume');
  if (slider) { slider.value = vol; slider.style.setProperty('--pct', vol + '%'); }
  const volVal = document.getElementById('ambientVolumeVal');
  if (volVal) volVal.textContent = vol + '%';
}

function setAmbientMode(mode) {
  APP.local.studySettings.ambientMode = mode;
  save();
  // collapse the panel after selection
  toggleAmbientPanel(true);
  stopAmbient();
  if (mode !== 'off') {
    const ctx = initAmbientContext();
    const vol = (APP.local.studySettings.ambientVolume || 30) / 100;
    if (mode === 'white') createNoiseSource(ctx, 0.08 * vol, 'highpass', 250);
    if (mode === 'rain') createNoiseSource(ctx, 0.1 * vol, 'bandpass', 1100);
    if (mode === 'lofi') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 110;
      gain.gain.value = 0.03 * vol;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      ambientNodes.push(osc, gain);
      createNoiseSource(ctx, 0.03 * vol, 'lowpass', 800);
    }
  }
  syncAmbientUI();
}

function setAmbientVolume(value) {
  const vol = Number(value) || 30;
  APP.local.studySettings.ambientVolume = vol;
  save();
  // update live track fill and label without restarting audio
  const slider = document.getElementById('ambientVolume');
  if (slider) slider.style.setProperty('--pct', vol + '%');
  const volVal = document.getElementById('ambientVolumeVal');
  if (volVal) volVal.textContent = vol + '%';
  const mode = APP.local.studySettings.ambientMode;
  if (mode && mode !== 'off') {
    // update gain live if nodes exist, else restart
    if (typeof ambientNodes !== 'undefined' && ambientNodes.length) {
      ambientNodes.forEach((n) => { if (n && n.gain) n.gain.value = vol / 100 * 0.1; });
    }
  }
}

function playStudyBeep() {
  try {
    const ctx = initAmbientContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.09;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (_) {}
}

function pulseButton(btn) {
  if (!btn) return;
  btn.classList.add('pulse');
  setTimeout(() => btn.classList.remove('pulse'), 260);
}

function initStudySplitter() {
  const wrap = document.getElementById('studySplitWrap');
  const splitter = document.getElementById('studySplitter');
  if (!wrap || !splitter) return;
  wrap.style.setProperty('--split', String(APP.local.studySettings.editorSplit || 50) + '%');
  let dragging = false;
  splitter.onmousedown = () => { dragging = true; document.body.classList.add('split-dragging'); };
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(30, Math.min(70, pct));
    wrap.style.setProperty('--split', clamped + '%');
    APP.local.studySettings.editorSplit = clamped;
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('split-dragging');
    save();
  });
}

function toggleNotesPane() {
  const card = document.querySelector('.study-notes-card');
  if (!card) return;
  card.classList.toggle('collapsed-mobile');
  const btn = document.getElementById('notesCollapseBtn');
  if (btn) btn.textContent = card.classList.contains('collapsed-mobile') ? 'Expand' : 'Collapse';
}

function celebrateGoal() {
  const root = document.getElementById('page-study');
  if (!root) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.animationDelay = (Math.random() * 0.4) + 's';
    piece.style.background = ['#6080ff', '#764ba2', '#3dd9a4', '#ffb84f'][i % 4];
    layer.appendChild(piece);
  }
  root.appendChild(layer);
  setTimeout(() => layer.remove(), 2200);
}

function initStudyRipple() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 450);
  });
}

function runStudyStaggerAnimation() {
  document.querySelectorAll('.study-card').forEach((card) => {
    const idx = Number(card.getAttribute('data-stagger') || 0);
    card.style.animationDelay = (idx * 100) + 'ms';
    card.classList.add('card-enter');
  });
}

function setupStudyKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const editable = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable);
    const onStudy = ((document.querySelector('.page.active') || {}).id === 'page-study');
    if (e.key.toLowerCase() === 'f' && !editable && onStudy) {
      e.preventDefault();
      toggleFocusMode();
    }
    if (e.code === 'Space' && !editable && onStudy) {
      e.preventDefault();
      toggleStudyTimer();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'n' && onStudy) {
      e.preventDefault();
      const editor = document.getElementById('studyNoteEditor');
      if (editor) {
        editor.value = '';
        APP.local.studyCurrentNote.content = '';
        save();
        updateStudyPreview();
      }
    }
    if (e.ctrlKey && e.key.toLowerCase() === 's' && onStudy) {
      e.preventDefault();
      saveStudyNote();
    }
  });
}

function renderStudyArea() {
  ensureStudyDefaults();
  applyStudyTheme();
  renderStudyPresets();
  renderStudyTasks();
  renderStudyStatsAndHistory();
  const workInput = document.getElementById('workInterval');
  const breakInput = document.getElementById('breakInterval');
  const longInput = document.getElementById('longBreakInterval');
  if (workInput) workInput.value = String(APP.local.studySettings.workMins);
  if (breakInput) breakInput.value = String(APP.local.studySettings.breakMins);
  if (longInput) longInput.value = String(APP.local.studySettings.longBreakMins);
  bindStudyIntervalSliders();
  const volume = document.getElementById('ambientVolume');
  if (volume) volume.value = String(APP.local.studySettings.ambientVolume || 30);
  const editor = document.getElementById('studyNoteEditor');
  if (editor) {
    editor.value = APP.local.studyCurrentNote.content || '';
    editor.oninput = () => {
      APP.local.studyCurrentNote.content = editor.value;
      updateStudyPreview();
    };
    editor.onscroll = () => updateLineNumbers();
  }
  const taskInput = document.getElementById('studyTaskInput');
  if (taskInput) {
    taskInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addStudyTask();
      }
    };
  }
  syncAmbientUI();
  if (APP.local.studySettings.ambientMode && APP.local.studySettings.ambientMode !== 'off') setAmbientMode(APP.local.studySettings.ambientMode);
  setStudyPhase(studyPhase || 'work');
  updateStudyPreview();
  initStudySplitter();
  runStudyStaggerAnimation();
}

function setupStudyArea() {
  ensureStudyDefaults();
  setStudyPhase('work');
  resetStudyTimer();
  if (noteAutosaveTimer) clearInterval(noteAutosaveTimer);
  noteAutosaveTimer = setInterval(() => {
    const editor = document.getElementById('studyNoteEditor');
    if (!editor) return;
    APP.local.studyCurrentNote.content = editor.value;
    APP.local.studyCurrentNote.updatedAt = new Date().toISOString();
    save();
  }, 30000);
  setupStudyKeyboardShortcuts();
  initStudyRipple();
}
