const APP = {
  local: {
    assignments: [],
    grades: [],
    notes: [],
    studyTasks: [],
    studyHistory: [],
    studyDecks: [],
    studyCurrentNote: {
      content: '',
      updatedAt: null
    },
    studySettings: {
      workMins: 25,
      breakMins: 5,
      longBreakMins: 15,
      dailyGoalHours: 4,
      ambientMode: 'off',
      ambientVolume: 30,
      studyTheme: 'dark'
    },
    events: [],
    announcements: [],
    canvasOverrides: {},
    links: [],
    studyHours: 0,
    studyGoal: 4,
    pomoSessions: 0,
    nextId: 100
  },
  canvas: {
    assignments: [],
    announcements: [],
    grades: [],
    courses: [],
    connected: false,
    syncing: false
  },
  ui: {
    assignFilter: 'all',
    assignSort: 'smart',
    searchQuery: '',
    calMonth: new Date().getMonth(),
    calYear: new Date().getFullYear(),
    selectedDate: null
  },
  ai: {
    open: false,
    sending: false,
    messages: []
  }
};

let studyTimer = null;
let studyTimerSecs = 25 * 60;
let studyTimerRunning = false;
let studyPhase = 'work';
let studyCompletedCycles = 0;
let sessionStartedAt = null;
let sessionFocusSecs = 0;
let noteAutosaveTimer = null;
let ambientContext = null;
let ambientNodes = [];
let deferredInstallPrompt = null;
let remoteSaveTimer = null;
let remoteSaveInFlight = false;
let remoteSavePending = false;
let sidebarCoursesCollapsed = false;
let studyFocusMode = false;
const ACCENT_STORAGE_KEY = 'bclss_accent';
const TUTORIAL_SKIP_KEY = 'bclss_tutorial_skip';
const STUDY_INTERVALS_STORAGE_KEY = 'bclss_study_intervals';
const BUILT_IN_TUTORIAL_VIDEO_URLS = [
  'assets/tutorial/tutorial.mp4',
  'assets/tutorial/tutorial.mov',
  'assets/tutorial/Screen Recording 2026-04-28 at 10.57.01 AM.mov',
  'assets/tutorial/Screen Recording 2026-04-28 at 10.57.01 AM.mov'
];
const DEFAULT_ACCENT = '#6080ff';
const MOBILE_PAGE_ORDER = ['dashboard', 'assignments', 'calendar', 'study'];

// Save instantly on-device, then coalesce server writes to avoid one request per keystroke.
function save() {
  try {
    localStorage.setItem('bclss_local', JSON.stringify(APP.local));
  } catch (err) {
    toast('This browser could not save your latest change.', 'error');
    console.error('Local save failed:', err);
  }
  scheduleRemoteSave();
}

function scheduleRemoteSave() {
  const user = UserAuth.getCurrentUser();
  if (!user.id) return;
  remoteSavePending = true;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(flushRemoteSave, 700);
}

async function flushRemoteSave() {
  if (remoteSaveInFlight || !remoteSavePending) return;
  const user = UserAuth.getCurrentUser();
  if (!user.id) return;
  remoteSavePending = false;
  remoteSaveInFlight = true;
  try {
    await UserAuth.saveUserData(user.id, APP.local, CanvasAPI.getApiBase());
  } catch (err) {
    console.debug('Background save to backend failed:', err.message);
  } finally {
    remoteSaveInFlight = false;
    if (remoteSavePending) {
      clearTimeout(remoteSaveTimer);
      remoteSaveTimer = setTimeout(flushRemoteSave, 2000);
    }
  }
}

function mergeLocalData(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;
  const defaults = APP.local;
  APP.local = {
    ...defaults,
    ...incoming,
    studySettings: { ...defaults.studySettings, ...(incoming.studySettings || {}) },
    studyCurrentNote: { ...defaults.studyCurrentNote, ...(incoming.studyCurrentNote || {}) },
    assignments: Array.isArray(incoming.assignments) ? incoming.assignments : defaults.assignments,
    grades: Array.isArray(incoming.grades) ? incoming.grades : defaults.grades,
    notes: Array.isArray(incoming.notes) ? incoming.notes : defaults.notes,
    studyTasks: Array.isArray(incoming.studyTasks) ? incoming.studyTasks : defaults.studyTasks,
    studyHistory: Array.isArray(incoming.studyHistory) ? incoming.studyHistory : defaults.studyHistory,
    studyDecks: Array.isArray(incoming.studyDecks) ? incoming.studyDecks : defaults.studyDecks,
    events: Array.isArray(incoming.events) ? incoming.events : defaults.events,
    announcements: Array.isArray(incoming.announcements) ? incoming.announcements : defaults.announcements,
    links: Array.isArray(incoming.links) ? incoming.links : defaults.links,
    canvasOverrides: incoming.canvasOverrides && typeof incoming.canvasOverrides === 'object'
      ? incoming.canvasOverrides
      : defaults.canvasOverrides
  };
}

