/**
 * Centralized motion tokens.
 *
 * Durations / easings / staggers used across components live here so the
 * page reads as one orchestrated piece, not a scatter of hand-tuned
 * numbers. Tweak in one place; the whole UI re-tunes.
 */

import type { Easing, Transition } from 'motion/react';

/** All durations in seconds. */
export const DUR = {
  micro: 0.16,        // hover/tap micro-affordances
  short: 0.28,        // most state changes
  medium: 0.45,       // entrances
  long: 0.72,         // hero clip-path reveals
  breath: 4.0,        // wordmark breathing
} as const;

/** Cubic-bezier easings — picked to read as "deliberate, editorial",
 *  not "spring-y bouncy" (that would clash with Bauhaus). */
export const EASE = {
  /** Generic ease-out for entrances. */
  out:    [0.22, 0.61, 0.36, 1] as Easing,
  /** Slow-in slow-out for the hero wordmark breath. */
  inOut:  [0.42, 0, 0.58, 1] as Easing,
  /** Decelerated emphasis — for color sweeps. */
  emph:   [0.16, 1, 0.3, 1] as Easing,
} as const;

/** Stagger between siblings in a cascade (seconds). */
export const STAGGER = {
  /** Resources panel link list. */
  links: 0.04,
  /** Plate entrances when the verticali grid scrolls into view. */
  plates: 0.08,
  /** Footer primitive ribbon breathing offset. */
  ribbon: 0.32,
} as const;

/** Reusable spring presets for layout-y interactions. */
export const SPRING = {
  /** Tight, editorial — buttons, sigils, chips. */
  tight: { type: 'spring', stiffness: 320, damping: 22 } as Transition,
  /** Slightly softer for plates entering. */
  softer: { type: 'spring', stiffness: 240, damping: 26 } as Transition,
} as const;
