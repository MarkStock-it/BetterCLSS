function setupMobileTouchGuards() {
  if (window.innerWidth > 900) return;

  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchTarget = null;

  mainContent.addEventListener('touchstart', (event) => {
    if (!event.touches || event.touches.length !== 1) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchTarget = event.target;
  }, { passive: true });

  mainContent.addEventListener('touchend', (event) => {
    if (!touchTarget || !event.changedTouches || event.changedTouches.length !== 1) return;

    if (touchTarget.closest && touchTarget.closest('input, textarea, select, button, a, .assistant-shell, .modal-overlay, .nav-tabs, .cal-nav-btns, .study-btns, .pomo-controls')) {
      touchTarget = null;
      return;
    }

    const deltaX = event.changedTouches[0].clientX - touchStartX;
    const deltaY = event.changedTouches[0].clientY - touchStartY;

    touchTarget = null;

    if (Math.abs(deltaY) > 60) return;
    if (Math.abs(deltaX) < 70) return;

    if (deltaX < 0) swipeToPage('right');
    if (deltaX > 0) swipeToPage('left');
  }, { passive: true });
}

async function init() {
  initTheme();
  initAccentTheme();
  load();
  APP.ui.assignSort = localStorage.getItem('bclss_assign_sort') || 'smart';
  // The dashboard is always the first visible route. Authentication restores
  // unobtrusively after the app has rendered.
  switchPage('dashboard');
  setupStudyArea();
  sidebarCoursesCollapsed = localStorage.getItem('bclss_courses_collapsed') === '1';
  setSidebarCoursesCollapsed(sidebarCoursesCollapsed);
  setupPushNotifications();
  setupInstallPrompt();
  setupMobileTouchGuards();
  const topDate = document.getElementById('topDate');
  if (topDate) topDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('modalOverlay').classList.contains('open')) {
      closeModal();
    }
  });
  const assistantInput = document.getElementById('assistantInput');
  if (assistantInput) {
    assistantInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAssistantMessage();
      }
    });
  }
  addAssistantMessage('assistant', 'Hi, I can see your BetterCLSS dashboard context. Ask me what to prioritize, what is due soon, or how to study this week.');
  renderAll();
  const launchParams = new URLSearchParams(window.location.search);
  if (launchParams.get('connect') === '1') {
    window.setTimeout(showCanvasSetup, 0);
    launchParams.delete('connect');
    const cleanQuery = launchParams.toString();
    history.replaceState(null, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`);
  }
  if (CanvasAPI.getToken()) {
    const restored = await restoreUserSession();
    renderAll();
    if (restored) syncCanvas(true);
  }
}

init();
