import type { HistoryEntry } from "@/engine/akinator";
import type { Answer, Guess } from "@/engine/types";
import { GESTURE_CLIPS, type GestureClipId } from "./config";

/** Inputs after each new history entry (Game.tsx). */
export interface AnswerReactionContext {
  lastAnswer: Answer;
  history: HistoryEntry[];
  guesses: Guess[];
  /** Top guess probability before this answer; null on first question. */
  prevTopP: number | null;
}

/** Max chance any single answer triggers a gesture (rest = idle only). */
export const ANSWER_REACTION_CAP = 0.45;

const BASE: Partial<Record<GestureClipId, number>> = {
  "thinking-chin": 0.1,
  idea: 0.05,
  confused: 0.04,
  "thumbs-up": 0.03,
  backflip: 0.005,
};

function consecutiveNoBeforeLast(history: HistoryEntry[]): number {
  if (history.length < 2) return 0;
  let count = 0;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].answer === false) count++;
    else break;
  }
  return count;
}

function noHeavyInRecent(history: HistoryEntry[], window = 5, minNo = 4): boolean {
  const slice = history.slice(-window);
  if (slice.length < window) return false;
  return slice.filter((h) => h.answer === false).length >= minNo;
}

/** Biased weights for one answer — tune here. */
export function answerReactionWeights(ctx: AnswerReactionContext): Partial<Record<GestureClipId, number>> {
  const w: Partial<Record<GestureClipId, number>> = { ...BASE };

  if (ctx.lastAnswer === false) {
    if (noHeavyInRecent(ctx.history)) w.confused = (w.confused ?? 0) + 0.2;
    else w.confused = (w.confused ?? 0) + 0.05;
  }

  if (ctx.lastAnswer === true) {
    const priorNo = consecutiveNoBeforeLast(ctx.history);
    if (priorNo >= 3) w.idea = (w.idea ?? 0) + 0.24;
    else if (priorNo >= 1) w.idea = (w.idea ?? 0) + 0.1;
  }

  if (ctx.lastAnswer === true || ctx.lastAnswer === false) {
    w["thinking-chin"] = (w["thinking-chin"] ?? 0) + 0.07;
  }

  const topP = ctx.guesses[0]?.p ?? 0;
  const secondP = ctx.guesses[1]?.p ?? 0;
  if (ctx.prevTopP != null) {
    const delta = topP - ctx.prevTopP;
    if (delta >= 0.12) {
      w.idea = (w.idea ?? 0) + 0.14;
      w["thumbs-up"] = (w["thumbs-up"] ?? 0) + 0.08;
    } else if (delta >= 0.05) {
      w["thinking-chin"] = (w["thinking-chin"] ?? 0) + 0.09;
    }
  }

  const spread = topP - secondP;
  if (ctx.history.length >= 5 && spread < 0.08) {
    w.confused = (w.confused ?? 0) + 0.07;
  }

  if (ctx.history.length >= 8 && topP < 0.25) {
    w.confused = (w.confused ?? 0) + 0.06;
    w["thinking-chin"] = (w["thinking-chin"] ?? 0) + 0.05;
  }

  return w;
}

export function pickAnswerReaction(ctx: AnswerReactionContext, random = Math.random()): GestureClipId | null {
  const weights = answerReactionWeights(ctx);
  const entries = GESTURE_CLIPS.map((c) => [c, weights[c] ?? 0] as const).filter(([, wt]) => wt > 0);
  const sum = entries.reduce((a, [, wt]) => a + wt, 0);
  if (sum <= 0 || random >= ANSWER_REACTION_CAP) return null;

  const r = (random / ANSWER_REACTION_CAP) * sum;
  let acc = 0;
  for (const [clip, wt] of entries) {
    acc += wt;
    if (r < acc) return clip;
  }
  return entries[entries.length - 1]?.[0] ?? null;
}