/**
 * Which animation the character plays, and when. Edit this file to change them.
 *
 * Clips live in public/character/ as <id>.webm (with alpha) plus <id>.mov (HEVC with alpha,
 * for Safari / iPhone). To replace them, put new files in ../animations/symptomator/clips/
 * and run `npm run animations`, then list the ids below.
 */

export const CLIPS = ["thinking-chin", "idea", "confused", "thumbs-up", "backflip"] as const;
export type ClipId = (typeof CLIPS)[number];

/** Moments in the game that can start a clip (see Game.tsx). */
export type Moment = "answer" | "suspicious" | "result" | "confidentResult";

export interface Reaction {
  /** Chance of each clip, from 0 to 1. Whatever is left over is the chance of doing nothing. */
  chances: Partial<Record<ClipId, number>>;
}

export const REACTIONS: Record<Moment, Reaction> = {
  // After every yes / no / don't know: about half the time, one of these.
  answer: {
    chances: {
      "thinking-chin": 0.15,
      idea: 0.08,
      "thumbs-up": 0.08,
      confused: 0.06,
      backflip: 0.01,
    },
  },
  // "Your answers don't add up" pause
  suspicious: { chances: { confused: 1 } },
  // A guess is shown...
  result: { chances: { idea: 1 } },
  // ...or a guess at least this confident (see CONFIDENT below)
  confidentResult: { chances: { "thumbs-up": 1 } },
};

/** Top guess probability that counts as a confident result. */
export const CONFIDENT = 0.7;

/** Looped while the model downloads. null for the still image. */
export const LOADING_LOOP: ClipId | null = "thinking-chin";

/** 1 is normal speed. The clips are about 6 s long, with the gesture in the middle 2 to 3 s. */
export const PLAYBACK_RATE = 1;

/** Cross-fade between the still image and a clip, in ms. */
export const FADE_MS = 150;

/** Picks a clip for a moment, or null for none. `random` is in [0, 1). */
export function pickClip(moment: Moment, random = Math.random()): ClipId | null {
  let r = random;
  for (const [clip, p] of Object.entries(REACTIONS[moment].chances) as [ClipId, number][]) {
    if (r < p) return clip;
    r -= p;
  }
  return null;
}
