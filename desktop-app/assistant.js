function addAssistantMessage(role, content) {
  APP.ai.messages.push({ role, content: String(content || '') });
  if (APP.ai.messages.length > 30) APP.ai.messages = APP.ai.messages.slice(-30);
  renderAssistantMessages();
}

function renderAssistantMessages() {
  const box = document.getElementById('assistantMessages');
  if (!box) return;

  if (!APP.ai.messages.length) {
    box.innerHTML = '<div class="assistant-empty">Ask things like: "What is due soon?" or "How do I catch up this week?"</div>';
    return;
  }

  box.innerHTML = APP.ai.messages.map((m) => {
    const cls = m.role === 'assistant' ? 'assistant-msg assistant' : 'assistant-msg user';
    return '<div class="' + cls + '">' + esc(m.content).replace(/\n/g, '<br>') + '</div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function toggleAssistant(forceState) {
  APP.ai.open = typeof forceState === 'boolean' ? forceState : !APP.ai.open;
  const shell = document.getElementById('assistantShell');
  if (!shell) return;
  shell.classList.toggle('open', APP.ai.open);

  if (APP.ai.open) {
    renderAssistantMessages();
    const input = document.getElementById('assistantInput');
    if (input) input.focus();
  }
}

function buildAssistantContext() {
  const all = allAssignments();
  const pending = all.filter((a) => !a.done);
  const overdue = pending.filter((a) => dueDays(a.due) !== null && dueDays(a.due) < 0);
  const dueSoon = pending.filter((a) => {
    const d = dueDays(a.due);
    return d !== null && d >= 0 && d <= 7;
  }).slice(0, 20).map((a) => ({
    title: a.title,
    subject: a.subject,
    due: a.due,
    dueInDays: dueDays(a.due),
    source: a.source,
    priority: a.priority,
  }));

  const upcomingEvents = APP.local.events
    .filter((e) => e && e.date)
    .map((e) => ({
      title: e.title,
      date: e.date,
      type: e.type || 'Event',
      dueInDays: dueDays(e.date),
    }))
    .filter((e) => e.dueInDays === null || e.dueInDays >= 0)
    .sort((a, b) => {
      const av = a.dueInDays == null ? 9999 : a.dueInDays;
      const bv = b.dueInDays == null ? 9999 : b.dueInDays;
      return av - bv;
    })
    .slice(0, 12);

  const recentAnnouncements = [...APP.canvas.announcements, ...APP.local.announcements]
    .slice(0, 12)
    .map((a) => ({
      title: a.title,
      course: a.courseName || a.time || 'General',
      messagePreview: (a.message || a.body || '').slice(0, 180),
    }));

  const upcomingAssignments = pending
    .filter((a) => dueDays(a.due) === null || dueDays(a.due) >= 0)
    .slice(0, 20)
    .map((a) => ({
      title: a.title,
      subject: a.subject,
      due: a.due,
      dueInDays: dueDays(a.due),
      priority: a.priority,
      source: a.source,
    }));

  const overdueAssignments = overdue
    .slice(0, 20)
    .map((a) => ({
      title: a.title,
      subject: a.subject,
      due: a.due,
      overdueByDays: Math.abs(dueDays(a.due) || 0),
      priority: a.priority,
      source: a.source,
    }));

  const localGradeLog = APP.local.grades.slice(-20).map((g) => ({
    subject: g.subject,
    activity: g.label,
    score: g.score,
    total: g.total,
  }));

  return {
    contextVersion: 2,
    now: new Date().toISOString(),
    activePage: (document.querySelector('.page.active') || {}).id || 'page-dashboard',
    canvasConnected: !!APP.canvas.connected,
    canvasSyncing: !!APP.canvas.syncing,
    aiKeyMode: getAiApiKey() ? 'user' : 'shared',
    totals: {
      assignmentsTotal: all.length,
      pending: pending.length,
      overdue: overdue.length,
      submitted: all.filter((a) => a.done).length,
      announcements: APP.canvas.announcements.length + APP.local.announcements.length,
      courses: APP.canvas.courses.length,
      events: APP.local.events.length,
      notes: APP.local.notes.length,
    },
    dueSoon,
    upcomingAssignments,
    overdueAssignments,
    grades: APP.canvas.grades.slice(0, 12).map((g) => ({
      course: g.courseCode || g.courseName,
      score: g.currentScore,
      finalScore: g.finalScore,
      grade: g.currentGrade,
    })),
    localGradeLog,
    recentAnnouncements,
    upcomingEvents,
    notes: APP.local.notes.slice(-10).map((n) => ({
      title: n.title,
      color: n.color,
      preview: String(n.content || '').slice(0, 180),
    })),
    study: {
      hoursToday: APP.local.studyHours,
      dailyGoalHours: APP.local.studyGoal,
      pomodoroSessionsToday: APP.local.pomoSessions,
    },
  };
}

async function sendAssistantMessage() {
  if (APP.ai.sending) return;

  const input = document.getElementById('assistantInput');
  const btn = document.getElementById('assistantSend');
  const message = (input && input.value ? input.value : '').trim();
  if (!message) return;

  addAssistantMessage('user', message);
  input.value = '';
  APP.ai.sending = true;
  if (btn) btn.textContent = '...';

  try {
    const history = APP.ai.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const aiKey = getAiApiKey();
    const reqHeaders = { 'Content-Type': 'application/json' };
    if (aiKey) reqHeaders['x-ai-key'] = aiKey;
    const response = await fetch(CanvasAPI.apiUrl('/api/assistant/chat'), {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({
        message,
        history,
        context: buildAssistantContext(),
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const err = await response.json();
        detail = err.message || err.error || '';
      } catch (_) {}
      throw new Error(detail || ('HTTP ' + response.status));
    }
    const data = await response.json();
    addAssistantMessage('assistant', data.reply || 'No reply from model.');
  } catch (err) {
    const text = err && err.message ? err.message : 'Unknown assistant error';
    addAssistantMessage('assistant', 'AI backend error: ' + text + '. Check your backend URL and deployed environment variables.');
  } finally {
    APP.ai.sending = false;
    if (btn) btn.textContent = 'Send';
  }
}
