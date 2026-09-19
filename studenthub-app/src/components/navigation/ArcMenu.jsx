import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../ui/Icons';

const ARC_RADIUS = 124;
const DRAG_OPEN_DISTANCE = 14;
const HOT_RADIUS = 34;
// Degrees, 0 = due east of the anchor. Fanned upward to clear content.
const ANGLES = [-70, -35, 0, 35, 70];

const rad = (deg) => (deg * Math.PI) / 180;
// The spine lives on the left edge: fan opens eastward. (Mirrored if a
// right-edge anchor is ever used — derived from the anchor itself so the
// render and the hit-test can never disagree.)
const fanAngle = (i, anchorX) => rad(anchorX < window.innerWidth / 2 ? ANGLES[i] : 180 - ANGLES[i]);

const nodePoint = (i, ax, ay) => ({
  x: ax + Math.cos(fanAngle(i, ax)) * ARC_RADIUS,
  y: ay + Math.sin(fanAngle(i, ax)) * ARC_RADIUS
});

function hitTest(cx, cy, ax, ay, ids) {
  for (let i = 0; i < Math.min(ANGLES.length, ids.length); i += 1) {
    const { x, y } = nodePoint(i, ax, ay);
    if (Math.hypot(cx - x, cy - y) <= HOT_RADIUS) return ids[i];
  }
  return null;
}

/**
 * Drag-to-reveal radial menu (Image-1 pattern). Pure pointer enhancement:
 * the always-visible edge spine in SidebarDrawer is the keyboard and
 * screen-reader path, so this layer is aria-hidden by design. It mounts only
 * while a gesture is live — zero cost when idle.
 */
export function ArcMenu({ items, activeView, onNavigate, onDone, gesture }) {
  const [anchor, setAnchor] = useState(null);
  const [hover, setHover] = useState(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const ids = items.slice(0, ANGLES.length).map((item) => item.id);

  useEffect(() => {
    if (!gesture) return;
    const { startX, startY } = gesture;
    setAnchor({ x: startX, y: startY });

    const onMove = (e) => {
      setHover(hitTest(e.clientX, e.clientY, startX, startY, ids));
    };
    const onEnd = (e) => {
      const picked = hitTest(e.clientX, e.clientY, startX, startY, ids);
      teardown();
      if (picked) onNavigate(picked);
    };
    const teardown = () => {
      setAnchor(null);
      setHover(null);
      doneRef.current?.();
    };
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('pointercancel', teardown, true);
    return () => {
      document.removeEventListener('pointermove', onMove, { capture: true });
      document.removeEventListener('pointerup', onEnd, true);
      document.removeEventListener('pointercancel', teardown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture]);

  if (!anchor) return null;

  return createPortal(
    <div className="arc-menu-layer" aria-hidden="true">
      {/* dim + catch stray taps outside the bloom */}
      <div
        className="arc-menu-scrim"
        onPointerDown={(e) => {
          e.preventDefault();
          setAnchor(null);
          setHover(null);
        }}
      />
      <svg className="arc-menu-guides" width="100%" height="100%">
        {items.slice(0, ANGLES.length).map((item, i) => {
          const { x, y } = nodePoint(i, anchor.x, anchor.y);
          return (
            <line
              key={item.id}
              x1={anchor.x} y1={anchor.y} x2={x} y2={y}
              className={hover === item.id ? 'is-hot' : ''}
            />
          );
        })}
      </svg>
      {items.slice(0, ANGLES.length).map((item, i) => {
        const { x, y } = nodePoint(i, anchor.x, anchor.y);
        return (
          <div
            key={item.id}
            className={`arc-menu-node ${hover === item.id ? 'is-hot' : ''} ${activeView === item.id ? 'is-active' : ''}`}
            style={{ transform: `translate(${x - HOT_RADIUS}px, ${y - HOT_RADIUS}px)` }}
          >
            <Glyph name={item.icon} className="h-5 w-5" />
            <span className="arc-menu-label">{item.label}</span>
          </div>
        );
      })}
      <div className="arc-menu-origin" style={{ transform: `translate(${anchor.x - 4}px, ${anchor.y - 4}px)` }} />
    </div>,
    document.body
  );
}
