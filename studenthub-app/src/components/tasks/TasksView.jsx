import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Glyph } from '../ui/Icons';
import { ViewHeading, ViewModeTabs } from '../ui/ViewControls';
import { daysUntil, smartSort, canCreateAgentJob, createAgentJobSafe } from '../../lib/dashboard-data';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const PAGE_SIZE = 15;

/* Time bucket for grouping. Returns a label only when the data justifies a group. */
function dueBucket(days) {
  if (days === null) return 'unscheduled';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 6) return 'week';
  return 'later';
}

const BUCKET_LABELS = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
  unscheduled: 'No due date'
};

/* Adaptive due wording — the relative form beats repeating the calendar date. */
function formatDue(item, days) {
  if (days === null) return item.due ? item.due : 'No due date';
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? 'Overdue · 1 day' : `Overdue · ${n} days`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 6) return `Due in ${days} days`;
  const parsed = new Date(`${item.due}T00:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return item.due;
}

function workloadSummary(assignments) {
  let overdue = 0;
  let pending = 0;
  let submitted = 0;
  assignments.forEach((item) => {
    if (item.done) { submitted += 1; return; }
    pending += 1;
    const days = daysUntil(item.due);
    if (days !== null && days < 0) overdue += 1;
  });
  return { overdue, pending, submitted };
}

/* Inline action surface — discoverable, keyboard reachable, no hidden gestures. */
function TaskActions({ item, connected, onToggleDone, onCreateAgentJob, creatingJobId, setCreatingJobId, onClose }) {
  const agentSupported = canCreateAgentJob(item);
  const isCreating = creatingJobId === item.id;

  const startAgentJob = async () => {
    if (isCreating) return;
    if (!agentSupported) {
      alert('This assignment type may not be supported by Agentic Helper yet.');
      return;
    }
    try {
      setCreatingJobId(item.id);
      const job = await createAgentJobSafe(item, (err) => alert(`Could not create agent job:\n\n${err}`));
      if (job) onCreateAgentJob?.(job);
    } finally {
      setCreatingJobId(null);
    }
  };

  return (
    <motion.div
      className="task-actions"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        className="task-action-btn submit"
        onClick={() => { onToggleDone(item); onClose(); }}
      >
        <Glyph name="tasks" className="h-4 w-4" />
        Mark submitted
      </button>
      <button
        type="button"
        className={`task-action-btn agent ${isCreating ? 'is-creating' : ''}`}
        disabled={!connected || isCreating}
        title={!agentSupported ? 'Assignment type not supported by Agentic Helper' : undefined}
        onClick={() => { void startAgentJob(); }}
      >
        {isCreating ? <span className="agent-spinner-tiny" /> : <Glyph name="spark" className="h-4 w-4" />}
        Agentic start
      </button>
    </motion.div>
  );
}

function TaskRow({ item, expanded, onToggleExpand, onToggleDone, onCreateAgentJob, creatingJobId, setCreatingJobId, isSubmittedView, connected, reduceMotion }) {
  const days = daysUntil(item.due);
  const bucket = dueBucket(days);
  const dueText = formatDue(item, days);
  const rowId = item.id || `${item.title}-${item.due || 'nodue'}`;
  const overdue = !item.done && days !== null && days < 0;

  return (
    <li className={`task-row ${bucket === 'overdue' ? 'is-overdue' : ''} ${item.done ? 'is-done' : ''}`}>
      <button
        type="button"
        className="task-row-main"
        aria-expanded={expanded}
        aria-label={`${item.title}. ${item.subject || 'Course'}. ${dueText}.${expanded ? ' Hide actions' : ' Show actions'}`}
        onClick={() => onToggleExpand(rowId)}
      >
        <span className={`task-status-dot ${overdue ? 'overdue' : item.done ? 'done' : ''}`} aria-hidden="true" />
        <span className="task-row-text">
          <span className="task-title">{item.title || 'Untitled assignment'}</span>
          <span className="task-meta">
            <span className="task-course">{item.subject || 'Course'}</span>
            <span className={`task-due ${overdue ? 'overdue' : ''}`}>{dueText}</span>
          </span>
        </span>
        <Glyph name="chevron" className={`task-row-chevron h-4 w-4 ${expanded ? 'open' : ''}`} />
      </button>
      {isSubmittedView ? (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="undo"
              className="task-actions"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              <button
                type="button"
                className="task-action-btn"
                onClick={() => onToggleDone(item)}
              >
                <Glyph name="reset" className="h-4 w-4" />
                Move back to pending
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <AnimatePresence initial={false}>
          {expanded && (
            <TaskActions
              key="actions"
              item={item}
              connected={connected}
              onToggleDone={onToggleDone}
              creatingJobId={creatingJobId}
              setCreatingJobId={setCreatingJobId}
              onClose={() => onToggleExpand(rowId)}
            />
          )}
        </AnimatePresence>
      )}
    </li>
  );
}

function EmptyTasks({ filter, connected, onConnect }) {
  const copy = {
    pending: connected
      ? { title: 'Nothing on your plate', body: 'No upcoming assignments right now. Sync Canvas anytime to check for new work.' }
      : { title: 'Bring your deadlines into focus', body: 'Connect Canvas to see upcoming assignments and due dates here.' },
    overdue: { title: 'Nothing overdue', body: 'You are fully caught up — no late work to worry about.' },
    submitted: { title: 'No submissions yet', body: 'Assignments you mark as submitted will be collected here.' }
  }[filter] || { title: 'Nothing here yet', body: 'Assignments will appear once Canvas syncs.' };

  return (
    <div className="empty-tasks">
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      {filter === 'pending' && !connected && (
        <button type="button" className="empty-action" onClick={onConnect}>
          <Glyph name="sync" className="h-4 w-4" />
          Connect Canvas
        </button>
      )}
    </div>
  );
}

export function TasksView({ assignments, filter, onFilterChange, connected, onConnect, onToggleDone, onCreateAgentJob }) {
  const [expandedId, setExpandedId] = useState(null);
  const [creatingJobId, setCreatingJobId] = useState(null);
  const [page, setPage] = useState(0);
  const reduceMotion = useReducedMotion();

  const counts = useMemo(() => workloadSummary(assignments), [assignments]);

  const visible = useMemo(() => smartSort(assignments).filter((item) => {
    const days = daysUntil(item.due);
    if (filter === 'overdue') return !item.done && days !== null && days < 0;
    if (filter === 'submitted') return item.done;
    return !item.done;
  }), [assignments, filter]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = useMemo(
    () => visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [visible, safePage]
  );

  /* Continuous scrollable list — the workload stays in one mental model.
     Group only when the filter shows mixed time horizons. */
  const groups = useMemo(() => {
    if (filter !== 'pending') return null;
    const order = ['overdue', 'today', 'week', 'later', 'unscheduled'];
    const map = new Map();
    paged.forEach((item) => {
      const bucket = dueBucket(daysUntil(item.due));
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket).push(item);
    });
    return order.filter((bucket) => map.has(bucket)).map((bucket) => ({ bucket, label: BUCKET_LABELS[bucket], items: map.get(bucket) }));
  }, [paged, filter]);

  const gotoPage = (next) => {
    setPage(Math.max(0, Math.min(totalPages - 1, next)));
    setExpandedId(null);
    document.querySelector('.tasks-list-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleExpand = (rowId) => setExpandedId((current) => (current === rowId ? null : rowId));

  const summary = counts.overdue
    ? `${counts.pending} to do · ${counts.overdue} overdue`
    : counts.pending
      ? `${counts.pending} to do · nothing overdue`
      : 'You\u2019re caught up';

  return (
    <motion.section key={`tasks-${filter}`} className="view-stack tasks-view" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={reduceMotion ? { duration: 0 } : SPRING}>
      <ViewHeading eyebrow="Coursework" title="Assignments" detail={summary} />
      <ViewModeTabs
        label="Assignment filters"
        value={filter}
        onChange={(value) => { setExpandedId(null); setPage(0); onFilterChange(value); }}
        options={[
          { value: 'pending', label: `Upcoming${counts.pending ? ` ${counts.pending}` : ''}` },
          { value: 'overdue', label: `Overdue${counts.overdue ? ` ${counts.overdue}` : ''}` },
          { value: 'submitted', label: `Submitted${counts.submitted ? ` ${counts.submitted}` : ''}` }
        ]}
      />

      <section className="tasks-list-wrap" aria-live="polite">
        {paged.length === 0 ? (
          <EmptyTasks filter={filter} connected={connected} onConnect={onConnect} />
        ) : groups ? (
          groups.map(({ bucket, label, items }) => (
            <div key={bucket} className={`task-group task-group-${bucket}`}>
              <h2 className="task-group-label">{label}<span className="task-group-count">{items.length}</span></h2>
              <ul className="task-list">
                {items.map((item) => (
                  <TaskRow
                    key={item.id || `${item.title}-${item.due || 'nodue'}`}
                    item={item}
                    expanded={expandedId === (item.id || `${item.title}-${item.due || 'nodue'}`)}
                    onToggleExpand={toggleExpand}
                    onToggleDone={onToggleDone}
                    onCreateAgentJob={onCreateAgentJob}
                    creatingJobId={creatingJobId}
                    setCreatingJobId={setCreatingJobId}
                    isSubmittedView={false}
                    connected={connected}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <ul className="task-list">
            {paged.map((item) => (
              <TaskRow
                key={item.id || `${item.title}-${item.due || 'nodue'}`}
                item={item}
                expanded={expandedId === (item.id || `${item.title}-${item.due || 'nodue'}`)}
                onToggleExpand={toggleExpand}
                onToggleDone={onToggleDone}
                onCreateAgentJob={onCreateAgentJob}
                creatingJobId={creatingJobId}
                setCreatingJobId={setCreatingJobId}
                isSubmittedView={filter === 'submitted'}
                connected={connected}
                reduceMotion={reduceMotion}
              />
            ))}
          </ul>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="task-pagination" aria-label="Assignments pages">
          <button
            type="button"
            onClick={() => gotoPage(safePage - 1)}
            disabled={safePage === 0}
          >
            <span className="task-pag-caret is-prev"><Glyph name="chevron" className="h-4 w-4" /></span>
            Prev
          </button>
          <span className="task-pagination-status">
            Page <strong>{safePage + 1}</strong> of {totalPages} · {visible.length} items
          </span>
          <button
            type="button"
            onClick={() => gotoPage(safePage + 1)}
            disabled={safePage >= totalPages - 1}
          >
            Next
            <span className="task-pag-caret"><Glyph name="chevron" className="h-4 w-4" /></span>
          </button>
        </nav>
      )}
    </motion.section>
  );
}
