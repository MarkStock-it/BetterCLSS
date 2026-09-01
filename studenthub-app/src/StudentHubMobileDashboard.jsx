import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform
} from 'motion/react';
import { AssistantDrawer } from './components/assistant/AssistantDrawer';
import { CardsStudySection } from './components/cards/CardsStudySection';
import { CalendarView } from './components/calendar/CalendarView';
import { DeadlineList, WorkloadProgress } from './components/home/HomeOverview';
import { SidebarDrawer } from './components/navigation/SidebarDrawer';
import { AgentCenter } from './components/agent/AgentCenter';
import { SecondaryView } from './components/secondary/SecondaryView';
import { StudyView } from './components/study/StudyView';
import { TasksView } from './components/tasks/TasksView';
import { BrandLogo, Glyph } from './components/ui/Icons';
import {
  daysUntil,
  readAgentSettings,
  readDashboardData,
  updateStoredLocalData,
  updateAgentSettings,
  fetchAgentSettings,
  writeAgentSettings
} from './lib/dashboard-data';

const DRAWER_TRAVEL = 360;
const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };

const PRIMARY_VIEWS = ['home', 'tasks', 'calendar', 'study'];

export default function StudentHubMobileDashboard() {
  const data = useMemo(readDashboardData, []);
  const [assignments, setAssignments] = useState(data.assignments);
  const overdue = useMemo(() => {
    const nextPending = assignments.filter((item) => !item.done);
    return nextPending.filter((item) => {
      const days = daysUntil(item.due);
      return days !== null && days < 0;
    });
  }, [assignments]);

  const [activeView, setActiveView] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [edgeDragging, setEdgeDragging] = useState(false);
  const [taskFilter, setTaskFilter] = useState('pending');
  const [calendarView, setCalendarView] = useState('month');
  const [studySpace, setStudySpace] = useState('timer');
  const [studyRunning, setStudyRunning] = useState(false);
  const [studyDecks, setStudyDecks] = useState(data.studyDecks);
  const [agentSettings, setAgentSettings] = useState(data.agentSettings || readAgentSettings());
  const [agentJobCreated, setAgentJobCreated] = useState(null);
  const drawerX = useMotionValue(-DRAWER_TRAVEL);
  const backdropOpacity = useTransform(drawerX, [-DRAWER_TRAVEL, 0], [0, 0.74]);
  const edgeGesture = useRef(null);

  // The server is the authoritative, cross-device store for the Agentic Helper
  // enabled state (it lives in a per-user file on the server). localStorage is
  // only a per-device cache — on a phone that has never written it, it would
  // show OFF even when the server has the helper enabled. Reconcile the UI to
  // the server's value on mount so the toggle is the same on every device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await fetchAgentSettings();
      if (cancelled || !server) return;
      setAgentSettings((current) => {
        const reconciled = {
          ...current,
          enabled: Boolean(server.enabled),
          enabledAt: server.enabledAt || current.enabledAt,
          lastToggledAt: server.lastToggledAt || current.lastToggledAt,
          permissions: server.permissions || current.permissions,
        };
        writeAgentSettings(reconciled);
        return reconciled;
      });
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    animate(drawerX, drawerOpen ? 0 : -DRAWER_TRAVEL, SPRING);
  }, [drawerOpen, drawerX]);

  const settleDrawer = (open) => {
    setDrawerOpen(open);
    animate(drawerX, open ? 0 : -DRAWER_TRAVEL, SPRING);
  };

  const navigate = (view) => {
    if (view === 'cards') {
      setStudySpace('cards');
      setActiveView('study');
    } else {
      if (view === 'study') setStudySpace('timer');
      setActiveView(view);
    }
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

  // Apply a settings change to both React state and the localStorage cache.
  const applyAgentSettings = (updater) => {
    setAgentSettings((current) => {
      const next = updater(current);
      writeAgentSettings(next);
      return next;
    });
  };

  const handleAgentSettingsChange = (newSettings) => {
    const isEnabledChange = typeof newSettings.enabled === 'boolean';
    const previousEnabled = agentSettings.enabled;

    // Optimistic update so the toggle feels responsive.
    applyAgentSettings((current) => ({
      ...current,
      ...newSettings,
      lastToggledAt: new Date().toISOString(),
    }));

    // The enable switch is authoritative on the server; only permission
    // toggles stay local. Persist it through, then reconcile the UI to the
    // server's confirmed value — never let the UI claim a state the server
    // doesn't have (that was the "reverts" / silent 403 bug).
    if (!isEnabledChange) return;

    updateAgentSettings(newSettings.enabled).then((serverSettings) => {
      if (!serverSettings) {
        // Server did not persist it — roll back the enabled bit.
        applyAgentSettings((current) => ({ ...current, enabled: previousEnabled }));
        return;
      }
      applyAgentSettings((current) => ({
        ...current,
        enabled: Boolean(serverSettings.enabled),
        enabledAt: serverSettings.enabledAt || current.enabledAt,
        lastToggledAt: serverSettings.lastToggledAt || current.lastToggledAt,
      }));
    });
  };

  const handleCreateAgentJob = (job) => {
    navigate('agent');
    setAgentJobCreated(job);
    setTimeout(() => setAgentJobCreated(null), 1000);
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
    setStudySpace('cards');
    setActiveView('study');
  };

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={[
      'studenthub-shell',
      activeView === 'study' && studyRunning ? 'focus-session-active' : ''
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
        activeView={activeView === 'study' && studySpace === 'cards' ? 'cards' : activeView}
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

                <WorkloadProgress
                  assignments={assignments}
                  overdueCount={overdue.length}
                  announcementCount={data.announcements.length}
                />

                <DeadlineList
                  assignments={assignments}
                  connected={data.connected}
                  onConnect={connectCanvas}
                  onToggleDone={toggleAssignmentDone}
                  onCreateAgentJob={handleCreateAgentJob}
                />
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
                onCreateAgentJob={handleCreateAgentJob}
              />
            )}
            {activeView === 'calendar' && (
              <CalendarView
                key="calendar"
                calendarView={calendarView}
                onViewChange={setCalendarView}
                assignments={assignments}
                savedEvents={data.events}
                onToggleDone={toggleAssignmentDone}
              />
            )}
            {activeView === 'study' && (
              <StudyView
                key="study"
                activeTab={studySpace}
                onTabChange={setStudySpace}
                onRunningChange={setStudyRunning}
                onCreateDeck={() => setAssistantOpen(true)}
                assignments={assignments}
                savedDecks={studyDecks}
                initialTasks={data.studyTasks}
                initialHistory={data.studyHistory}
                initialNote={data.studyNote}
              />
            )}
            {activeView === 'agent' && (
              <AgentCenter
                key="agent"
                agentSettings={agentSettings}
              />
            )}
            {!PRIMARY_VIEWS.includes(activeView) && activeView !== 'agent' && (
              <SecondaryView
                key={activeView}
                view={activeView}
                announcements={data.announcements}
                grades={data.grades}
                links={data.links}
                connected={data.connected}
                onConnect={connectCanvas}
                agentSettings={agentSettings}
                onAgentSettingsChange={handleAgentSettingsChange}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

    </div>
  );
}
