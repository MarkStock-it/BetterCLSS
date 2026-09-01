import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glyph } from '../ui/Icons';
import { ViewHeading } from '../ui/ViewControls';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const VIEW_COPY = {
  grades: ['Grades', 'Scores and course progress will appear after your next Canvas sync.'],
  announcements: ['Announcements', 'New Canvas announcements and instructor updates live here.'],
  resources: ['Resources', 'Keep your most-used course links and study materials together.'],
  settings: ['Settings', 'Manage Canvas, notifications, appearance, and installation preferences.']
};

export function SecondaryView({ view, announcements, grades, links, connected, onConnect, agentSettings, onAgentSettingsChange }) {
  const [aiApiKey, setAiApiKey] = useState(() => {
    try {
      return localStorage.getItem('bclss_ai_key') || '';
    } catch {
      return '';
    }
  });
  const [aiKeyStatus, setAiKeyStatus] = useState('');
  const [groqApiKey, setGroqApiKey] = useState(() => {
    try {
      return localStorage.getItem('bclss_groq_key') || '';
    } catch {
      return '';
    }
  });
  const [groqKeyStatus, setGroqKeyStatus] = useState('');
  const [agentWarningOpen, setAgentWarningOpen] = useState(false);
  const [agentWarningAccepted, setAgentWarningAccepted] = useState(false);
  const [agentStatusMessage, setAgentStatusMessage] = useState('');
  const agentEnabled = agentSettings?.enabled || false;
  const [title, detail] = VIEW_COPY[view] || ['StudentHub', 'Choose a destination from the navigation drawer.'];
  const gradePanels = grades.slice(0, 6).map((grade) => {
    const course = grade.courseName || grade.courseCode || grade.course || grade.subject || 'Course';
    const activity = grade.label || grade.currentGrade || grade.courseCode || '';
    let score = '';
    if (grade.currentScore != null && Number.isFinite(Number(grade.currentScore))) {
      score = `${Math.round(Number(grade.currentScore))}%`;
    } else if (grade.score != null && grade.total != null) {
      score = `${grade.score}/${grade.total}`;
    } else if (grade.score != null && Number.isFinite(Number(grade.score))) {
      score = `${Math.round(Number(grade.score))}%`;
    }
    return [course, [activity, score].filter(Boolean).join(' · '), 'grades'];
  });
  const announcementPanels = announcements.slice(0, 6).map((item) => [
    item.title || item.courseName || 'Course announcement',
    String(item.message || item.body || item.courseName || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    'bell'
  ]);
  const resourcePanels = links.slice(0, 6).map((item) => [
    item.name || item.title || 'Saved resource',
    item.url || '',
    'link'
  ]);
  const panels = {
    grades: gradePanels,
    announcements: announcementPanels,
    resources: resourcePanels,
    settings: [
      ['Canvas connection', connected ? 'Connected' : 'Not connected', 'sync']
    ]
  };
  const activePanels = panels[view] || [];
  const emptyMessages = {
    grades: connected ? 'No grade records are available from Canvas yet.' : 'Connect Canvas to load your grades.',
    announcements: connected ? 'No announcements are available.' : 'Connect Canvas to load announcements.',
    resources: 'No saved resources yet.'
  };
  const saveAiApiKey = (event) => {
    event.preventDefault();
    const cleanKey = aiApiKey.trim();
    try {
      if (cleanKey) localStorage.setItem('bclss_ai_key', cleanKey);
      else localStorage.removeItem('bclss_ai_key');
      setAiApiKey(cleanKey);
      setAiKeyStatus(cleanKey ? 'Saved on this device.' : 'Custom key removed.');
    } catch {
      setAiKeyStatus('This browser could not save the key.');
    }
  };
  const removeAiApiKey = () => {
    setAiApiKey('');
    try {
      localStorage.removeItem('bclss_ai_key');
      setAiKeyStatus('Custom key removed.');
    } catch {
      setAiKeyStatus('This browser could not remove the key.');
    }
  };
  const saveGroqApiKey = (event) => {
    event.preventDefault();
    const cleanKey = groqApiKey.trim();
    try {
      if (cleanKey) localStorage.setItem('bclss_groq_key', cleanKey);
      else localStorage.removeItem('bclss_groq_key');
      setGroqApiKey(cleanKey);
      setGroqKeyStatus(cleanKey ? 'Saved on this device.' : 'Custom key removed.');
    } catch {
      setGroqKeyStatus('This browser could not save the key.');
    }
  };
  const removeGroqApiKey = () => {
    setGroqApiKey('');
    try {
      localStorage.removeItem('bclss_groq_key');
      setGroqKeyStatus('Custom key removed.');
    } catch {
      setGroqKeyStatus('This browser could not remove the key.');
    }
  };

  const handleAgentToggleClick = () => {
    if (agentEnabled) {
      // Disabling is straightforward — no warning needed
      onAgentSettingsChange({ enabled: false });
      setAgentStatusMessage('Agentic Helper disabled.');
    } else {
      // Show warning before enabling
      setAgentWarningOpen(true);
      setAgentWarningAccepted(false);
    }
  };

  const confirmAgentEnable = () => {
    if (!agentWarningAccepted) return;
    onAgentSettingsChange({ enabled: true });
    setAgentWarningOpen(false);
    setAgentWarningAccepted(false);
    setAgentStatusMessage('Agentic Helper is enabled.');
  };

  const cancelAgentEnable = () => {
    setAgentWarningOpen(false);
    setAgentWarningAccepted(false);
  };

  return (
    <motion.section className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="StudentHub" title={title} detail={detail} />
      <section className="section-card secondary-list">
        {activePanels.map(([panelTitle, panelDetail, icon], index) => (
          <motion.article
            className="secondary-row"
            key={`${panelTitle}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: index * 0.06 }}
          >
            <span className="secondary-icon"><Glyph name={icon} className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2>{panelTitle}</h2>
              <p>{panelDetail}</p>
            </div>
          </motion.article>
        ))}
        {!activePanels.length && (
          <p className="study-empty-copy">{emptyMessages[view] || 'Nothing to show yet.'}</p>
        )}
        {view === 'settings' && (
          <>
          <form className="ai-key-settings" onSubmit={saveAiApiKey}>
            <div className="ai-key-settings-head">
              <span className="secondary-icon"><Glyph name="spark" className="h-5 w-5" /></span>
              <div>
                <h2>Gemini API key</h2>
                <p>Stored only in this browser's local cache. BetterCLSS sends it through the backend to Google Gemini.</p>
              </div>
            </div>
            <label htmlFor="studenthub-ai-api-key">Gemini API key</label>
            <input
              id="studenthub-ai-api-key"
              type="password"
              value={aiApiKey}
              onChange={(event) => {
                setAiApiKey(event.target.value);
                setAiKeyStatus('');
              }}
              placeholder="Paste your Google AI Studio key"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
            />
            <div className="ai-key-settings-actions">
              <button type="submit">Save key</button>
              {aiApiKey && <button type="button" className="remove" onClick={removeAiApiKey}>Remove</button>}
            </div>
            {aiKeyStatus && <p className="ai-key-status" role="status">{aiKeyStatus}</p>}
          </form>
          <form className="ai-key-settings" onSubmit={saveGroqApiKey}>
            <div className="ai-key-settings-head">
              <span className="secondary-icon"><Glyph name="spark" className="h-5 w-5" /></span>
              <div>
                <h2>Groq API key</h2>
                <p>Used for fast, free agentic tool calling. Stored only in this browser's local cache and sent through the backend to Groq.</p>
              </div>
            </div>
            <label htmlFor="studenthub-groq-api-key">Groq API key</label>
            <input
              id="studenthub-groq-api-key"
              type="password"
              value={groqApiKey}
              onChange={(event) => {
                setGroqApiKey(event.target.value);
                setGroqKeyStatus('');
              }}
              placeholder="Paste your Groq API key"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
            />
            <div className="ai-key-settings-actions">
              <button type="submit">Save key</button>
              {groqApiKey && <button type="button" className="remove" onClick={removeGroqApiKey}>Remove</button>}
            </div>
            {groqKeyStatus && <p className="ai-key-status" role="status">{groqKeyStatus}</p>}
          </form>
          </>
        )}
        {view === 'settings' && (
          <div className="agent-settings-card">
            <div className="agent-settings-head">
              <span className="secondary-icon agent-settings-icon">
                <Glyph name="spark" className="h-5 w-5" />
              </span>
              <div>
                <h2>Agentic Helper</h2>
                <p>Experimental assignment automation</p>
              </div>
            </div>
            <div className="agent-toggle-row">
              <span className="agent-toggle-label">
                {agentEnabled ? 'ON' : 'OFF'}
              </span>
              <button
                type="button"
                className={`agent-toggle-switch ${agentEnabled ? 'active' : ''}`}
                onClick={handleAgentToggleClick}
                aria-label={agentEnabled ? 'Disable Agentic Helper' : 'Enable Agentic Helper'}
              >
                <span className="agent-toggle-knob" />
              </button>
            </div>
            {agentEnabled && (
              <p className="agent-status-text">Agentic Helper is enabled</p>
            )}
            {agentEnabled && agentSettings?.permissions && (
              <div className="agent-permissions-section">
                <h3 className="agent-permissions-heading">Permissions</h3>
                {[
                  { key: 'contentGeneration', label: 'Content generation', desc: 'AI text and essay generation' },
                  { key: 'artifactGeneration', label: 'Artifact creation', desc: 'DOCX and TXT file creation' },
                  { key: 'canvasComments', label: 'Canvas comments', desc: 'Post comments on assignments' },
                  { key: 'canvasFileUpload', label: 'Canvas file uploads', desc: 'Upload files to Canvas' },
                  { key: 'canvasSubmission', label: 'Canvas submission', desc: 'Submit assignments' },
                ].map(({ key, label, desc }) => (
                  <div className="agent-permission-row" key={key}>
                    <div className="agent-permission-info">
                      <span className="agent-permission-label">{label}</span>
                      <span className="agent-permission-desc">{desc}</span>
                    </div>
                    <button
                      type="button"
                      className={`agent-toggle-switch agent-permission-toggle ${agentSettings.permissions[key] ? 'active' : ''}`}
                      onClick={() => {
                        onAgentSettingsChange({
                          ...agentSettings,
                          permissions: {
                            ...agentSettings.permissions,
                            [key]: !agentSettings.permissions[key],
                          },
                        });
                      }}
                      aria-label={`${agentSettings.permissions[key] ? 'Disable' : 'Enable'} ${label}`}
                    >
                      <span className="agent-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {agentStatusMessage && (
              <p className="agent-status-message" role="status">{agentStatusMessage}</p>
            )}
          </div>
        )}
        <AnimatePresence>
          {agentWarningOpen && (
            <motion.div
              className="agent-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={cancelAgentEnable}
            >
              <motion.div
                className="agent-modal"
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="agent-modal-head">
                  <span className="agent-modal-icon">
                    <Glyph name="spark" className="h-5 w-5" />
                  </span>
                  <h2>Enable Agentic Helper?</h2>
                </div>
                <div className="agent-modal-body">
                  <p>Agentic Helper is an <strong>experimental</strong> automation feature.</p>
                  <p>When enabled, it may:</p>
                  <ul>
                    <li>Analyze your Canvas assignments</li>
                    <li>Generate supported content and files</li>
                    <li>Interact with supported Canvas features</li>
                    <li>Perform automated actions when authorized</li>
                  </ul>
                  <p>However, Agentic Helper <strong>cannot complete every type of assignment</strong>.</p>
                  <p>Assignments requiring specialized software, physical work, or unsupported formats may be impossible for the agent to complete. In those cases, the agent will <strong>notify you</strong> instead of pretending it can help.</p>
                  <p className="agent-modal-responsibility">You remain responsible for reviewing all generated work and automated actions.</p>
                </div>
                <label className="agent-modal-check">
                  <input
                    type="checkbox"
                    checked={agentWarningAccepted}
                    onChange={(e) => setAgentWarningAccepted(e.target.checked)}
                  />
                  <span>I understand this is experimental and accept the risks</span>
                </label>
                <div className="agent-modal-actions">
                  <button type="button" className="agent-modal-cancel" onClick={cancelAgentEnable}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="agent-modal-confirm"
                    disabled={!agentWarningAccepted}
                    onClick={confirmAgentEnable}
                  >
                    Enable Agentic Helper
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {(view === 'settings' || (view === 'grades' && !connected)) && (
          <button type="button" className="secondary-action" onClick={onConnect}>
            <Glyph name="sync" className="h-4 w-4" />
            {connected ? 'Manage Canvas connection' : 'Connect Canvas'}
          </button>
        )}
      </section>
    </motion.section>
  );
}