function mergeCanvasData(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  APP.canvas = {
    ...APP.canvas,
    ...incoming,
    assignments: Array.isArray(incoming.assignments) ? incoming.assignments : [],
    announcements: Array.isArray(incoming.announcements) ? incoming.announcements : [],
    grades: Array.isArray(incoming.grades) ? incoming.grades : [],
    courses: Array.isArray(incoming.courses) ? incoming.courses : [],
    syncing: false
  };
}

function load() {
  try {
    const raw = localStorage.getItem('bclss_local');
    if (raw) mergeLocalData(JSON.parse(raw));
  } catch (err) {
    console.warn('Ignoring invalid local app data:', err);
  }
}
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('bclss_theme', next);
  setThemeIcon(next);
  updateThemeChrome(next);
}
function updateThemeChrome(theme) {
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', theme === 'light' ? '#f1f3fb' : '#0c0e18');
  document.documentElement.style.colorScheme = theme;
}
function setThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  if (theme === 'light') {
    // moon icon for switching to dark
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    // sun icon for switching to light
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}
function initTheme() {
  const saved = localStorage.getItem('bclss_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  setThemeIcon(saved);
  updateThemeChrome(saved);
}
function normalizeAccent(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  return null;
}

function shadeColor(hex, percent) {
  const clean = normalizeAccent(hex) || DEFAULT_ACCENT;
  const num = parseInt(clean.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + (r * 0x10000) + (g * 0x100) + b).toString(16).slice(1);
}

function syncAccentControls() {
  const current = normalizeAccent(localStorage.getItem(ACCENT_STORAGE_KEY)) || DEFAULT_ACCENT;
  const picker = document.getElementById('accentColorPicker');
  const hex = document.getElementById('accentHexValue');
  if (picker) picker.value = current;
  if (hex) hex.textContent = current;

  document.querySelectorAll('[data-accent]').forEach((btn) => {
    const swatch = normalizeAccent(btn.getAttribute('data-accent'));
    btn.style.borderColor = swatch === current ? 'var(--text)' : 'var(--border)';
  });
}

function applyAccentColor(accent) {
  const root = document.documentElement;
  const clean = normalizeAccent(accent) || DEFAULT_ACCENT;
  root.style.setProperty('--accent', clean);
  root.style.setProperty('--accent-hover', shadeColor(clean, -12));
}

function setAccentColor(accent, showToast = true) {
  const clean = normalizeAccent(accent);
  if (!clean) return;
  localStorage.setItem(ACCENT_STORAGE_KEY, clean);
  applyAccentColor(clean);
  syncAccentControls();
  if (showToast) toast('Accent updated', 'success');
}

function resetAccentColor() {
  localStorage.removeItem(ACCENT_STORAGE_KEY);
  applyAccentColor(DEFAULT_ACCENT);
  syncAccentControls();
  toast('Accent reset', 'info');
}

function initAccentTheme() {
  const saved = normalizeAccent(localStorage.getItem(ACCENT_STORAGE_KEY)) || DEFAULT_ACCENT;
  applyAccentColor(saved);
  localStorage.setItem(ACCENT_STORAGE_KEY, saved);
  syncAccentControls();
}
async function installApp() {
  if (!deferredInstallPrompt) {
    toast('Install is not available yet on this browser/page.', 'info');
    return;
  }

  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result && result.outcome === 'accepted') {
    toast('BetterCLSS installed.', 'success');
  } else {
    toast('Install canceled.', 'warn');
  }

  deferredInstallPrompt = null;
  updateInstallButtonState();
}

function isIosSafari() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isWebKit && !isOtherIOSBrowser;
}

function updateInstallButtonState() {
  const installBtn = document.getElementById('installAppBtn');
  const status = document.getElementById('installStatusText');
  const iosHint = document.getElementById('iosInstallHint');
  if (!installBtn) return;

  const inStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (inStandalone) {
    installBtn.disabled = true;
    installBtn.textContent = 'Installed';
    if (status) status.textContent = 'App is already installed on this device.';
    if (iosHint) iosHint.style.display = 'none';
    return;
  }

  if (isIosSafari()) {
    installBtn.disabled = true;
    installBtn.textContent = 'Install BetterCLSS';
    if (status) status.textContent = 'Use Safari Share menu to install.';
    if (iosHint) iosHint.style.display = 'block';
    return;
  }

  if (iosHint) iosHint.style.display = 'none';

  if (deferredInstallPrompt) {
    installBtn.disabled = false;
    installBtn.textContent = 'Install BetterCLSS';
    if (status) status.textContent = 'Install is ready.';
  } else {
    installBtn.disabled = true;
    installBtn.textContent = 'Install BetterCLSS';
    if (status) status.textContent = 'Install prompt not available yet. Use HTTPS and refresh once.';
  }
}

