import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EmptyDeadlines } from '../home/HomeOverview';
import { Glyph } from '../ui/Icons';
import { ViewHeading, ViewModeTabs } from '../ui/ViewControls';
import { daysUntil, smartSort, canCreateAgentJob, createAgentJobSafe } from '../../lib/dashboard-data';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };
const TASKS_PER_PAGE = 5;

export function TasksView({ assignments, filter, onFilterChange, connected, onConnect, onToggleDone, onCreateAgentJob }) {
  const [page, setPage] = useState(1);
  const [creatingJobId, setCreatingJobId] = useState(null);
  const listStartRef = useRef(null);
  const visible = useMemo(() => smartSort(assignments).filter((item) => {
    const days = daysUntil(item.due);
    if (filter === 'overdue') return !item.done && days !== null && days < 0;
    if (filter === 'submitted') return item.done;
    return !item.done;
  }), [assignments, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / TASKS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * TASKS_PER_PAGE;
  const pageItems = visible.slice(startIndex, startIndex + TASKS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const changePage = (nextPage) => {
    const clampedPage = Math.max(1, Math.min(nextPage, pageCount));
    if (clampedPage === safePage) return;
    setPage(clampedPage);
    window.requestAnimationFrame(() => {
      listStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleCreateAgentJob = async (assignment, e) => {
    e.stopPropagation?.();
    if (creatingJobId) return;
    const canCreate = canCreateAgentJob(assignment);
    if (!canCreate) {
      alert('This assignment type may not be supported by Agentic Helper yet.');
      return;
    }
    setCreatingJobId(assignment.id);
    try {
      const job = await createAgentJobSafe(assignment, (error) => {
        alert(`Could not create agent job:\n\n${error}`);
      });
      if (job) onCreateAgentJob?.(job);
    } finally {
      setCreatingJobId(null);
    }
  };

  return (
    <motion.section key={`tasks-${filter}`} className="view-stack tasks-view" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Coursework" title="Tasks" detail={`${filter[0].toUpperCase()}${filter.slice(1)} assignments`} />
      <ViewModeTabs
        label="Task filters"
        value={filter}
        onChange={onFilterChange}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'submitted', label: 'Submitted' }
        ]}
      />
      <section className="section-card tasks-card" ref={listStartRef}>
        {visible.length ? (
          <>
            <div className="task-page-summary" aria-live="polite">
              <span>Showing {startIndex + 1}–{Math.min(startIndex + TASKS_PER_PAGE, visible.length)} of {visible.length}</span>
              <strong>{filter}</strong>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${filter}-${safePage}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                {pageItems.map((item, index) => {
                  const isCreating = creatingJobId === item.id;
                  return (
                    <div key={`${item.id || item.title}-${startIndex + index}`} className="task-row-wrapper">
                      <button
                        type="button"
                        className="deadline-row task-toggle-row mb-3 last:mb-0"
                        onClick={() => onToggleDone(item)}
                        aria-pressed={Boolean(item.done)}
                        aria-label={`${item.done ? 'Mark pending' : 'Mark submitted'}: ${item.title}`}
                      >
                        <span className={`priority-rail ${item.priority || 'medium'}`} />
                        <div className="min-w-0 flex-1">
                          <h3 className="task-title truncate text-sm font-semibold">{item.title}</h3>
                          <p className="task-meta mt-1 text-xs">{item.subject || 'Course'} · {item.due || 'No due date'}</p>
                        </div>
                        <button
                          type="button"
                          className={`deadline-agent-button task-agent-button ${isCreating ? 'is-creating' : ''}`}
                          onClick={(e) => handleCreateAgentJob(item, e)}
                          disabled={isCreating || !connected}
                          title={!connected ? 'Connect Canvas' : 'Create agent job'}
                          aria-label={`Create agent job for ${item.title}`}
                        >
                          {isCreating ? (
                            <span className="agent-spinner-tiny" aria-hidden="true" />
                          ) : (
                            <Glyph name="spark" className="h-4 w-4" />
                          )}
                        </button>
                        <span className={`task-done-control ${item.done ? 'done' : ''}`} aria-hidden="true">
                          <Glyph name={item.done ? 'spark' : 'tasks'} className="h-4 w-4" />
                        </span>
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
            {pageCount > 1 && (
              <nav className="task-pagination" aria-label="Task pages">
                <button
                  type="button"
                  onClick={() => changePage(safePage - 1)}
                  disabled={safePage === 1}
                  aria-label="Previous task page"
                >
                  <Glyph name="chevron" className="h-4 w-4 rotate-90" />
                  <span>Previous</span>
                </button>
                <span className="task-page-status">
                  <strong>{safePage}</strong>
                  <span>of {pageCount}</span>
                </span>
                <button
                  type="button"
                  onClick={() => changePage(safePage + 1)}
                  disabled={safePage === pageCount}
                  aria-label="Next task page"
                >
                  <span>Next</span>
                  <Glyph name="chevron" className="h-4 w-4 -rotate-90" />
                </button>
              </nav>
            )}
          </>
        ) : <EmptyDeadlines connected={connected} onConnect={onConnect} />}
      </section>
    </motion.section>
  );
}
