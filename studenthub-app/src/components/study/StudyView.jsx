import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { CardsStudySection } from '../cards/CardsStudySection';
import { Glyph } from '../ui/Icons';
import {
  buildCourseDecks,
  buildStudyStats,
  dateKey,
  formatDuration,
  formatTimerValue,
  updateStoredLocalData,
  weekStartKey
} from '../../lib/dashboard-data';
import { StudyBlobTabs } from './StudyBlobTabs';
import { StudySheet } from './StudySheet';
import { GestureTimerRing } from './timer/GestureTimerRing';
import { TimerModeCarousel } from './timer/TimerModeCarousel';
import {
  STUDY_DURATION_PROFILES,
  readCustomSessions,
  readStudyDurations
} from './timer/timer-config';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };

export function StudyView({ activeTab, onTabChange, onRunningChange, onCreateDeck, assignments, savedDecks, initialTasks, initialHistory, initialNote }) {
  const decks = useMemo(() => buildCourseDecks(assignments, savedDecks), [assignments, savedDecks]);
  const [activeMode, setActiveMode] = useState('work');
  const [durations, setDurations] = useState(readStudyDurations);
  const [customSessions, setCustomSessions] = useState(readCustomSessions);
  const [timeLeft, setTimeLeft] = useState(() => readStudyDurations().work * 60);
  const [timerDuration, setTimerDuration] = useState(() => readStudyDurations().work * 60);
  const [running, setRunning] = useState(false);
  const [interruptedSession, setInterruptedSession] = useState(null);
  const [modeEditor, setModeEditor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionNote, setSessionNote] = useState(initialNote);
  const [studyTasks, setStudyTasks] = useState(initialTasks);
  const [studyHistory, setStudyHistory] = useState(initialHistory);
  const noteReady = useRef(false);

  const remainingRatio = Math.max(0, Math.min(1, timeLeft / timerDuration));
  const formattedTime = formatTimerValue(timeLeft);
  const durationProfile = Object.entries(STUDY_DURATION_PROFILES).find(([, profile]) => (
    profile.work === durations.work && profile.break === durations.break && profile.long === durations.long
  ))?.[0] || 'Balanced';
  const studyStats = useMemo(() => buildStudyStats(studyHistory), [studyHistory]);
  const timerSessions = useMemo(() => ([
    { id: 'work', label: 'Work', minutes: durations.work, custom: false, icon: 'clock' },
    { id: 'break', label: 'Break', minutes: durations.break, custom: false, icon: 'smile' },
    { id: 'long', label: 'Long break', minutes: durations.long, custom: false, icon: 'spark' },
    ...customSessions
  ]), [customSessions, durations]);
  const activeTimerSession = timerSessions.find((session) => session.id === activeMode) || timerSessions[0];

  useEffect(() => {
    localStorage.setItem('bclss_study_durations', JSON.stringify(durations));
  }, [durations]);

  useEffect(() => {
    localStorage.setItem('bclss_custom_sessions', JSON.stringify(customSessions));
  }, [customSessions]);

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
    onRunningChange?.(running);
  }, [onRunningChange, running]);

  useEffect(() => () => onRunningChange?.(false), [onRunningChange]);

  useEffect(() => {
    if (activeTab !== 'timer') setRunning(false);
  }, [activeTab]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          if (activeMode === 'work' || activeTimerSession.custom) {
            const now = new Date();
            const entry = {
              id: now.getTime(),
              at: now.toISOString(),
              date: dateKey(now),
              week: weekStartKey(now),
              durationSecs: timerDuration,
              tagList: [activeTimerSession.label],
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
  }, [running, activeMode, activeTimerSession.custom, activeTimerSession.label, timerDuration, sessionNote]);

  useEffect(() => {
    if (!settingsOpen && !modeEditor) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setSettingsOpen(false);
      setModeEditor(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [settingsOpen, modeEditor]);

  const chooseMode = (session) => {
    if (!session || session.id === activeMode) return;
    if (running) {
      setInterruptedSession({
        id: activeMode,
        label: activeTimerSession.label,
        timeLeft,
        duration: timerDuration
      });
      setRunning(false);
    }
    const nextDuration = session.minutes * 60;
    setActiveMode(session.id);
    setTimerDuration(nextDuration);
    setTimeLeft(nextDuration);
  };

  const resumeInterruptedSession = () => {
    if (!interruptedSession) return;
    setActiveMode(interruptedSession.id);
    setTimerDuration(interruptedSession.duration);
    setTimeLeft(interruptedSession.timeLeft);
    setInterruptedSession(null);
    setRunning(true);
  };

  const openModeEditor = (session = null) => {
    setModeEditor(session
      ? { id: session.id, label: session.label, minutes: session.minutes }
      : { id: '', label: '', minutes: 25 });
  };

  const saveCustomSession = (event) => {
    event.preventDefault();
    if (!modeEditor) return;
    const label = modeEditor.label.trim().slice(0, 40);
    const minutes = Math.max(1, Math.min(120, Number(modeEditor.minutes) || 25));
    if (!label) return;
    const savedSession = {
      id: modeEditor.id || `custom-${Date.now()}`,
      label,
      minutes,
      custom: true,
      icon: 'tag'
    };
    setCustomSessions((current) => (
      modeEditor.id
        ? current.map((session) => session.id === modeEditor.id ? savedSession : session)
        : [...current, savedSession]
    ));
    setModeEditor(null);
    if (!modeEditor.id) {
      chooseMode(savedSession);
    } else if (activeMode === savedSession.id && !running) {
      const nextDuration = savedSession.minutes * 60;
      setTimerDuration(nextDuration);
      setTimeLeft(nextDuration);
    }
  };

  const applyDurationProfile = (profileName) => {
    const profile = STUDY_DURATION_PROFILES[profileName] || DEFAULT_STUDY_DURATIONS;
    setDurations(profile);
    if (!running) {
      const nextDuration = (activeTimerSession.custom ? activeTimerSession.minutes : profile[activeMode]) * 60;
      setTimerDuration(nextDuration);
      setTimeLeft(nextDuration);
    }
  };

  const toggleTimer = () => {
    onTabChange('timer');
    if (timeLeft <= 0) setTimeLeft(timerDuration);
    setRunning((current) => !current);
  };

  const resetTimer = () => {
    setRunning(false);
    setTimeLeft(timerDuration);
  };

  const scrubTimer = (nextSeconds) => {
    if (running) return;
    setTimerDuration(nextSeconds);
    setTimeLeft(nextSeconds);
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

  return (
    <motion.section className={`study-view ${running ? 'timer-running' : ''} ${activeTab === 'cards' ? 'cards-active' : ''}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <motion.header className="study-heading study-dimmable" animate={{ opacity: running ? 0.16 : 1, y: running ? -5 : 0 }} transition={SPRING}>
        <div>
          <span className="eyebrow-mobile">Deep work</span>
          <h1>Study</h1>
          <p>{activeTab === 'cards' ? 'A tactile review space for every deck.' : 'One study space. Zero noise.'}</p>
        </div>
        {activeTab === 'timer' && (
          <button type="button" className="study-settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open timer settings">
            <Glyph name="settings" className="h-5 w-5" />
          </button>
        )}
      </motion.header>

      {activeTab !== 'cards' && <StudyBlobTabs value={activeTab} onChange={onTabChange} />}

      <AnimatePresence mode="wait">
          {activeTab === 'timer' && (
            <motion.div
              className="timer-workspace"
              key="study-timer"
              id="study-panel-timer"
              role="tabpanel"
              aria-labelledby="study-tab-timer"
              tabIndex="0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <GestureTimerRing
                running={running}
                timeLeft={timeLeft}
                formattedTime={formattedTime}
                remainingRatio={remainingRatio}
                activeMode={activeTimerSession.label}
                blocked={Boolean(interruptedSession)}
                onToggle={toggleTimer}
                onReset={resetTimer}
                onScrub={scrubTimer}
              />

              <TimerModeCarousel
                sessions={timerSessions}
                activeId={activeMode}
                onSelect={chooseMode}
                onAdd={() => openModeEditor()}
                onEdit={openModeEditor}
                editingDisabled={running}
              />

              <AnimatePresence>
                {interruptedSession && (
                  <motion.div
                    className="timer-interruption"
                    role="status"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    transition={SPRING}
                  >
                    <span className="timer-interruption-icon"><Glyph name="pause" className="h-4 w-4" /></span>
                    <span>
                      <strong>{interruptedSession.label} paused</strong>
                      <small>{formatTimerValue(interruptedSession.timeLeft)} remains</small>
                    </span>
                    <button type="button" onClick={resumeInterruptedSession}>Resume</button>
                    <button type="button" className="discard" onClick={() => setInterruptedSession(null)}>Discard</button>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {activeTab === 'notes' && (
            <motion.section
              className="study-secondary-panel"
              key="study-notes"
              id="study-panel-notes"
              role="tabpanel"
              aria-labelledby="study-tab-notes"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
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
            <motion.section
              className="study-secondary-panel"
              key="study-tasks"
              id="study-panel-tasks"
              role="tabpanel"
              aria-labelledby="study-tab-tasks"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
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
            <motion.section
              className="study-secondary-panel"
              key="study-progress"
              id="study-panel-progress"
              role="tabpanel"
              aria-labelledby="study-tab-progress"
              tabIndex="0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
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
          {activeTab === 'cards' && (
            <CardsStudySection
              key="study-cards"
              decks={decks}
              onCreateDeck={onCreateDeck}
            />
          )}
      </AnimatePresence>

      <StudySheet
        open={settingsOpen}
        title="Timer settings"
        detail="Choose one timer rhythm."
        onClose={() => setSettingsOpen(false)}
      >
        <label className="timer-profile-select">
          <span>Session length</span>
          <div className="timer-profile-control">
            <span className="timer-profile-icon" aria-hidden="true">
              <Glyph name="clock" className="h-4 w-4" />
            </span>
            <select value={durationProfile} onChange={(event) => applyDurationProfile(event.target.value)}>
              <option value="Quick">Quick rhythm</option>
              <option value="Balanced">Balanced rhythm</option>
              <option value="Deep">Deep rhythm</option>
            </select>
            <Glyph name="chevron" className="timer-profile-chevron" />
          </div>
          <span className="timer-profile-breakdown" aria-live="polite">
            <span><strong>{durations.work}</strong><small>focus</small></span>
            <span><strong>{durations.break}</strong><small>break</small></span>
            <span><strong>{durations.long}</strong><small>long break</small></span>
          </span>
        </label>
        <button type="button" className="sheet-done-button" onClick={() => setSettingsOpen(false)}>Done</button>
      </StudySheet>

      <StudySheet
        open={Boolean(modeEditor)}
        title={modeEditor?.id ? 'Edit custom session' : 'New custom session'}
        detail="Give this timer a name and duration."
        onClose={() => setModeEditor(null)}
      >
        {modeEditor && (
          <form className="mode-editor-form" onSubmit={saveCustomSession}>
            <div className="sheet-field">
              <label htmlFor="custom-session-name">Session name</label>
              <input
                id="custom-session-name"
                value={modeEditor.label}
                maxLength="40"
                autoFocus
                placeholder="Reading sprint"
                onChange={(event) => setModeEditor((current) => ({ ...current, label: event.target.value }))}
              />
            </div>
            <div className="sheet-field">
              <label htmlFor="custom-session-duration">Duration in minutes</label>
              <input
                id="custom-session-duration"
                type="number"
                min="1"
                max="120"
                inputMode="numeric"
                value={modeEditor.minutes}
                onChange={(event) => setModeEditor((current) => ({ ...current, minutes: event.target.value }))}
              />
            </div>
            <p className="mode-editor-note">Custom sessions appear after the three fixed presets.</p>
            <button type="submit" className="sheet-done-button" disabled={!modeEditor.label.trim()}>
              {modeEditor.id ? 'Save changes' : 'Add session'}
            </button>
          </form>
        )}
      </StudySheet>
    </motion.section>
  );
}
