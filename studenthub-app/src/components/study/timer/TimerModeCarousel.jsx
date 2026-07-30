import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from 'motion/react';
import { Glyph } from '../../ui/Icons';
import { MODE_CAROUSEL_SPRING } from './timer-config';

export function TimerModeCarousel({ sessions, activeId, onSelect, onAdd, onEdit, editingDisabled = false }) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const viewportRef = useRef(null);
  const itemRefs = useRef([]);
  const draggedRef = useRef(false);
  const pressRef = useRef(null);
  const holdTimerRef = useRef(null);
  const trackX = useMotionValue(0);
  const [metrics, setMetrics] = useState({ width: 280, cardWidth: 280, gap: 12 });
  const activeIndex = Math.max(0, sessions.findIndex((session) => session.id === activeId));
  const stride = metrics.cardWidth + metrics.gap;
  const inset = (metrics.width - metrics.cardWidth) / 2;
  const addIndex = sessions.length;
  const positionForIndex = (index) => inset - (index * stride);

  const settleAt = (index, animateSettle = true) => {
    const target = positionForIndex(Math.max(0, Math.min(addIndex, index)));
    if (reduceMotion || !animateSettle) {
      trackX.set(target);
      return;
    }
    animate(trackX, target, MODE_CAROUSEL_SPRING);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const width = viewport.getBoundingClientRect().width || 280;
      setMetrics({
        width,
        cardWidth: width,
        gap: 12
      });
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    settleAt(activeIndex);
  }, [activeIndex, metrics.width, metrics.cardWidth]);

  const cancelPressHold = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const handlePointerDown = (event) => {
    if (reduceMotion || event.button !== 0 || event.target.closest('.timer-mode-edit')) return;
    pressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    cancelPressHold();
    holdTimerRef.current = window.setTimeout(() => {
      if (!pressRef.current || pressRef.current.pointerId !== event.pointerId) return;
      draggedRef.current = true;
      dragControls.start(event, { snapToCursor: false });
      navigator.vibrate?.(7);
    }, 180);
  };

  const handlePointerMove = (event) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || draggedRef.current) return;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 8) {
      cancelPressHold();
      pressRef.current = null;
    }
  };

  const finishPress = (event) => {
    if (pressRef.current?.pointerId === event.pointerId) pressRef.current = null;
    cancelPressHold();
  };

  useEffect(() => () => cancelPressHold(), []);

  const selectIndex = (index, { focus = false } = {}) => {
    const safeIndex = Math.max(0, Math.min(addIndex, index));
    if (safeIndex === addIndex) {
      settleAt(activeIndex);
      onAdd();
    } else {
      onSelect(sessions[safeIndex]);
      settleAt(safeIndex);
    }
    if (focus) window.requestAnimationFrame(() => itemRefs.current[safeIndex]?.focus());
  };

  const handleKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = Math.min(addIndex, index + 1);
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = addIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    if (nextIndex < addIndex) {
      onSelect(sessions[nextIndex]);
      settleAt(nextIndex);
    } else {
      settleAt(nextIndex);
    }
    window.requestAnimationFrame(() => itemRefs.current[nextIndex]?.focus());
  };

  const handleDragEnd = (_, info) => {
    const rawIndex = Math.round((inset - trackX.get()) / stride);
    const flickDirection = info.velocity.x < -460 ? 1 : info.velocity.x > 460 ? -1 : 0;
    const intendedIndex = rawIndex === activeIndex && flickDirection
      ? activeIndex + flickDirection
      : rawIndex;
    const nextIndex = Math.max(0, Math.min(addIndex, intendedIndex));
    if (nextIndex === addIndex) {
      settleAt(activeIndex);
      onAdd();
    } else {
      onSelect(sessions[nextIndex]);
      settleAt(nextIndex);
    }
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  return (
    <div className="timer-mode-carousel" role="region" aria-roledescription="carousel" aria-label="Timer sessions">
      <div
        className="timer-mode-viewport"
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPress}
        onPointerCancel={finishPress}
      >
        <motion.div
          className="timer-mode-track"
          style={{ x: trackX, '--mode-card-width': `${metrics.cardWidth}px`, gap: `${metrics.gap}px` }}
          drag={reduceMotion ? false : 'x'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{
            left: positionForIndex(addIndex),
            right: positionForIndex(0)
          }}
          dragElastic={0.16}
          dragMomentum={false}
          onDragStart={() => {
            draggedRef.current = true;
          }}
          onDragEnd={handleDragEnd}
        >
          {sessions.map((session, index) => (
            <div className="timer-mode-card-wrap" key={session.id}>
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                className={`timer-mode-card ${session.custom ? 'custom' : 'built-in'} ${session.id === activeId ? 'active' : ''}`}
                aria-pressed={session.id === activeId}
                aria-label={`${session.label}, ${session.minutes} minutes${session.custom ? ', custom session' : ''}`}
                tabIndex={session.id === activeId ? 0 : -1}
                onFocus={() => settleAt(index)}
                onClick={() => {
                  if (!draggedRef.current) selectIndex(index);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="timer-mode-card-icon"><Glyph name={session.icon} className="h-[18px] w-[18px]" /></span>
                <span className="timer-mode-card-copy">
                  <strong>{session.label}</strong>
                  <small>{session.minutes} min</small>
                </span>
                <span className="timer-mode-card-kind">{session.custom ? 'Custom' : 'Preset'}</span>
              </button>
              {session.custom && (
                <button
                  type="button"
                  className="timer-mode-edit"
                  aria-label={`Edit ${session.label}`}
                  tabIndex={session.id === activeId ? 0 : -1}
                  disabled={editingDisabled}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={() => settleAt(index)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(session);
                  }}
                >
                  <Glyph name="settings" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="timer-mode-card-wrap add" key="add-session">
            <button
              ref={(element) => {
                itemRefs.current[addIndex] = element;
              }}
              type="button"
              className="timer-mode-card add"
              aria-label="Add custom timer session"
              tabIndex="0"
              onFocus={() => settleAt(addIndex)}
              onClick={() => {
                if (!draggedRef.current) {
                  settleAt(activeIndex);
                  onAdd();
                }
              }}
              onKeyDown={(event) => handleKeyDown(event, addIndex)}
            >
              <span className="timer-mode-add-icon" aria-hidden="true">+</span>
              <span className="timer-mode-card-copy">
                <strong>New session</strong>
                <small>Name your rhythm</small>
              </span>
            </button>
          </div>
        </motion.div>
      </div>
      <div className="timer-mode-position" aria-live="polite">
        <span><strong>{sessions[activeIndex]?.label}</strong> · {activeIndex + 1} of {sessions.length}</span>
        <div className="timer-mode-dots" aria-hidden="true">
          {sessions.map((session) => <i className={session.id === activeId ? 'active' : ''} key={session.id} />)}
        </div>
      </div>
    </div>
  );
}
