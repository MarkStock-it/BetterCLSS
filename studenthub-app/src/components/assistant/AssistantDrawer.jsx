import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glyph } from '../ui/Icons';
import { daysUntil } from '../../lib/dashboard-data';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const DRAWER_TRAVEL = 360;

export function AssistantText({ text }) {
  return String(text || '').split('\n').filter((line, index, lines) => line.trim() || (
    index > 0 && index < lines.length - 1
  )).map((line, lineIndex) => {
    const cleanLine = line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ');
    const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={`${lineIndex}-${cleanLine.slice(0, 12)}`}>
        {parts.map((part, index) => (
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={index}>{part.slice(2, -2)}</strong>
            : <React.Fragment key={index}>{part}</React.Fragment>
        ))}
      </p>
    );
  });
}

export function AssistantDrawer({ open, onClose, data, assignments, onCreateDeck }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi, I can use your live BetterCLSS dashboard to help you plan, review lessons, or create a study deck.' }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (open) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, open]);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    const userMessage = { role: 'user', content: message };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    const pending = assignments.filter((item) => !item.done);
    const context = {
      contextVersion: 3,
      activePage: 'studenthub',
      canvasConnected: data.connected,
      totals: {
        assignmentsTotal: assignments.length,
        pending: pending.length,
        overdue: pending.filter((item) => {
          const days = daysUntil(item.due);
          return days !== null && days < 0;
        }).length,
        submitted: assignments.filter((item) => item.done).length,
        announcements: data.announcements.length,
        courses: new Set(assignments.map((item) => item.subject).filter(Boolean)).size
      },
      dueSoon: smartSort(pending).slice(0, 20).map((item) => ({
        title: item.title,
        subject: item.subject,
        due: item.due,
        dueInDays: daysUntil(item.due),
        priority: item.priority
      })),
      grades: data.grades.slice(0, 12).map((grade) => ({
        course: grade.courseName || grade.courseCode || grade.subject,
        score: grade.currentScore ?? grade.score
      })),
      recentAnnouncements: data.announcements.slice(0, 12).map((item) => ({
        title: item.title,
        course: item.courseName,
        messagePreview: String(item.message || item.body || '').replace(/<[^>]*>/g, ' ').slice(0, 600)
      })),
      notes: data.studyNote ? [{ title: 'Current study note', preview: data.studyNote.slice(0, 1600) }] : [],
      existingDecks: data.studyDecks.map((deck) => ({ title: deck.title, cardCount: deck.cards?.length || 0 }))
    };

    try {
      let apiBase = '';
      let aiKey = '';
      let canvasToken = '';
      let canvasDomain = '';
      try {
        apiBase = (localStorage.getItem('bclss_api_base') || 'https://betterclss.onrender.com').replace(/\/+$/, '');
        aiKey = localStorage.getItem('bclss_ai_key') || '';
        canvasToken = localStorage.getItem('bclss_canvas_token') || '';
        canvasDomain = localStorage.getItem('bclss_canvas_domain') || '';
      } catch {
        apiBase = 'https://betterclss.onrender.com';
      }
      const headers = { 'Content-Type': 'application/json' };
      if (aiKey) headers['x-ai-key'] = aiKey;
      if (canvasToken) headers['x-canvas-token'] = canvasToken;
      if (canvasDomain) headers['x-canvas-domain'] = canvasDomain;
      const response = await fetch(`${apiBase}/api/assistant/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-12),
          context
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'The AI service is unavailable.');
      (Array.isArray(result.actions) ? result.actions : []).forEach((action) => {
        if (action.type === 'create_deck') onCreateDeck(action);
      });
      setMessages((current) => [...current, {
        role: 'assistant',
        content: result.reply || 'I completed that request.'
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        content: `I could not reach the BetterCLSS AI backend. ${error.message || 'Please try again.'}`
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="assistant-backdrop"
            aria-label="Close AI helper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="assistant-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={SPRING}
            drag="x"
            dragConstraints={{ left: -DRAWER_TRAVEL, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 || info.velocity.x < -500) onClose();
            }}
            aria-label="BetterCLSS AI helper"
          >
            <header className="assistant-drawer-head">
              <div className="assistant-avatar"><Glyph name="spark" className="h-5 w-5" /></div>
              <div>
                <strong>BetterCLSS AI</strong>
                <span>Connected to your dashboard</span>
              </div>
              <button type="button" className="drawer-close" onClick={onClose} aria-label="Close AI helper">
                <Glyph name="close" className="h-5 w-5" />
              </button>
            </header>
            <div className="assistant-message-list" ref={messagesRef}>
              {messages.map((message, index) => (
                <article className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
                  <AssistantText text={message.content} />
                </article>
              ))}
              {sending && <div className="assistant-typing"><i /><i /><i /></div>}
            </div>
            <form className="assistant-composer" onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your dashboard or create cards…"
                rows="2"
                aria-label="Message BetterCLSS AI"
              />
              <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">
                <Glyph name="arrow" className="h-4 w-4" />
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
