import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glyph } from '../ui/Icons';

const STUDY_AREA_TABS = [
  { id: 'timer', label: 'Timer', icon: 'clock' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'cards', label: 'Cards', icon: 'cards' }
];

export function StudyBlobTabs({ value, onChange }) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);
  const wrapperRef = useRef(null);
  const tabRefs = useRef({});
  const holdTimerRef = useRef(null);
  const gestureRef = useRef(null);
  const dragTargetRef = useRef(null);
  const suppressClickRef = useRef(false);
  const isExpanded = Boolean(reduceMotion) || expanded;

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const tabAtPoint = (clientX, clientY) => {
    const wrapperBounds = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperBounds) return null;
    let nearest = null;
    let nearestDistance = 54;
    STUDY_AREA_TABS.forEach((tab, index) => {
      const distance = Math.hypot(
        clientX - (wrapperBounds.left + (wrapperBounds.width * ((index + 0.5) / STUDY_AREA_TABS.length))),
        clientY - (wrapperBounds.top + 28)
      );
      if (distance < nearestDistance) {
        nearest = tab.id;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const selectTab = (tabId, { collapse = true } = {}) => {
    if (!STUDY_AREA_TABS.some((tab) => tab.id === tabId)) return;
    onChange(tabId);
    if (collapse && !reduceMotion) setExpanded(false);
    dragTargetRef.current = null;
    setDragTarget(null);
  };

  const handleTabClick = (tabId) => {
    if (suppressClickRef.current) return;
    if (tabId === value) {
      if (!reduceMotion) setExpanded((current) => !current);
      return;
    }
    selectTab(tabId);
  };

  const handleKeyDown = (event, tabId) => {
    const currentIndex = STUDY_AREA_TABS.findIndex((tab) => tab.id === tabId);
    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % STUDY_AREA_TABS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + STUDY_AREA_TABS.length) % STUDY_AREA_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = STUDY_AREA_TABS.length - 1;
    if (event.key === 'Escape' && !reduceMotion) {
      event.preventDefault();
      setExpanded(false);
      tabRefs.current[value]?.focus();
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = STUDY_AREA_TABS[nextIndex];
    selectTab(nextTab.id);
    window.requestAnimationFrame(() => tabRefs.current[nextTab.id]?.focus());
  };

  const handlePointerDown = (event) => {
    if (reduceMotion || isExpanded || event.button !== 0) return;
    const tabButton = event.target.closest('[data-study-tab]');
    if (!tabButton || tabButton.dataset.studyTab !== value) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      if (!gestureRef.current || gestureRef.current.pointerId !== event.pointerId) return;
      gestureRef.current.dragging = true;
      wrapperRef.current?.setPointerCapture(event.pointerId);
      setExpanded(true);
      dragTargetRef.current = value;
      setDragTarget(value);
    }, 280);
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > 10) {
        clearHoldTimer();
        gestureRef.current = null;
      }
      return;
    }
    event.preventDefault();
    const nextTarget = tabAtPoint(event.clientX, event.clientY);
    dragTargetRef.current = nextTarget;
    setDragTarget(nextTarget);
  };

  const finishPointerGesture = (event, cancelled = false) => {
    clearHoldTimer();
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging) {
      event.preventDefault();
      const selected = cancelled ? null : dragTargetRef.current;
      if (selected) selectTab(selected);
      else if (!reduceMotion) setExpanded(false);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (wrapperRef.current?.hasPointerCapture(event.pointerId)) {
        wrapperRef.current.releasePointerCapture(event.pointerId);
      }
    }
    gestureRef.current = null;
    dragTargetRef.current = null;
    setDragTarget(null);
  };

  useEffect(() => () => clearHoldTimer(), []);

  useEffect(() => {
    if (!expanded || reduceMotion) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [expanded, reduceMotion]);

  return (
    <motion.div
      ref={wrapperRef}
      className={`study-tabs study-blob-tabs study-dimmable ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${dragTarget ? 'is-dragging' : ''}`}
      role="tablist"
      aria-label="Study area"
      aria-orientation="horizontal"
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointerGesture(event)}
      onPointerCancel={(event) => finishPointerGesture(event, true)}
    >
      {STUDY_AREA_TABS.map((tab, index) => {
        const active = value === tab.id;
        const highlighted = dragTarget === tab.id;
        return (
          <motion.button
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`study-tab-${tab.id}`}
            aria-controls={`study-panel-${tab.id}`}
            aria-selected={active}
            aria-expanded={active ? isExpanded : undefined}
            aria-label={`${tab.label}${active && !isExpanded ? '. Activate to show all study tabs.' : ''}`}
            tabIndex={active ? 0 : -1}
            data-study-tab={tab.id}
            data-drag-target={highlighted ? 'true' : 'false'}
            className={`study-blob-tab ${active ? 'active' : ''}`}
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            animate={{
              left: isExpanded ? `${((index + 0.5) / STUDY_AREA_TABS.length) * 100}%` : '50%',
              width: isExpanded ? 54 : active ? 128 : 48,
              height: isExpanded ? 54 : active ? 50 : 44,
              opacity: isExpanded || active ? 1 : 0,
              scale: isExpanded || active ? 1 : 0.38,
              y: isExpanded ? -4 : active ? 0 : 9
            }}
            transition={reduceMotion ? { duration: 0 } : {
              type: 'spring',
              stiffness: 350,
              damping: 22,
              mass: 0.72,
              delay: isExpanded ? index * 0.045 : (STUDY_AREA_TABS.length - index - 1) * 0.018
            }}
          >
            <span className="study-blob-tab-icon"><Glyph name={tab.icon} className="h-4 w-4" /></span>
            <span className="study-blob-tab-label">{tab.label}</span>
          </motion.button>
        );
      })}
      <span className="study-blob-hint" aria-hidden="true">
        {isExpanded ? 'Choose a space' : 'Tap or hold'}
      </span>
    </motion.div>
  );
}
