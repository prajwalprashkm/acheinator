/**
 * Which animation the character plays, and when — edit this file; nothing auto-detects clip names.
 *
 * Workflow:
 *   1. Put or update clips in animations/symptomator/clips/<id>.webm (+ idle PNG in reference/).
 *   2. From app/: npm run animations  → copies into public/character/ (.webm + .mov for WebKit).
 *   3. List every <id>.webm here in CLIPS / GESTURE_CLIPS (and wire REACTIONS if it's a gesture).
 *
 * The app never reads animations/ at runtime; only public/character/ is deployed (see next build).
 */

/** Looping rest animation (6 s, up–down float). Not used for answer reactions. */
export const IDLE_LOOP = "idle-float" as const;

/** One-shot reactions. */
export const GESTURE_CLIPS = ["thinking-chin", "idea", "confused", "thumbs-up", "backflip"] as const;

export const CLIPS = [IDLE_LOOP, ...GESTURE_CLIPS] as const;
export type ClipId = (typeof CLIPS)[number];
export type GestureClipId = (typeof GESTURE_CLIPS)[number];

/** Moments in the game that can start a clip (see Game.tsx). */
export type Moment = "answer" | "suspicious" | "result" | "confidentResult";

export interface Reaction {
  /** Chance of each clip, from 0 to 1. Whatever is left over is the chance of doing nothing. */
  chances: Partial<Record<GestureClipId, number>>;
}

/** Answer moments use pickAnswerReaction in answerReactions.ts (biased by history + guesses). */
export const REACTIONS: Record<Moment, Reaction> = {
  answer: { chances: {} },
  suspicious: { chances: { confused: 1 } },
  result: { chances: { idea: 1 } },
  confidentResult: { chances: { "thumbs-up": 1 } },
};

export const CONFIDENT = 0.7;

/** Clip while assets load; null = use idle-float from the first frame (loads are usually quick). */
export const LOADING_LOOP: GestureClipId | null = null;

export const PLAYBACK_RATE = 1;

/** Length of idle-float.webm (seconds). */
export const IDLE_DURATION_SEC = 6;

/** One-shot clip length (seconds); documentation / tooling. Video uses onEnded. Match each .webm/.mov. */
export const GESTURE_CLIP_DURATION_SEC = 6.05;

export const GESTURE_DURATION_SEC: Record<GestureClipId, number> = Object.fromEntries(
  GESTURE_CLIPS.map((c) => [c, GESTURE_CLIP_DURATION_SEC]),
) as Record<GestureClipId, number>;

/** Seconds in the idle loop that match idle.png — safe to cut to a gesture. */
export const IDLE_REST_TIMES = [0, 3] as const;
export const IDLE_REST_TOLERANCE_SEC = 0.22;

/** After a gesture, chance we hold idle.png before starting idle-float again. */
export const IDLE_STILL_AFTER_GESTURE = 0.45;

/** If we're holding the still after a gesture, start idle-float automatically after this long anyway. */
export const IDLE_STILL_MAX_MS = 12_000;

/** How much the 480×480 art is scaled inside its slot (lower = less head/tail clipped). */
export const MASCOT_ART_SCALE = 1.0;

/** Padding inside the mascot square before overflow clips (percent of slot width). */
export const MASCOT_CLIP_INSET_PERCENT = 0;

export function pickClip(moment: Moment, random = Math.random()): GestureClipId | null {
  let r = random;
  for (const [clip, p] of Object.entries(REACTIONS[moment].chances) as [GestureClipId, number][]) {
    if (r < p) return clip;
    r -= p;
  }
  return null;
}