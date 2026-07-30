import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dateKey, daysUntil } from "../../lib/dashboard-data";
import { Glyph } from "../ui/Icons";

const DECKS_PER_PAGE = 5;
const SPRING = { type: "spring", stiffness: 430, damping: 38, mass: 0.86 };

export function CardsStudySection({ decks, onCreateDeck }) {
  const reduceMotion = useReducedMotion();
  const draggingRef = useRef(false);
  const deckListRef = useRef(null);
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [deckPage, setDeckPage] = useState(1);
  const [reviewCards, setReviewCards] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [reviewDirection, setReviewDirection] = useState(0);
  const [results, setResults] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [reviewLedger, setReviewLedger] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bclss_card_reviews') || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) || null;
  const activeCard = reviewCards[reviewIndex] || null;
  const reviewComplete = Boolean(selectedDeck && reviewCards.length && reviewIndex >= reviewCards.length);
  const today = dateKey();
  const deckPageCount = Math.max(1, Math.ceil(decks.length / DECKS_PER_PAGE));
  const safeDeckPage = Math.min(deckPage, deckPageCount);
  const deckPageStart = (safeDeckPage - 1) * DECKS_PER_PAGE;
  const visibleDecks = decks.slice(deckPageStart, deckPageStart + DECKS_PER_PAGE);

  useEffect(() => {
    try {
      localStorage.setItem('bclss_card_reviews', JSON.stringify(reviewLedger));
    } catch {
      // Review state remains available for the current session if storage is restricted.
    }
  }, [reviewLedger]);

  useEffect(() => {
    setDeckPage((current) => Math.min(current, deckPageCount));
  }, [deckPageCount]);

  const changeDeckPage = (nextPage) => {
    const clampedPage = Math.max(1, Math.min(nextPage, deckPageCount));
    if (clampedPage === safeDeckPage) return;
    setDeckPage(clampedPage);
    window.requestAnimationFrame(() => {
      deckListRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const cardReviewKey = (deckId, cardId) => `${deckId}:${cardId}`;
  const dueCountForDeck = (deck) => deck.cards.filter((card) => {
    if (card.done) return false;
    const review = reviewLedger[cardReviewKey(deck.id, card.id)];
    if (review?.date === today) return review.rating !== 'got-it';
    if (deck.generated) return true;
    const days = daysUntil(card.due);
    return days !== null && days <= 0;
  }).length;

  const startDeck = (deck, cardIds = null) => {
    setSelectedDeckId(deck.id);
    const cards = cardIds
      ? cardIds.map((id) => deck.cards.find((card) => String(card.id) === String(id))).filter(Boolean)
      : [...deck.cards];
    setReviewCards(cards);
    setReviewIndex(0);
    setCardFlipped(false);
    setReviewDirection(0);
    setResults({});
    setAnnouncement(cards.length ? `${deck.title} review started.` : `${deck.title} has no cards.`);
  };

  const leaveDeck = () => {
    setSelectedDeckId(null);
    setReviewCards([]);
    setReviewIndex(0);
    setCardFlipped(false);
    setResults({});
    setAnnouncement('Deck list opened.');
  };

  const markCard = (rating) => {
    if (!activeCard) return;
    const direction = rating === 'got-it' ? 1 : -1;
    const currentNumber = reviewIndex + 1;
    setReviewDirection(direction);
    setCardFlipped(false);
    setResults((current) => ({ ...current, [activeCard.id]: rating }));
    setReviewLedger((current) => ({
      ...current,
      [cardReviewKey(selectedDeck.id, activeCard.id)]: {
        rating,
        date: today,
        reviewedAt: new Date().toISOString()
      }
    }));
    setAnnouncement(`${rating === 'got-it' ? 'Got it' : 'Review again'} marked for card ${currentNumber}.`);
    setReviewIndex((current) => current + 1);
  };

  const toggleCard = () => {
    if (!activeCard || draggingRef.current) return;
    setCardFlipped((current) => !current);
    setAnnouncement(cardFlipped ? 'Card front shown.' : 'Card answer shown.');
  };

  if (!selectedDeck) {
    return (
      <motion.section
        className="cards-workspace"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <header className="cards-library-heading">
          <span className="cards-library-mark" aria-hidden="true"><Glyph name="study" className="h-5 w-5" /></span>
          <div>
            <span className="eyebrow-mobile">Your library</span>
            <h2>Choose a deck</h2>
            <p>Flip, decide, and move through one card at a time.</p>
          </div>
        </header>

        {decks.length ? (
          <>
            <div className="deck-page-summary" aria-live="polite">
              Showing {deckPageStart + 1}–{Math.min(deckPageStart + DECKS_PER_PAGE, decks.length)} of {decks.length} decks
            </div>
            <div className="deck-selection-list" ref={deckListRef} role="group" aria-label="Available study decks">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  className="deck-selection-page"
                  key={`deck-page-${safeDeckPage}`}
                  initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  {visibleDecks.map((deck, index) => {
                    const dueCount = dueCountForDeck(deck);
                    return (
                      <motion.button
                        type="button"
                        className="deck-selection-row"
                        onClick={() => startDeck(deck)}
                        key={deck.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: index * 0.035 }}
                        aria-label={`${deck.title}. ${deck.cards.length} cards. ${dueCount} due for review today.`}
                      >
                        <span className={`deck-selection-glyph ${deck.generated ? 'generated' : ''}`} aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span className="deck-selection-copy">
                          <strong>{deck.title}</strong>
                          <small>{deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}</small>
                        </span>
                        <span className={`deck-due-count ${dueCount ? '' : 'clear'}`}>
                          {dueCount ? `${dueCount} due today` : 'Caught up'}
                        </span>
                        <Glyph name="arrow" className="deck-selection-arrow h-4 w-4" />
                      </motion.button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            {deckPageCount > 1 && (
              <nav className="deck-pagination" aria-label="Deck pages">
                <button
                  type="button"
                  onClick={() => changeDeckPage(safeDeckPage - 1)}
                  disabled={safeDeckPage === 1}
                  aria-label="Previous deck page"
                >
                  <Glyph name="chevron" className="h-4 w-4 rotate-90" />
                  <span>Previous</span>
                </button>
                <span className="deck-page-status"><strong>{safeDeckPage}</strong><span>of {deckPageCount}</span></span>
                <button
                  type="button"
                  onClick={() => changeDeckPage(safeDeckPage + 1)}
                  disabled={safeDeckPage === deckPageCount}
                  aria-label="Next deck page"
                >
                  <span>Next</span>
                  <Glyph name="chevron" className="h-4 w-4 -rotate-90" />
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="cards-library-empty">
            <span className="cards-empty-stack" aria-hidden="true"><i /><i /><i /></span>
            <h2>No decks yet</h2>
            <p>Create a deck with BetterCLSS AI, then it will appear here ready to review.</p>
            <button type="button" onClick={onCreateDeck}>Create your first deck</button>
          </div>
        )}
        <span className="sr-only" aria-live="polite">{announcement}</span>
      </motion.section>
    );
  }

  if (!selectedDeck.cards.length) {
    return (
      <section
        className="cards-workspace cards-review-shell"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
      >
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <div className="cards-library-empty deck-is-empty">
          <span className="cards-empty-stack" aria-hidden="true"><i /><i /><i /></span>
          <h2>{selectedDeck.title} is empty</h2>
          <p>Add a few question-and-answer cards before starting a review.</p>
          <button type="button" onClick={onCreateDeck}>Create cards</button>
        </div>
      </section>
    );
  }

  if (reviewComplete) {
    const reviewAgainIds = Object.entries(results)
      .filter(([, rating]) => rating === 'again')
      .map(([cardId]) => cardId);
    const gotItCount = Object.values(results).filter((rating) => rating === 'got-it').length;
    return (
      <motion.section
        className="cards-workspace cards-review-shell"
        id="study-panel-cards"
        role="region"
        aria-label="Cards"
        tabIndex="0"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <div className="cards-session-complete" role="status">
          <span className="cards-complete-mark" aria-hidden="true"><Glyph name="spark" className="h-7 w-7" /></span>
          <span className="eyebrow-mobile">Session complete</span>
          <h2>Deck cleared.</h2>
          <p>You worked through all {reviewCards.length} cards in {selectedDeck.title}.</p>
          <div className="cards-session-summary">
            <span><strong>{gotItCount}</strong><small>Got it</small></span>
            <span><strong>{reviewAgainIds.length}</strong><small>Review again</small></span>
          </div>
          {reviewAgainIds.length > 0 && (
            <button type="button" className="cards-review-missed" onClick={() => startDeck(selectedDeck, reviewAgainIds)}>
              Review missed again
            </button>
          )}
          <button type="button" className="cards-finish-button" onClick={leaveDeck}>Back to decks</button>
        </div>
      </motion.section>
    );
  }

  const remaining = reviewCards.length - reviewIndex - 1;
  const cardBack = activeCard.answer || [
    activeCard.due ? `Due ${activeCard.due}` : 'No due date',
    activeCard.priority ? `${activeCard.priority} priority` : 'Course review item',
    activeCard.done ? 'Already completed' : 'Still open'
  ].join(' · ');

  return (
    <section
      className="cards-workspace cards-review-shell"
      id="study-panel-cards"
      role="region"
      aria-label="Cards"
      tabIndex="0"
    >
      <header className="cards-review-heading">
        <button type="button" className="cards-back-button" onClick={leaveDeck}>
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All decks
        </button>
        <span aria-live="polite"><strong>{reviewIndex + 1}</strong> of {reviewCards.length}</span>
      </header>

      <div className="cards-stack-stage">
        {remaining > 1 && <span className="cards-stack-layer far" aria-hidden="true" />}
        {remaining > 0 && <span className="cards-stack-layer near" aria-hidden="true" />}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.article
            className="cards-review-card"
            key={activeCard.id}
            drag={reduceMotion ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.72}
            dragMomentum={false}
            onDragStart={() => {
              draggingRef.current = true;
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 82 || info.velocity.x > 520) markCard('got-it');
              else if (info.offset.x < -82 || info.velocity.x < -520) markCard('again');
              window.setTimeout(() => {
                draggingRef.current = false;
              }, 0);
            }}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.965 }}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : {
              opacity: 0,
              x: reviewDirection * 430,
              y: -8,
              rotate: reviewDirection * 11,
              scale: 0.96
            }}
            transition={reduceMotion ? { duration: 0 } : SPRING}
          >
            <button
              type="button"
              className="cards-flip-surface"
              onClick={toggleCard}
              aria-label={`${cardFlipped ? 'Back' : 'Front'} of card ${reviewIndex + 1}: ${cardFlipped ? cardBack : activeCard.title}. Flip card.`}
            >
              <motion.span
                className="cards-flip-inner"
                animate={{ rotateY: cardFlipped ? 180 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
              >
                <span className="cards-face cards-face-front">
                  <small>Front</small>
                  <strong>{activeCard.title}</strong>
                  <em>Tap to reveal</em>
                </span>
                <span className="cards-face cards-face-back">
                  <small>Back</small>
                  <strong>{cardBack}</strong>
                  <em>Tap to return</em>
                </span>
              </motion.span>
            </button>
          </motion.article>
        </AnimatePresence>
      </div>

      <div className="cards-review-actions" role="group" aria-label="Card review actions">
        <button type="button" className="again" onClick={() => markCard('again')}>
          <Glyph name="reset" className="h-4 w-4" />
          <span>Review again<small>Swipe left</small></span>
        </button>
        <button type="button" className="flip" onClick={toggleCard}>
          <Glyph name="sync" className="h-4 w-4" />
          <span>Flip<small>Show {cardFlipped ? 'front' : 'back'}</small></span>
        </button>
        <button type="button" className="got-it" onClick={() => markCard('got-it')}>
          <Glyph name="spark" className="h-4 w-4" />
          <span>Got it<small>Swipe right</small></span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </section>
  );
}

