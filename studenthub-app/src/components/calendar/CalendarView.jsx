import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { daysUntil, smartSort } from "../../lib/dashboard-data";
import { Glyph } from "../ui/Icons";
import { ViewHeading, ViewModeTabs } from "../ui/ViewControls";

const SPRING = { type: "spring", stiffness: 430, damping: 38, mass: 0.86 };

export function CalendarView({ calendarView, onViewChange, assignments, savedEvents, onToggleDone }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const today = new Date();
  const calendarDateKey = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  const todayKey = calendarDateKey(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthGridStart = new Date(today.getFullYear(), today.getMonth(), 1 - monthStart.getDay());
  const monthCellCount = Math.ceil((monthStart.getDay() + new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()) / 7) * 7;
  const monthDates = Array.from({ length: monthCellCount }, (_, index) => {
    const date = new Date(monthGridStart);
    date.setDate(monthGridStart.getDate() + index);
    return date;
  });
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const tasksByDate = useMemo(() => {
    const grouped = new Map();
    assignments.forEach((assignment) => {
      const dueKey = String(assignment.due || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueKey)) return;
      if (!grouped.has(dueKey)) grouped.set(dueKey, []);
      grouped.get(dueKey).push(assignment);
    });
    return grouped;
  }, [assignments]);
  const events = useMemo(
    () => smartSort([
      ...assignments.filter((item) => !item.done),
      ...savedEvents.map((event) => ({
        id: `event-${event.id}`,
        title: event.title,
        subject: event.type || 'Event',
        due: event.date,
        done: false,
        priority: 'low'
      }))
    ]).slice(0, 8),
    [assignments, savedEvents]
  );

  useEffect(() => {
    setSelectedDate(null);
  }, [calendarView]);

  const tasksForDate = (key, includeCompleted = true) => (
    (tasksByDate.get(key) || []).filter((task) => includeCompleted || !task.done)
  );

  const urgencyForDate = (key) => {
    const pendingCount = tasksForDate(key, false).length;
    if (!pendingCount) return null;
    if (key < todayKey) return 'overdue';
    if (key === todayKey) return 'due-today';
    return 'upcoming';
  };

  const toggleSelectedDate = (key) => {
    setSelectedDate((current) => current === key ? null : key);
  };

  const dateButton = (date, { muted = false, week = false } = {}) => {
    const key = calendarDateKey(date);
    const pendingCount = tasksForDate(key, false).length;
    const urgency = urgencyForDate(key);
    const isToday = key === todayKey;
    const isSelected = key === selectedDate;
    const dateLabel = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const urgencyLabel = urgency === 'overdue'
      ? 'overdue'
      : urgency === 'due-today'
        ? 'due today'
        : 'scheduled';
    const className = [
      week ? 'week-column' : 'calendar-day-mobile',
      muted ? 'muted' : '',
      isToday ? (week ? 'current' : 'today') : '',
      isSelected ? 'selected' : '',
      urgency ? `has-tasks ${urgency}` : ''
    ].filter(Boolean).join(' ');
    return (
      <motion.button
        type="button"
        className={className}
        onClick={() => toggleSelectedDate(key)}
        aria-pressed={isSelected}
        aria-label={`${isToday ? 'Today, ' : ''}${dateLabel}. ${pendingCount ? `${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} ${urgencyLabel}.` : 'Nothing due.'}`}
        whileTap={{ scale: 0.9 }}
        key={key}
      >
        {week && <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>}
        <strong className={week ? undefined : 'calendar-date-number'}>{date.getDate()}</strong>
        {pendingCount > 0 && (
          pendingCount > 1
            ? <span className="calendar-task-count" aria-hidden="true">{pendingCount > 9 ? '9+' : pendingCount}</span>
            : <span className="calendar-task-dot" aria-hidden="true"><i /></span>
        )}
      </motion.button>
    );
  };

  const selectedTasks = selectedDate ? tasksForDate(selectedDate) : [];
  const selectedDateValue = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;
  const dateTaskPanel = selectedDate && (
    <motion.section
      className="calendar-day-tasks"
      key={`calendar-tasks-${selectedDate}`}
      aria-label={`Tasks due ${selectedDateValue.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header>
        <div>
          <span className="eyebrow-mobile">Due this day</span>
          <h3>{selectedDateValue.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
        </div>
        <button type="button" onClick={() => setSelectedDate(null)} aria-label="Collapse daily tasks">
          <Glyph name="chevron" className="h-4 w-4" />
        </button>
      </header>
      {selectedTasks.length ? (
        <div className="calendar-day-task-list">
          {selectedTasks.map((task, index) => (
            <label className={`calendar-day-task ${task.done ? 'done' : ''}`} key={`${task.source || 'task'}-${task.id || index}`}>
              <input
                type="checkbox"
                checked={Boolean(task.done)}
                onChange={() => onToggleDone(task)}
                aria-label={`${task.done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
              />
              <span className="calendar-task-check" aria-hidden="true"><Glyph name="spark" className="h-3.5 w-3.5" /></span>
              <span>
                <strong>{task.title || 'Untitled task'}</strong>
                <small>{task.subject || 'Coursework'}</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="calendar-nothing-due" role="status">
          <Glyph name="spark" className="h-4 w-4" />
          <span><strong>Nothing due</strong><small>This date is clear.</small></span>
        </div>
      )}
    </motion.section>
  );

  return (
    <motion.section key={`calendar-${calendarView}`} className="view-stack" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
      <ViewHeading eyebrow="Schedule" title="Calendar" detail={`${calendarView[0].toUpperCase()}${calendarView.slice(1)} view`} />
      <ViewModeTabs
        label="Calendar views"
        value={calendarView}
        onChange={onViewChange}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'agenda', label: 'Agenda' },
          { value: 'week', label: 'Week' },
          { value: 'day', label: 'Day' }
        ]}
      />
      <section className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <span className="eyebrow-mobile">Current month</span>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-white">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          </div>
          <span className="count-pill">{calendarView}</span>
        </div>
        <AnimatePresence mode="wait">
          {calendarView === 'month' && (
            <motion.div key="month-grid" className="calendar-month-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="calendar-month-grid">
                {'SMTWTFS'.split('').map((day, index) => <span key={`${day}-${index}`} className="calendar-weekday-label">{day}</span>)}
                {monthDates.map((date) => dateButton(date, { muted: date.getMonth() !== today.getMonth() }))}
              </div>
              <AnimatePresence initial={false}>{dateTaskPanel}</AnimatePresence>
            </motion.div>
          )}

          {calendarView === 'agenda' && (
            <motion.div key="agenda-list" className="calendar-agenda" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {events.length ? events.map((event, index) => (
                <article className="agenda-event" key={event.id || `${event.title}-${index}`}>
                  <span className={`agenda-dot ${index === 0 ? 'urgent' : ''}`} />
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.subject || 'Course'} · {event.due || 'No due date'}</p>
                  </div>
                </article>
              )) : <p className="study-empty-copy">No scheduled coursework or events.</p>}
            </motion.div>
          )}

          {calendarView === 'week' && (
            <motion.div key="week-board" className="calendar-week-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="week-board">
                {weekDates.map((date) => dateButton(date, { week: true }))}
              </div>
              <AnimatePresence initial={false}>{dateTaskPanel}</AnimatePresence>
            </motion.div>
          )}

          {calendarView === 'day' && (
            <motion.div key="day-timeline" className="day-timeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {['09:00', '11:00', '14:00', '16:00'].map((time, index) => (
                <div className="timeline-row" key={time}>
                  <time>{time}</time>
                  <span />
                  {index === 1 && events[0] && <article><strong>{events[0].title}</strong><small>{events[0].subject || 'Coursework'}</small></article>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.section>
  );
}

