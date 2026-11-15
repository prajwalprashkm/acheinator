import type { Answer } from "./types";

export type SymptomInterviewStatus = "yes" | "no" | "unknown" | "not_asked";

export interface DiseaseSymptomRow {
  index: number;
  label: string;
  /** P(symptom | disease) from training statistics. */
  pGivenDisease: number;
  status: SymptomInterviewStatus;
}

export function buildDiseaseSymptomRows(
  psd: Float64Array,
  nSymptoms: number,
  symptomLabels: string[],
  diseaseIndex: number,
  yes: Uint8Array,
  no: Uint8Array,
  asked: Uint8Array,
  opts?: { minP?: number; max?: number },
): DiseaseSymptomRow[] {
  const minP = opts?.minP ?? 0.15;
  const max = opts?.max ?? 32;
  const rows: DiseaseSymptomRow[] = [];
  const base = diseaseIndex * nSymptoms;
  for (let s = 0; s < nSymptoms; s++) {
    const p = psd[base + s];
    if (p < minP) continue;
    let status: SymptomInterviewStatus = "not_asked";
    if (yes[s]) status = "yes";
    else if (no[s]) status = "no";
    else if (asked[s]) status = "unknown";
    rows.push({ index: s, label: symptomLabels[s], pGivenDisease: p, status });
  }
  rows.sort((a, b) => b.pGivenDisease - a.pGivenDisease);
  return rows.slice(0, max);
}

export function statusLabel(status: SymptomInterviewStatus, answer?: Answer): string {
  if (status === "yes") return "You said yes";
  if (status === "no") return "You said no";
  if (status === "unknown") return "Don't know";
  return "Not asked";
}