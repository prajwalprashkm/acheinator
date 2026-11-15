/** Catches mistakes when editing src/character/config.ts. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  answerReactionWeights,
  pickAnswerReaction,
  type AnswerReactionContext,
} from "../src/character/answerReactions";
import { characterClipExtension } from "../src/character/clipFormat";
import { CLIPS, IDLE_LOOP, LOADING_LOOP, REACTIONS, pickClip, type Moment } from "../src/character/config";
import type { HistoryEntry } from "../src/engine/akinator";

const DIR = join(__dirname, "..", "public", "character");

describe("characterClipExtension", () => {
  it("uses mov on iPhone Chrome (WebKit, non-Apple vendor)", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
      vendor: "Google Inc.",
      platform: "iPhone",
      maxTouchPoints: 5,
    };
    vi.stubGlobal("navigator", nav);
    expect(characterClipExtension()).toBe("mov");
    vi.unstubAllGlobals();
  });

  it("uses webm on desktop Chrome", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      vendor: "Google Inc.",
      platform: "MacIntel",
      maxTouchPoints: 0,
    };
    vi.stubGlobal("navigator", nav);
    expect(characterClipExtension()).toBe("webm");
    vi.unstubAllGlobals();
  });
});

describe("character config", () => {
  it.each(Object.entries(REACTIONS))("%s: chances add up to at most 1", (_, r) => {
    const total = Object.values(r.chances).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1 + 1e-9);
    for (const p of Object.values(r.chances)) expect(p).toBeGreaterThanOrEqual(0);
  });

  it.each(CLIPS)("%s has a .webm and a .mov in public/character", (clip) => {
    expect(existsSync(join(DIR, `${clip}.webm`))).toBe(true);
    expect(existsSync(join(DIR, `${clip}.mov`))).toBe(true);
  });

  it("has the idle image, idle loop, and loading clip", () => {
    expect(existsSync(join(DIR, "idle.png"))).toBe(true);
    expect(CLIPS).toContain(IDLE_LOOP);
    if (LOADING_LOOP) expect(CLIPS).toContain(LOADING_LOOP);
    expect(pickClip("result", 0)).toBe("idea");
  });

  it("picks non-answer moments in proportion to their chances", () => {
    const moment: Moment = "confidentResult";
    const counts = new Map<string | null, number>();
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const c = pickClip(moment, (i + 0.5) / n);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const [clip, p] of Object.entries(REACTIONS[moment].chances)) {
      expect(Math.abs((counts.get(clip) ?? 0) / n - p)).toBeLessThan(1e-3);
    }
  });
});

function hist(answers: (boolean | null)[]): HistoryEntry[] {
  return answers.map((answer, i) => ({
    answer,
    text: `q${i}`,
    question: { kind: "symptom", index: i },
  }));
}

describe("answer reactions", () => {
  const guesses = [
    { index: 0, name: "a", label: "A", p: 0.4 },
    { index: 1, name: "b", label: "B", p: 0.35 },
  ];

  it("boosts confused after many recent nos", () => {
    const history = hist([false, false, false, false, false]);
    const w = answerReactionWeights({ lastAnswer: false, history, guesses, prevTopP: 0.3 });
    expect(w.confused).toBeGreaterThan(0.2);
  });

  it("boosts idea on yes after a no streak", () => {
    const history = hist([false, false, false, true]);
    const w = answerReactionWeights({ lastAnswer: true, history, guesses, prevTopP: 0.2 });
    expect(w.idea).toBeGreaterThan(0.25);
  });

  it("returns null when random is above cap", () => {
    const ctx: AnswerReactionContext = {
      lastAnswer: true,
      history: hist([true]),
      guesses,
      prevTopP: null,
    };
    expect(pickAnswerReaction(ctx, 0.99)).toBeNull();
  });

  it("picks idea when weights favor it and random is low", () => {
    const history = hist([false, false, false, true]);
    const ctx: AnswerReactionContext = {
      lastAnswer: true,
      history,
      guesses: [{ ...guesses[0], p: 0.55 }, guesses[1]],
      prevTopP: 0.4,
    };
    expect(pickAnswerReaction(ctx, 0.2)).toBe("idea");
  });
});
