import { describe, expect, it } from "vitest";
import { buildDiseaseSymptomRows } from "../src/engine/diseaseSymptoms";

describe("buildDiseaseSymptomRows", () => {
  it("lists high-P symptoms with interview status", () => {
    const n = 4;
    const psd = new Float64Array([0.9, 0.1, 0.8, 0.05, 0.2, 0.7, 0.1, 0.1, 0.1, 0.85, 0.05, 0.05, 0.1, 0.1, 0.1, 0.1]);
    const yes = new Uint8Array([1, 0, 0, 0]);
    const no = new Uint8Array([0, 1, 0, 0]);
    const asked = new Uint8Array([1, 1, 0, 0]);
    const labels = ["a", "b", "c", "d"];
    const rows = buildDiseaseSymptomRows(psd, n, labels, 0, yes, no, asked, { minP: 0.5, max: 10 });
    expect(rows.map((r) => r.label)).toEqual(["a", "c"]);
    expect(rows[0].status).toBe("yes");
    expect(rows[1].status).toBe("not_asked");
  });
});