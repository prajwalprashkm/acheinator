/**
 * Replays games recorded from the Python engine (training/make_parity_cases.py)
 * and checks the TypeScript engine asks the same questions and reaches the same guesses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { Akinator } from "../src/engine/akinator";
import { parseStats } from "../src/engine/loadAssets";
import type { Age, Meta, Question, Sex } from "../src/engine/types";

type Top = [number, number][];
type PyStep =
  | { ask: ["symptom" | "area", number]; text: string; answer: boolean | null; top: Top; fit: number; suspicion: string | null }
  | { undo: true; top: Top }
  | { stop: string; top: Top; suspicion: string | null }
  | { refine: true };
interface Case {
  disease: number;
  troll: string | null;
  profile: [Sex | null, Age | null] | null;
  steps: PyStep[];
}

const ROOT = join(__dirname, "..");
const TOLERANCE = 1e-3;

let ak: Akinator;
const cases: Case[] = JSON.parse(readFileSync(join(ROOT, "test/fixtures/parity.json"), "utf8")).cases;

beforeAll(async () => {
  const meta: Meta = JSON.parse(readFileSync(join(ROOT, "public/model/meta.json"), "utf8"));
  const stats = new Uint8Array(readFileSync(join(ROOT, "public/model/stats.bin")));
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(readFileSync(join(ROOT, "public/model/model.onnx")));
  const net = async (input: Float32Array, batch: number) => {
    const out = await session.run({ [meta.network.input]: new ort.Tensor("float32", input, [batch, input.length / batch]) });
    return out[meta.network.output].data as Float32Array;
  };
  ak = new Akinator({ meta, ...parseStats(meta, stats) }, net);
});

async function checkTop(expected: Top, where: string) {
  const P = await ak.probs();
  for (const [i, p] of expected) {
    expect(Math.abs(P[i] - p), `${where}: P(${ak.meta.diseases[i]}) ts=${P[i]} py=${p}`).toBeLessThan(TOLERANCE);
  }
}

async function replay(c: Case) {
  ak.reset();
  if (c.profile) ak.setProfile(c.profile[0], c.profile[1]);
  for (const [n, step] of c.steps.entries()) {
    const where = `step ${n}`;
    if ("refine" in step) {
      ak.keepAsking(10);
    } else if ("undo" in step) {
      ak.undo();
      await checkTop(step.top, where);
    } else if ("stop" in step) {
      const s = await ak.nextStep();
      expect(s.action, `${where}: expected stop (${step.stop})`).toBe("stop");
      if (s.action === "stop") expect(s.reason.split(" (")[0]).toBe(step.stop.split(" (")[0]);
      await checkTop(step.top, where);
      expect(ak.suspicion(true), `${where}: suspicion at result`).toBe(step.suspicion);
    } else {
      const s = await ak.nextStep();
      const want: Question = { kind: step.ask[0], index: step.ask[1] };
      expect(s.action, `${where}: expected to ask "${step.text}"`).toBe("ask");
      if (s.action !== "ask") return;
      expect(s.question, `${where}: expected "${step.text}", got "${ak.questionText(s.question)}"`).toEqual(want);
      expect(ak.questionText(want)).toBe(step.text);
      await ak.answer(want, step.answer);
      await checkTop(step.top, where);
      expect(Math.abs(ak.fit() - step.fit), `${where}: fit ts=${ak.fit()} py=${step.fit}`).toBeLessThan(TOLERANCE);
      expect(ak.suspicion(), `${where}: suspicion`).toBe(step.suspicion);
    }
  }
}

describe("TypeScript engine matches the Python engine", () => {
  it.each(cases.map((c, i) => [i, c.troll ?? "honest", c] as const))("game %i (%s)", async (_, __, c) => {
    await replay(c);
  });
});