function setSidebarCoursesCollapsed(collapsed) {
  sidebarCoursesCollapsed = !!collapsed;
  localStorage.setItem('bclss_courses_collapsed', sidebarCoursesCollapsed ? '1' : '0');

  const wrap = document.getElementById('sidebarCoursesWrap');
  const caret = document.getElementById('sidebarCoursesCaret');
  if (wrap) wrap.style.display = sidebarCoursesCollapsed ? 'none' : '';
  if (caret) caret.textContent = sidebarCoursesCollapsed ? '▸' : '▾';
}

function toggleSidebarCourses() {
  setSidebarCoursesCollapsed(!sidebarCoursesCollapsed);
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButtonState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtonState();
  });
  updateInstallButtonState();
}

function resetTutorialSkip() {
  localStorage.removeItem(TUTORIAL_SKIP_KEY);
  toast('Tutorial will show on next app open.', 'info');
}

function skipTutorial() {
  localStorage.setItem(TUTORIAL_SKIP_KEY, '1');
  closeModal();
}

function hasCanvasConnection() {
  return !!APP.canvas.connected;
}

async function firstReachableTutorialUrl() {
  for (const path of BUILT_IN_TUTORIAL_VIDEO_URLS) {
    const url = encodeURI(path);
    try {
      const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1' } });
      if (resp.ok || resp.status === 206) return url;
    } catch (_) {
      // Continue trying fallbacks.
    }
  }
  return null;
}

async function initTutorialVideoPlayback() {
  const video = document.getElementById('tutorialVideo');
  const hint = document.getElementById('tutorialVideoHint');
  if (!video || !hint) return;

  const url = await firstReachableTutorialUrl();
  if (!url) {
    hint.textContent = 'Tutorial file not found. Add assets/tutorial/tutorial.mp4 for best compatibility.';
    hint.style.display = 'block';
    return;
  }

  hint.style.display = 'none';
  video.addEventListener('error', () => {
    hint.textContent = 'Video file was found but this browser could not decode it. Convert it to H.264 .mp4 and save as assets/tutorial/tutorial.mp4.';
    hint.style.display = 'block';
  }, { once: true });

  video.src = url;
  video.load();
}

function openTutorialModal(forceOpen = false) {
  const connected = hasCanvasConnection();

  if (!forceOpen) {
    // Auto show every app open while Canvas is not connected.
    if (!connected) {
      localStorage.removeItem(TUTORIAL_SKIP_KEY);
    } else {
      // Once Canvas is connected, suppress auto tutorial.
      return;
    }
  }

  const videoMarkup = '<video id="tutorialVideo" class="tutorial-video" controls playsinline preload="metadata">Your browser does not support embedded video.</video><div id="tutorialVideoHint" class="tutorial-empty" style="display:none;margin-top:10px"></div>';

  openModal('<div class="modal-title">Welcome Tutorial</div><div class="tutorial-copy">Watch this quick walkthrough to get started.</div>' + videoMarkup + '<div class="modal-footer tutorial-actions"><button class="btn btn-secondary" onclick="skipTutorial()">Skip Tutorial</button><button class="btn btn-primary" onclick="closeModal()">Close</button></div>', { className: 'tutorial-modal' });
  initTutorialVideoPlayback();
}

function getAiApiKey() { return localStorage.getItem('bclss_ai_key') || ''; }
function saveAiApiKey() { const v = (document.getElementById('aiKeyInput') || {}).value || ''; if (v.trim()) { localStorage.setItem('bclss_ai_key', v.trim()); } else { localStorage.removeItem('bclss_ai_key'); } }
function toggleAiKeyRow() { const row = document.getElementById('assistantKeyRow'); if (!row) return; const open = row.style.display === 'none'; row.style.display = open ? '' : 'none'; if (open) { const inp = document.getElementById('aiKeyInput'); if (inp) { inp.value = getAiApiKey(); inp.focus(); } } }
function uid() {
  APP.local.nextId = Math.max(100, Number(APP.local.nextId) || 100) + 1;
  return APP.local.nextId;
}
function todayISO() { return new Date().toISOString().split('T')[0]; }
function daysFromToday(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function jsQuote(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
