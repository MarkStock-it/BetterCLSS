import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glyph } from '../ui/Icons';

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.86 };

export function StudySheet({ open, title, detail, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="study-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            className="study-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.34 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 85 || info.velocity.y > 650) onClose();
            }}
          >
            <div className="sheet-handle" />
            <header className="study-sheet-header">
              <div>
                <span className="eyebrow-mobile">Focus workspace</span>
                <h2>{title}</h2>
                <p>{detail}</p>
              </div>
              <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
                <Glyph name="close" className="h-5 w-5" />
              </button>
            </header>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
