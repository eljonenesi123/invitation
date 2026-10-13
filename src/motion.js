/*
 * Shared motion language for the whole sequence (envelope → card → RSVP →
 * signature). Every transition picks a role-based easing and a duration tier
 * from here, so the pieces move as one system.
 *
 * Easing roles:
 *   enter — things arriving or settling into place: fast, then a long, soft
 *           deceleration. The one curve for every "enter".
 *   exit  — things leaving: gather speed and go (the mirror of enter).
 *   move  — in-place transformations that start and end at rest (flap fold,
 *           card flip): symmetric ease-in-out.
 * A move that hands off between phases (card leaving the pocket, then coming
 * forward) uses exit → enter, so its speed is continuous across the seam.
 *
 * Duration tiers, by the weight of the movement:
 *   short  — small acknowledgements: hovers, inline swaps, fades, the seal
 *   medium — content changes within the card, landing reveal
 *   long   — the big physical moves: flap opening, card presentation, flip
 */
export const EASE = {
  enter: [0.22, 1, 0.36, 1],
  exit: [0.64, 0, 0.78, 0],
  move: [0.65, 0, 0.35, 1],
};

export const DURATION = { short: 0.3, medium: 0.5, long: 0.8 };

// Gap between items revealed in sequence
export const STAGGER = 0.12;

// Reduced motion: nothing runs longer than this (seconds)
export const REDUCED_MAX = 0.2;

const bezier = ([a, b, c, d]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;

// The same values for CSS transitions (set on the scene root)
export const MOTION_CSS_VARS = {
  '--ease-enter': bezier(EASE.enter),
  '--ease-exit': bezier(EASE.exit),
  '--ease-move': bezier(EASE.move),
  '--dur-short': `${DURATION.short * 1000}ms`,
  '--dur-medium': `${DURATION.medium * 1000}ms`,
  '--dur-long': `${DURATION.long * 1000}ms`,
};
