/** Catches mistakes when editing src/character/config.ts. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIPS, IDLE_LOOP, LOADING_LOOP, REACTIONS, pickClip, type Moment } from "../src/character/config";

const DIR = join(__dirname, "..", "public", "character");

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
    expect(pickClip("answer", 0)).not.toBe(IDLE_LOOP);
  });

  it("picks clips in proportion to their chances", () => {
    const moment: Moment = "answer";
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
