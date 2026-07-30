import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Glyph } from '../../ui/Icons';

export function GestureTimerRing({
  running,
  timeLeft,
  formattedTime,
  remainingRatio,
  activeMode,
  blocked = false,
  onToggle,
  onReset,
  onScrub
}) {
  const reduceMotion = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [resetCommitted, setResetCommitted] = useState(false);
  const [scrubTick, setScrubTick] = useState(null);
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem('bclss_timer_ring_hint_seen') !== '1';
    } catch {
      return true;
    }
  });
  const surfaceRef = useRef(null);
  const gestureRef = useRef(null);
  const holdTimerRef = useRef(null);
  const tickIdRef = useRef(0);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem('bclss_timer_ring_hint_seen', '1');
    } catch {
      // The gesture hint can safely return when browser storage is unavailable.
    }
  };

  const angleAtPoint = (clientX, clientY) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    return Math.atan2(
      clientY - (bounds.top + (bounds.height / 2)),
      clientX - (bounds.left + (bounds.width / 2))
    ) * (180 / Math.PI);
  };

  const cancelHold = () => {
    clearHoldTimer();
    setHolding(false);
  };

  const handlePointerDown = (event) => {
    if (blocked || event.button !== 0) return;
    event.preventDefault();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    const startAngle = angleAtPoint(event.clientX, event.clientY);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSeconds: Math.max(60, Math.round(timeLeft / 60) * 60),
      lastSeconds: timeLeft,
      lastAngle: startAngle,
      totalAngle: 0,
      minuteDelta: 0,
      moved: false,
      scrubbing: false,
      resetCommitted: false
    };
    setHolding(true);
    setResetCommitted(false);
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      if (!gestureRef.current || gestureRef.current.pointerId !== event.pointerId) return;
      gestureRef.current.resetCommitted = true;
      setResetCommitted(true);
      onReset();
      dismissHint();
      navigator.vibrate?.([24, 35, 24]);
    }, 1000);
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.resetCommitted) return;
    const travel = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (travel <= 8 && !gesture.scrubbing) return;
    gesture.moved = true;
    cancelHold();
    if (running) return;

    gesture.scrubbing = true;
    setScrubbing(true);
    const nextAngle = angleAtPoint(event.clientX, event.clientY);
    let angleDelta = nextAngle - gesture.lastAngle;
    if (angleDelta > 180) angleDelta -= 360;
    if (angleDelta < -180) angleDelta += 360;
    gesture.lastAngle = nextAngle;
    gesture.totalAngle += angleDelta;

    const nextMinuteDelta = Math.round(gesture.totalAngle / 72);
    if (nextMinuteDelta === gesture.minuteDelta) return;
    const nextSeconds = Math.max(60, Math.min(120 * 60, gesture.startSeconds + (nextMinuteDelta * 60)));
    gesture.minuteDelta = nextMinuteDelta;
    if (nextSeconds === gesture.lastSeconds) return;
    const direction = nextSeconds > gesture.lastSeconds ? 1 : -1;
    gesture.lastSeconds = nextSeconds;
    onScrub(nextSeconds);
    tickIdRef.current += 1;
    setScrubTick({ id: tickIdRef.current, direction });
    navigator.vibrate?.(8);
  };

  const finishPointerGesture = (event, cancelled = false) => {
    clearHoldTimer();
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!cancelled && !gesture.resetCommitted && !gesture.scrubbing && !gesture.moved) {
      onToggle();
      dismissHint();
    }
    setHolding(false);
    setScrubbing(false);
    gestureRef.current = null;
    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => setResetCommitted(false), 280);
  };

  useEffect(() => () => clearHoldTimer(), []);

  useEffect(() => {
    if (!showHint) return undefined;
    const timeout = window.setTimeout(dismissHint, 7200);
    return () => window.clearTimeout(timeout);
  }, [showHint]);

  const stateLabel = blocked
    ? 'Choose above'
    : resetCommitted
    ? 'Reset'
    : holding
      ? 'Keep holding'
      : scrubbing
        ? 'Adjusting'
        : running
          ? 'In focus'
          : 'Ready';

  return (
    <div className="timer-ring-shell">
      <div
        ref={surfaceRef}
        className={`timer-hero timer-ring-control ${running ? 'is-running' : 'is-paused'} ${holding ? 'is-holding' : ''} ${scrubbing ? 'is-scrubbing' : ''} ${resetCommitted ? 'is-reset' : ''} ${blocked ? 'is-blocked' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        aria-hidden="true"
      >
        <div className={`timer-aura ${running ? 'active' : ''}`} />
        <svg className="timer-ring-svg" viewBox="0 0 320 320">
          <defs>
            <linearGradient id="focus-ring-gradient" x1="38" y1="42" x2="280" y2="286" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9d6cff" />
              <stop offset=".52" stopColor="#718cff" />
              <stop offset="1" stopColor="#43dec0" />
            </linearGradient>
            <linearGradient id="reset-ring-gradient" x1="30" y1="30" x2="290" y2="290" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4ba72" />
              <stop offset="1" stopColor="#ff7188" />
            </linearGradient>
            <filter id="focus-ring-glow"><feGaussianBlur stdDeviation="7" /></filter>
          </defs>
          <circle className="timer-track" cx="160" cy="160" r="135" />
          <motion.circle
            className="timer-ring-glow"
            cx="160"
            cy="160"
            r="135"
            pathLength="1"
            initial={false}
            animate={{ pathLength: remainingRatio }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
          />
          <motion.circle
            className="timer-ring-progress"
            cx="160"
            cy="160"
            r="135"
            pathLength="1"
            initial={false}
            animate={{ pathLength: remainingRatio }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
          />
          <motion.circle
            className="timer-reset-commit"
            cx="160"
            cy="160"
            r="149"
            pathLength="1"
            initial={false}
            animate={{ pathLength: holding ? 1 : 0, opacity: holding ? 1 : 0 }}
            transition={reduceMotion
              ? { duration: 0 }
              : holding
                ? { pathLength: { duration: 1, ease: 'linear' }, opacity: { duration: 0.12 } }
                : { duration: 0.18 }}
          />
          <AnimatePresence>
            {scrubTick && (
              <motion.circle
                key={scrubTick.id}
                className="timer-scrub-tick"
                cx="160"
                cy="160"
                r="143"
                pathLength="1"
                initial={{ opacity: 0, pathLength: 0.94, scale: 0.985 }}
                animate={{ opacity: [0, 0.78, 0], pathLength: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </svg>
        <motion.div
          className="timer-readout"
          key={scrubTick?.id || 'timer-readout'}
          initial={scrubTick && !reduceMotion ? { scale: 0.98 } : false}
          animate={{ scale: running ? 1.02 : 1 }}
          transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
        >
          <span>{stateLabel}</span>
          <strong>{formattedTime}</strong>
          <small>{blocked ? 'Resume or discard' : resetCommitted ? 'Timer restored' : holding ? 'Release to cancel' : activeMode === 'long' ? 'Long break' : activeMode}</small>
        </motion.div>
        <AnimatePresence>
          {scrubTick && scrubbing && (
            <motion.span
              key={`feedback-${scrubTick.id}`}
              className="timer-scrub-feedback"
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3 }}
              transition={reduceMotion ? { duration: 0 } : WORKLOAD_SPRING}
            >
              {scrubTick.direction > 0 ? '+1 min' : '−1 min'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showHint && !blocked && (
          <motion.div
            className="timer-gesture-hint"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
          >
            <span><Glyph name="play" className="h-3.5 w-3.5" />Tap</span>
            <span><Glyph name="sync" className="h-3.5 w-3.5" />Paused: drag</span>
            <span><Glyph name="reset" className="h-3.5 w-3.5" />Hold to reset</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="timer-accessible-controls" role="group" aria-label="Timer controls">
        <button type="button" className="timer-accessible-control timer-primary-control" onClick={onToggle} disabled={blocked}>
          <Glyph name={running ? 'pause' : 'play'} className="h-4 w-4" />
          {running ? 'Pause timer' : remainingRatio < 1 && timeLeft > 0 ? 'Resume timer' : 'Start timer'}
        </button>
        <button type="button" className="timer-accessible-control timer-reset-control" onClick={onReset} disabled={blocked}>
          <Glyph name="reset" className="h-4 w-4" />
          Reset timer
        </button>
      </div>
      <span className="timer-screenreader-status" role="timer">
        {formattedTime} remaining. Timer {running ? 'running' : 'paused'}.
      </span>
    </div>
  );
}
