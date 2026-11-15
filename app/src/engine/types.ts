/** Shapes of the files written by training/export_web_assets.py. */

export type Sex = "female" | "male";
export type Age = "baby" | "child" | "teen" | "adult";

export interface AreaMeta {
  id: string;
  question: string;
  childQuestion: string;
  members: number[];
}

export interface ProfileRules {
  symptoms: number[];
  diseases: number[];
  skipAreas: string[];
}

export interface DiseaseInfo {
  description: string | null;
  precautions: string[];
}

export interface Meta {
  nSymptoms: number;
  nDiseases: number;
  symptoms: string[];
  symptomLabels: string[];
  diseases: string[];
  diseaseLabels: string[];
  areas: AreaMeta[];
  ages: Record<Age, string>;
  sexes: Record<Sex, string>;
  childAges: Age[];
  /** key: `${sex ?? ""}|${age ?? ""}` */
  profiles: Record<string, ProfileRules>;
  /** key: disease index as a string; only diseases that have info */
  info: Record<string, DiseaseInfo>;
  trainedWithoutYes: boolean;
  defaults: StoppingRules;
  consistency: ConsistencyRules;
  network: { input: string; output: string };
}

/** See training/consistency.py. */
export interface ConsistencyRules {
  dontKnowStreak: number;
  noYesAfter: number;
  allYesAfter: number;
  alternatingAfter: number;
  mismatchAfter: number;
  mismatchOffset: number;
  mismatchSlope: number;
}

export type Suspicion = "dont-know" | "all-no" | "mismatch" | "all-yes" | "alternating";

export interface StoppingRules {
  threshold: number;
  maxQuestions: number;
  minGain: number;
  stableQuestions: number;
}

export interface EngineData {
  meta: Meta;
  /** P(symptom | disease), row-major nDiseases x nSymptoms */
  pSymGivenDis: Float32Array;
  pDis: Float32Array;
}

/** Runs the network on `batch` answer states (each 2 * nSymptoms long) and returns the logits. */
export type NetworkFn = (input: Float32Array, batch: number) => Promise<Float32Array>;

export type Question = { kind: "symptom" | "area"; index: number };
export type Answer = boolean | null;

export type Step =
  | { action: "ask"; question: Question; gain: number }
  | { action: "stop"; reason: string };

export interface Guess {
  index: number;
  name: string;
  label: string;
  p: number;
}
