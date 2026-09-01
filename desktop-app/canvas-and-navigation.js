function openModal(html, options = {}) {
  const modal = document.getElementById('modalContent');
  modal.className = 'modal';
  if (options.className) modal.classList.add(options.className);
  modal.innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
  document.body.classList.add('modal-open');
}
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  const video = overlay.querySelector('video');
  if (video) video.pause();
  overlay.classList.remove('open');
  document.body.classList.remove('modal-open');
  hideModalLoading();
}

function dueDays(dateStr) {
  if (!dateStr) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function dueChip(d) {
  if (d === null) return { cls: 'ok', text: 'No due date' };
  if (d < 0) return { cls: 'overdue', text: Math.abs(d) + 'd overdue' };
  if (d === 0) return { cls: 'urgent', text: 'Due today' };
  if (d <= 2) return { cls: 'soon', text: d + 'd left' };
  return { cls: 'ok', text: d + 'd left' };
}

function priorityForDate(dateStr) {
  const d = dueDays(dateStr);
  if (d === null) return 'low';
  if (d <= 1) return 'high';
  if (d <= 3) return 'medium';
  return 'low';
}

function autoCanvasDone(a) {
  const state = String(a.submissionState || '').toLowerCase();
  if (a.graded || a.submitted) return true;
  if (a.submittedAt) return true;
  if (state === 'submitted' || state === 'graded' || state === 'pending_review' || state === 'complete') return true;
  return false;
}

function allAssignments() {
  const local = APP.local.assignments.map(a => ({ id: 'l_' + a.id, source: 'local', localId: a.id, title: a.title, subject: a.subject, due: a.due, done: !!a.done, priority: a.priority || priorityForDate(a.due), url: null }));
  const overrides = APP.local.canvasOverrides || {};
  const canvas = APP.canvas.assignments
    .map((a) => {
      const override = overrides[a.id] || {};
      const done = typeof override.done === 'boolean' ? override.done : autoCanvasDone(a);
      return {
        id: a.id,
        source: 'canvas',
        title: a.title,
        subject: a.courseName || a.courseCode || 'Canvas',
        due: a.dueAt ? a.dueAt.split('T')[0] : null,
        done,
        manualDone: typeof override.done === 'boolean',
        priority: priorityForDate(a.dueAt || ''),
        url: a.canvasUrl,
      };
    });
  const all = [...canvas, ...local];
  all.sort((a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  });
  return all;
}

function assignmentDateValue(assignment) {
  if (!assignment.due) return Number.POSITIVE_INFINITY;
  const value = new Date(assignment.due + (assignment.due.length === 10 ? 'T00:00:00' : '')).getTime();
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function assignmentStatusBucket(assignment) {
  if (assignment.done) return 5;
  const days = dueDays(assignment.due);
  if (days !== null && days < 0) return 0;
  if (days === 0) return 1;
  if (days !== null && days <= 3) return 2;
  if (days !== null) return 3;
  return 4;
}

function sortAssignments(assignments, mode = 'smart') {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const rank = (assignment) => priorityRank[assignment.priority] ?? 3;
  const byDate = (a, b) => assignmentDateValue(a) - assignmentDateValue(b);
  const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  const byDone = (a, b) => Number(!!a.done) - Number(!!b.done);

  return [...assignments].sort((a, b) => {
    if (mode === 'title') return byTitle(a, b);
    if (mode === 'course') {
      return String(a.subject || '').localeCompare(String(b.subject || ''), undefined, { sensitivity: 'base' })
        || byDone(a, b)
        || byDate(a, b)
        || byTitle(a, b);
    }
    if (mode === 'priority') {
      return byDone(a, b) || rank(a) - rank(b) || byDate(a, b) || byTitle(a, b);
    }
    if (mode === 'due') {
      return byDone(a, b) || byDate(a, b) || rank(a) - rank(b) || byTitle(a, b);
    }
    if (mode === 'status') {
      return assignmentStatusBucket(a) - assignmentStatusBucket(b)
        || byDate(a, b)
        || rank(a) - rank(b)
        || byTitle(a, b);
    }

    // Smart order: unfinished overdue work, today, next three days,
    // later work, undated work, and finally completed work.
    const statusDifference = assignmentStatusBucket(a) - assignmentStatusBucket(b);
    if (statusDifference) return statusDifference;
    if (assignmentStatusBucket(a) <= 1) {
      return byDate(a, b) || rank(a) - rank(b) || byTitle(a, b);
    }
    return rank(a) - rank(b) || byDate(a, b) || byTitle(a, b);
  });
}

function allAnnouncements() {
  const timestamp = (announcement) => {
    const value = Date.parse(announcement.postedAt || announcement.createdAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  return [
    ...APP.canvas.announcements.map((announcement) => ({ ...announcement, canvas: true })),
    ...APP.local.announcements.map((announcement) => ({ ...announcement, canvas: false }))
  ].sort((a, b) => timestamp(b) - timestamp(a));
}

function updateConnectionStatus() {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('statusLabel');
  const banner = document.getElementById('connectBanner');
  if (APP.canvas.syncing) {
    dot.className = 'status-dot';
    label.textContent = 'Syncing...';
  } else if (APP.canvas.connected) {
    dot.className = 'status-dot connected';
    label.textContent = 'Canvas Connected';
    banner.style.display = 'none';
  } else {
    dot.className = 'status-dot';
    label.textContent = 'Connect Canvas';
    banner.style.display = '';
  }
}

function showCanvasSetup() {
  const domain = CanvasAPI.getDomain() || 'usc.instructure.com';
  const token = CanvasAPI.getToken() || '';
  const apiBase = CanvasAPI.getApiBase() || '';
  const tokenLocked = !!token;
  const tokenHelp = tokenLocked
    ? 'Token is locked. Disconnect Canvas to replace it.'
    : 'Token is stored only in your browser on this device.';
  const tokenAttrs = tokenLocked ? 'readonly aria-readonly="true"' : '';
  const tokenPlaceholder = tokenLocked ? 'Token is locked' : 'Paste your token';
  const saveLabel = tokenLocked ? 'Test Connection' : 'Save & Test';

  openModal('<div class="modal-title">Connect Canvas</div><div class="form-group"><label class="form-label">Canvas Domain</label><input id="canvasDomainInput" type="text" value="' + esc(domain) + '" placeholder="usc.instructure.com"></div><div class="form-group"><label class="form-label">Canvas Access Token</label><input id="canvasTokenInput" type="password" value="' + esc(token) + '" placeholder="' + esc(tokenPlaceholder) + '" ' + tokenAttrs + '></div><div class="form-group"><label class="form-label">Backend API URL (optional for static hosting)</label><input id="apiBaseInput" type="text" value="' + esc(apiBase) + '" placeholder="https://your-backend.onrender.com"></div><div class="form-group"><div style="font-size:0.78rem;color:var(--text-dim);line-height:1.5">' + esc(tokenHelp) + '</div></div><div class="modal-footer"><button class="btn btn-danger" onclick="disconnectCanvas()">Disconnect</button><button class="btn btn-secondary" onclick="closeModal()">Close</button><button class="btn btn-canvas" onclick="connectCanvas()">' + esc(saveLabel) + '</button></div>');
}

function showModalLoading(message) {
  const modal = document.getElementById('modalContent');
  if (!modal) return;
  let overlay = modal.querySelector('.modal-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-loading-overlay';
    overlay.innerHTML = '<div class="modal-loading-inner"><div class="modal-spinner"><span></span><span></span><span></span><span></span></div><div class="modal-loading-text" id="modalLoadingText"></div></div>';
    modal.appendChild(overlay);
  }
  const txt = overlay.querySelector('#modalLoadingText');
  if (txt) txt.textContent = message || 'Connecting…';
  // blur the modal content behind
  modal.classList.add('modal-is-loading');
}

function hideModalLoading() {
  const modal = document.getElementById('modalContent');
  if (!modal) return;
  modal.classList.remove('modal-is-loading');
  const overlay = modal.querySelector('.modal-loading-overlay');
  if (overlay) overlay.remove();
}

function getCanvasConnectReturnUrl() {
  const launchParams = new URLSearchParams(window.location.search);
  let storedReturn = '';
  try {
    storedReturn = localStorage.getItem('bclss_connect_return') || '';
  } catch (_) {}
  return launchParams.get('returnTo') === 'studenthub' || storedReturn === 'studenthub'
    ? './studenthub/index.html'
    : '';
}

async function connectCanvas() {
  const tokenInput = document.getElementById('canvasTokenInput');
  const domainInput = document.getElementById('canvasDomainInput');
  const apiBaseInput = document.getElementById('apiBaseInput');
  const returnUrl = getCanvasConnectReturnUrl();
  const existingToken = CanvasAPI.getToken() || '';
  const token = existingToken || (tokenInput ? tokenInput.value.trim() : '');
  const domain = domainInput ? domainInput.value.trim() : 'usc.instructure.com';
  const apiBase = apiBaseInput ? apiBaseInput.value.trim() : '';
  if (!token) {
    toast('Paste your Canvas token first.', 'warn');
    return;
  }

  showModalLoading('Connecting to Canvas…');
  try {
    // ===== USER IDENTITY FLOW START =====
    // 1. Authenticate user with Canvas token
    // Backend verifies token and returns Canvas user ID
    const authResult = await UserAuth.authenticateUser(token, domain, apiBase);
    
    // 2. User is now authenticated with Canvas identity
    // Load their previously saved BetterCLSS data
    CanvasAPI.saveCredentials(token, domain);
    CanvasAPI.setApiBase(apiBase);
    localStorage.setItem('bclss_student_name', authResult.name || '');
    localStorage.setItem('bclss_student_id', String(authResult.userId || ''));
    mergeLocalData(authResult.localData);
    mergeCanvasData(authResult.canvasData);
    
    hideModalLoading();
    closeModal();
    toast('Connected as ' + authResult.name, 'success');
    switchPage('dashboard');
    
    // 3. Auto-sync Canvas data and save to backend
    await syncCanvas();
    // ===== USER IDENTITY FLOW END =====

    if (returnUrl) {
      try {
        localStorage.removeItem('bclss_connect_return');
      } catch (_) {}
      window.location.replace(returnUrl);
    }
  } catch (err) {
    hideModalLoading();
    const details = err && err.message ? err.message : 'Unknown connection error';
    toast('Connection failed: ' + details, 'error');
  }
}

async function disconnectCanvas() {
  clearTimeout(remoteSaveTimer);
  remoteSavePending = false;
  CanvasAPI.clearCredentials();
  localStorage.removeItem('bclss_canvas_cache');
  localStorage.removeItem('bclss_student_name');
  localStorage.removeItem('bclss_student_id');
  APP.canvas.connected = false;
  APP.canvas.assignments = [];
  APP.canvas.announcements = [];
  APP.canvas.grades = [];
  APP.canvas.courses = [];
  
  // Clear only the local authenticated session, but keep saved user data intact.
  if (typeof UserAuth !== 'undefined' && typeof UserAuth.clearSession === 'function') {
    UserAuth.clearSession();
  }
  
  closeModal();
  renderAll();
  toast('Canvas disconnected on this device.', 'info');
}

async function restoreUserSession() {
  const token = CanvasAPI.getToken();
  if (!token) return false;
  const domain = CanvasAPI.getDomain();
  const apiBase = CanvasAPI.getApiBase();

  try {
    const authResult = await UserAuth.authenticateUser(token, domain, apiBase);
    localStorage.setItem('bclss_student_name', authResult.name || '');
    localStorage.setItem('bclss_student_id', String(authResult.userId || ''));
    mergeLocalData(authResult.localData);
    mergeCanvasData(authResult.canvasData);
    APP.canvas.connected = true;
    updateDashboardWelcome();
    return true;
  } catch (err) {
    console.debug('User session restore failed:', err && err.message ? err.message : err);
    return false;
  }
}

async function syncCanvas(fromStartup = false) {
  if (!CanvasAPI.getToken()) {
    if (!fromStartup) showCanvasSetup();
    return false;
  }
  if (APP.canvas.syncing) return false;

  APP.canvas.syncing = true;
  updateConnectionStatus();
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) syncBtn.textContent = 'Syncing...';
  const dashboardSyncBtn = document.getElementById('dashboardSyncBtn');
  if (dashboardSyncBtn) dashboardSyncBtn.textContent = 'Syncing…';

  try {
    const [assignments, announcements, grades] = await Promise.all([CanvasAPI.getAllAssignments(), CanvasAPI.getAllAnnouncements(), CanvasAPI.getGrades()]);
    APP.canvas.assignments = assignments;
    APP.canvas.announcements = announcements;
    APP.canvas.grades = grades;
    APP.canvas.courses = [...new Map(assignments.map(a => [a.courseId, { name: a.courseName || a.courseCode || 'Course' }])).values()];
    APP.canvas.connected = true;
    try {
      localStorage.setItem('bclss_canvas_cache', JSON.stringify({
        assignments: APP.canvas.assignments,
        announcements: APP.canvas.announcements,
        grades: APP.canvas.grades,
        courses: APP.canvas.courses,
        savedAt: new Date().toISOString()
      }));
    } catch (cacheError) {
      console.debug('Canvas browser cache could not be updated:', cacheError);
    }
    
    // ===== SAVE CANVAS SYNC TO BACKEND =====
    // After successful sync, save Canvas data to user's backend record
    const user = UserAuth.getCurrentUser();
    if (user.id) {
      try {
        const apiBase = CanvasAPI.getApiBase();
        await UserAuth.saveCanvasSync(user.id, {
          assignments: APP.canvas.assignments,
          announcements: APP.canvas.announcements,
          grades: APP.canvas.grades,
          courses: APP.canvas.courses
        }, apiBase);
      } catch (err) {
        console.error('Failed to save Canvas sync to backend:', err.message);
        // Continue anyway - user data is still available locally
      }
    }
    // ===== END SAVE CANVAS SYNC =====
    
    toast('Canvas sync complete', 'success');
    return true;
  } catch (_) {
    APP.canvas.connected = false;
    toast(fromStartup ? 'Canvas could not sync in the background.' : 'Canvas sync failed. Check your connection or token.', 'error');
    return false;
  } finally {
    APP.canvas.syncing = false;
    if (syncBtn) syncBtn.textContent = 'Sync';
    if (dashboardSyncBtn) dashboardSyncBtn.textContent = 'Sync Canvas';
    renderAll();
  }
}

function switchPage(page, tab) {
  const targetPage = document.getElementById('page-' + page);
  if (!targetPage) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.removeAttribute('aria-current'));
  targetPage.classList.add('active');
  if (tab) tab.classList.add('active');
  document.querySelectorAll('[data-page="' + page + '"]').forEach((navTab) => {
    navTab.classList.add('active');
    navTab.setAttribute('aria-current', 'page');
  });
  if (['grades', 'announcements', 'resources', 'settings'].includes(page)) {
    const moreTab = document.getElementById('mobileMoreTab');
    if (moreTab) {
      moreTab.classList.add('active');
      moreTab.setAttribute('aria-current', 'page');
    }
  }

  const mobileTab = document.querySelector('.nav-tabs [data-page="' + page + '"]');
  if (mobileTab && mobileTab.scrollIntoView) {
    mobileTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  if (window.location.hash !== '#' + page) {
    history.replaceState(null, '', '#' + page);
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  renderPage(page);
}

function openMobilePage(page) {
  closeModal();
  switchPage(page);
}

function openMobileMoreMenu() {
  const activePage = ((document.querySelector('.page.active') || {}).id || '').replace('page-', '');
  const items = [
    { page: 'grades', icon: '↗', title: 'Grades', hint: 'Scores and grade log' },
    { page: 'announcements', icon: '◉', title: 'News', hint: 'Course announcements' },
    { page: 'resources', icon: '⌁', title: 'Links', hint: 'Saved resources' },
    { page: 'settings', icon: '⚙', title: 'Settings', hint: 'Canvas and preferences' }
  ];
  const markup = items.map((item) => {
    const current = item.page === activePage ? ' current' : '';
    return '<button type="button" class="mobile-more-item' + current + '" onclick="openMobilePage(\'' + item.page + '\')"><span class="mobile-more-icon">' + item.icon + '</span><span><strong>' + item.title + '</strong><small>' + item.hint + '</small></span><span class="mobile-more-arrow">›</span></button>';
  }).join('');
  openModal('<div class="mobile-more-head"><div><div class="modal-title">More</div><p>Everything else, organized in one place.</p></div><button type="button" class="assistant-close" onclick="closeModal()" aria-label="Close">×</button></div><div class="mobile-more-grid">' + markup + '</div>', { className: 'mobile-more-modal' });
}

function switchStudyPanel(panel, button) {
  const validPanels = ['timer', 'notes', 'tasks', 'progress'];
  const next = validPanels.includes(panel) ? panel : 'timer';
  localStorage.setItem('bclss_study_mobile_panel', next);
  document.querySelectorAll('[data-study-tab]').forEach((tab) => {
    const selected = tab.getAttribute('data-study-tab') === next;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  document.querySelectorAll('[data-study-panel]').forEach((section) => {
    section.classList.toggle('mobile-active', section.getAttribute('data-study-panel') === next);
  });
  if (button && window.innerWidth <= 900) {
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function swipeToPage(direction) {
  const activeId = ((document.querySelector('.page.active') || {}).id || 'page-dashboard').replace('page-', '');
  const currentIndex = MOBILE_PAGE_ORDER.indexOf(activeId);
  if (currentIndex === -1) return;

  const nextIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= MOBILE_PAGE_ORDER.length) return;

  const nextPage = MOBILE_PAGE_ORDER[nextIndex];
  const nextTab = document.querySelector('[data-page="' + nextPage + '"]');
  switchPage(nextPage, nextTab || undefined);
}

function renderPage(page) {
  if (page === 'dashboard') renderDashboard();
  if (page === 'assignments') renderAssignments();
  if (page === 'calendar') renderCalendar();
  if (page === 'grades') renderGrades();
  if (page === 'announcements') renderAnnouncements();
  if (page === 'study') {
    renderStudyArea();
    switchStudyPanel(localStorage.getItem('bclss_study_mobile_panel') || 'timer');
  }
  if (page === 'resources') renderLinks();
  if (page === 'settings') {
    updateInstallButtonState();
    syncAccentControls();
    if (typeof updateNotificationUi === 'function') updateNotificationUi();
  }
}
