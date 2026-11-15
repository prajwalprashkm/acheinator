import { describe, expect, it } from "vitest";
import { modelCacheKey } from "../src/engine/modelCache";
import type { Meta } from "../src/engine/types";

const meta = {
  nSymptoms: 10,
  nDiseases: 20,
  trainedWithoutYes: true,
  network: { input: "answers", output: "logits" },
} as Pick<Meta, "nSymptoms" | "nDiseases" | "trainedWithoutYes" | "network">;

describe("modelCacheKey", () => {
  it("changes when dimensions change", () => {
    const a = modelCacheKey(meta as Meta);
    const b = modelCacheKey({ ...meta, nSymptoms: 11 } as Meta);
    expect(a).not.toBe(b);
  });

  it("is stable for the same meta", () => {
    expect(modelCacheKey(meta as Meta)).toBe(modelCacheKey(meta as Meta));
  });
});