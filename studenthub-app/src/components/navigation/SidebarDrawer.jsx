import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BrandLogo, Glyph } from '../ui/Icons';
import { ArcMenu } from './ArcMenu';

const DRAWER_TRAVEL = 360;
const SPINE_DRAG_THRESHOLD = 18;

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home', section: 'Main' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', section: 'Main' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', section: 'Main' },
  { id: 'study', label: 'Study', icon: 'study', section: 'Main' },
  { id: 'cards', label: 'Cards', icon: 'cards', section: 'Main' },
  { id: 'agent', label: 'Agent Center', icon: 'spark', section: 'Agentic' },
  { id: 'grades', label: 'Grades', icon: 'grades', section: 'Courses' },
  { id: 'announcements', label: 'Announcements', icon: 'bell', section: 'Courses' },
  { id: 'resources', label: 'Resources', icon: 'link', section: 'Workspace' },
  { id: 'settings', label: 'Settings', icon: 'settings', section: 'Workspace' }
];

const SPINE_ITEMS = NAV_ITEMS.slice(0, 5); // Main — the always-visible tier

export function SidebarDrawer({ x, opacity, open, onOpenChange, activeView, onNavigate }) {
  const sections = [...new Set(NAV_ITEMS.map((item) => item.section))];
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [arcGesture, setArcGesture] = useState(null);
  const [suppressedClick, setSuppressedClick] = useState(false);
  const pressRef = useRef(null);

  const go = (id) => {
    setArcGesture(null);
    onNavigate(id);
    onOpenChange(false);
  };

  const toggleSection = (section) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // ── Spine gestures: tap = drawer · press-drag = arc bloom ────────────────
  const onSpinePointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    // Capture so the drag keeps reporting to the spine even after the finger
    // leaves the 28px strip — without this the arc never blooms.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* detached */ }
    pressRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, arcStarted: false };
  };

  const onSpinePointerMove = (e) => {
    const press = pressRef.current;
    if (!press || press.arcStarted || press.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SPINE_DRAG_THRESHOLD) {
      press.arcStarted = true;
      setArcGesture({ startX: press.x, startY: press.y });
    }
  };

  const onSpinePointerUp = (e) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.arcStarted) return; // arc handles its own release
    onOpenChange(true);
  };

  // After an arc drag starting on the spine, touch browsers synthesize a
  // click on the underlying dot when the finger lifts. Suppress exactly one.
  const swallowNextSpineClick = () => {
    setSuppressedClick(true);
    setTimeout(() => setSuppressedClick(false), 350);
  };
  const onSpineClickCapture = (e) => {
    if (suppressedClick && e.target.closest('.nav-spine')) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <motion.button
        type="button"
        aria-label="Close navigation"
        className="nav-backdrop"
        style={{ opacity, pointerEvents: open ? 'auto' : 'none' }}
        onClick={() => onOpenChange(false)}
      />

      {/* ── Layer 1: always-visible edge spine ──────────────────────────── */}
      <div
        className="nav-spine"
        onClickCapture={onSpineClickCapture}
        onPointerDown={onSpinePointerDown}
        onPointerMove={onSpinePointerMove}
        onPointerUp={onSpinePointerUp}
        onPointerCancel={onSpinePointerUp}
      >
        {SPINE_ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`spine-dot ${activeView === item.id ? 'is-active' : ''}`}
            aria-label={item.label}
            aria-current={activeView === item.id ? 'page' : undefined}
            onClick={(e) => { e.stopPropagation(); go(item.id); }}
          />
        ))}
        <button
          type="button"
          className="spine-handle"
          aria-label="Open full navigation"
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onOpenChange(true); }}
        >
          <Glyph name="menu" className="h-4 w-4" />
        </button>
      </div>

      {/* ── Layer 2: drag-to-reveal arc (pointer enhancement) ────────────── */}
      <ArcMenu
        items={SPINE_ITEMS}
        activeView={activeView}
        onNavigate={go}
        onDone={swallowNextSpineClick}
        gesture={arcGesture}
      />

      {/* ── Layer 3: full drawer — semantic sections, progressive reveal ─── */}
      <motion.aside
        className="drawer-panel"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -DRAWER_TRAVEL, right: 0 }}
        dragElastic={0.09}
        dragMomentum
        onDragEnd={(_, info) => {
          onOpenChange(!(info.offset.x < -72 || info.velocity.x < -520));
        }}
      >
        <div className="drawer-inner">
          <div className="drawer-head">
            <div className="drawer-head-brand">
              <span className="brand-mark"><BrandLogo /></span>
              <div>
                <strong className="drawer-head-title">BetterCLSS</strong>
                <span className="drawer-head-sub">StudentHub</span>
              </div>
            </div>
            <button type="button" className="drawer-close" onClick={() => onOpenChange(false)} aria-label="Close navigation">
              <Glyph name="close" className="h-5 w-5" />
            </button>
          </div>

          <nav className="drawer-nav" aria-label="Sections">
            {sections.map((section, si) => {
              const isCollapsed = collapsed.has(section);
              const items = NAV_ITEMS.filter((item) => item.section === section);
              return (
                <motion.section
                  key={section}
                  className="drawer-section"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * si, type: 'spring', stiffness: 380, damping: 34 }}
                >
                  <button
                    type="button"
                    className="drawer-section-head"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleSection(section)}
                  >
                    <span className="drawer-section-label">{section}</span>
                    <Glyph name="chevron" className={`drawer-section-caret ${isCollapsed ? 'is-collapsed' : ''}`} />
                  </button>
                  {!isCollapsed && (
                    <div className="drawer-section-items">
                      {items.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`drawer-link ${activeView === item.id ? 'active' : ''}`}
                          aria-current={activeView === item.id ? 'page' : undefined}
                          onClick={() => go(item.id)}
                        >
                          <span className="drawer-link-icon"><Glyph name={item.icon} className="h-[19px] w-[19px]" /></span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.section>
              );
            })}
          </nav>
        </div>
      </motion.aside>
    </>
  );
}
