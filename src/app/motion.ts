// Shared animation primitives — the single source of truth for motion.
//
// `motion/react` is already used across the app, but each component used to
// declare its own timings, so transitions felt inconsistent from screen to
// screen. Centralising the common cases here keeps motion coherent and makes it
// tunable in one place.
//
// Everything below is plain data (variants / transitions) with no side effects,
// so it is framework agnostic and safe to unit test.

import type { Transition, Variants } from 'motion/react';

/** Brand easing: a calm, quick ease-out used across the UI (cubic bezier). */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Symmetric easing for loops that have to return exactly where they started. */
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

/** Short, snappy spring for direct feedback (nav indicator, taps). */
export const SPRING_SNAPPY: Transition = { type: 'spring', bounce: 0.2, duration: 0.4 };

/** Softer spring for larger surfaces (sheets, cards). */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 260, damping: 30 };

/** Shared durations in seconds. */
export const DURATION = { fast: 0.18, base: 0.28, slow: 0.42 } as const;

// ── Page / tab transitions ────────────────────────────────────────────────
// A plain fade between screens — no drift, so the content never slides. The
// nav bar carries the expressive motion (see BottomNav), which keeps the page
// itself calm. Rendered under `<AnimatePresence mode="wait">`, so the outgoing
// screen fades out before the next one fades in; both use the same short
// duration so the hand-off feels like one continuous fade.
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

// ── Directional slides (onboarding steps, pushed flows) ───────────────────
// `direction` of 1 slides in from the right (forward), -1 from the left (back).
export function slideVariants(direction: 1 | -1 = 1): Variants {
  return {
    initial: { opacity: 0, x: 28 * direction },
    animate: { opacity: 1, x: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
    exit: { opacity: 0, x: -28 * direction, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  };
}

// ── Fade + rise (cards, modals, empty states) ─────────────────────────────
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

// ── Lists / grids ─────────────────────────────────────────────────────────
// Wrap a list in `listContainer` and give each child `listItem` for a quick
// staggered entrance (kept short so long lists never feel slow).
export const listContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const listItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

// ── Micro-interactions ────────────────────────────────────────────────────
// Spread onto a motion element: `<motion.button {...tapFeedback} onClick={…}>`.
export const tapFeedback = {
  whileTap: { scale: 0.97 },
  transition: SPRING_SNAPPY,
} as const;

// ── Per-route page transitions ────────────────────────────────────────────
// Home, History and Profile keep the calm cross-fade above. Vitals and Map get
// an entrance of their own so the two "instrument" tabs read as different
// places: Vitals rises into view (a soft inhale), Map settles like a camera
// zooming in on you.
//
// Both are transform-only and end on their default values, so motion resets the
// route wrapper to `transform: none` at rest. That matters for Map: Leaflet
// measures its container from the untransformed layout.
export const vitalsVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
  exit: { opacity: 0, scale: 1.008, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

export const mapVariants: Variants = {
  initial: { opacity: 0, scale: 1.05 },
  animate: { opacity: 1, scale: 1, transition: SPRING_SOFT },
  exit: { opacity: 0, scale: 0.985, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

const ROUTE_VARIANTS: Record<string, Variants> = { vitals: vitalsVariants, map: mapVariants };

/** The page transition for `route`; anything unlisted uses the calm fade. */
export function pageVariantsFor(route: string): Variants {
  return ROUTE_VARIANTS[route] ?? pageVariants;
}

// ── Looping signals (a live reading, locating you) ────────────────────────
// Transform and opacity only, so they stay on the compositor. Always gate these
// on real data *and* on `useReducedMotion()` before rendering them.
//
// A pulse is two beats, the second landing closer to the first than an even
// spread would put it.
const HEARTBEAT_TRANSITION: Transition = { duration: 1.15, repeat: Infinity, repeatDelay: 0.35, ease: EASE_OUT };
export const HEARTBEAT = { scale: [1, 1.16, 1, 1.12, 1], transition: HEARTBEAT_TRANSITION };

// Inhale 2.5s, exhale 2.5s — roughly twelve breaths a minute.
const BREATHE_TRANSITION: Transition = { duration: 5, repeat: Infinity, ease: EASE_IN_OUT };
export const BREATHE = { scale: [1, 1.06, 1], transition: BREATHE_TRANSITION };

// A gentle "tap me" pulse for an idle affordance, e.g. a vital with no reading.
const INVITE_TRANSITION: Transition = { duration: 2.4, repeat: Infinity, ease: EASE_IN_OUT };
export const INVITE = { scale: [1, 1.08, 1], transition: INVITE_TRANSITION };

// An expanding sonar ring for "locating you". Stagger copies with `delay`.
export const SONAR = { scale: [0.55, 1.9], opacity: [0.45, 0] };
export const SONAR_TRANSITION: Transition = { duration: 2.4, repeat: Infinity, ease: EASE_OUT };

// ── Panels / sheets ───────────────────────────────────────────────────────
/** A sheet or drawer that springs up from the bottom edge. */
export const sheetVariants: Variants = {
  initial: { y: '100%', opacity: 0.5 },
  animate: { y: 0, opacity: 1, transition: SPRING_SOFT },
  exit: { y: '100%', opacity: 0.5, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

