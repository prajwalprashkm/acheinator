/**
 * TypeScript port of training/akinator_engine.py ("stats" question mode).
 * Kept line-for-line close to the Python so the parity test can compare them;
 * change both together.
 */
import { buildDiseaseSymptomRows, type DiseaseSymptomRow } from "./diseaseSymptoms";
import type { Age, Answer, EngineData, Guess, Meta, NetworkFn, Question, Sex, Step, StoppingRules, Suspicion } from "./types";

const RULED_OUT_LOG = -50;

function clip(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x;
}

function entropy(P: Float64Array) {
  let h = 0;
  for (let i = 0; i < P.length; i++) h -= P[i] * Math.log(Math.max(P[i], 1e-12));
  return h;
}

/** Column-wise terms of a likelihood matrix L (nDiseases x nQuestions), precomputed once. */
interface Likelihood {
  n: number;
  L: Float64Array;
  LlogL: Float64Array;
  MlogM: Float64Array; // (1 - L) * log(1 - L)
}

function likelihood(L: Float64Array, n: number): Likelihood {
  const LlogL = new Float64Array(L.length);
  const MlogM = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) {
    LlogL[i] = L[i] * Math.log(L[i]);
    MlogM[i] = (1 - L[i]) * Math.log(1 - L[i]);
  }
  return { n, L, LlogL, MlogM };
}

interface Snapshot {
  yes: Uint8Array;
  no: Uint8Array;
  asked: Uint8Array;
  areaAnswers: Map<number, Answer>;
}

export interface HistoryEntry {
  question: Question;
  answer: Answer;
  text: string;
}

export class Akinator {
  readonly meta: Meta;
  readonly S: number;
  readonly D: number;
  private net: NetworkFn;
  private psd: Float64Array;
  private logPrior: Float64Array;
  private pArea: Float64Array; // nDiseases x nAreas
  private symLik: Likelihood;
  private areaLik: Likelihood;
  private areaMembers: number[][];
  private defaults: StoppingRules;

  stopping!: StoppingRules;
  yes!: Uint8Array;
  no!: Uint8Array;
  asked!: Uint8Array;
  areaAnswers!: Map<number, Answer>;
  sex: Sex | null = null;
  age: Age | null = null;
  ruledOut!: Uint8Array;
  skippedAreas!: Set<number>;
  /** Answers given so far, in order (same length as the undo stack). */
  answers: HistoryEntry[] = [];
  private snapshots: Snapshot[] = [];
  private top3History: string[] = [];
  private cache: { version: number; P: Float64Array } | null = null;
  private version = 0;

  constructor(data: EngineData, net: NetworkFn, stopping?: Partial<StoppingRules>) {
    const { meta } = data;
    this.meta = meta;
    this.net = net;
    this.S = meta.nSymptoms;
    this.D = meta.nDiseases;
    const { S, D } = this;

    this.psd = new Float64Array(D * S);
    for (let i = 0; i < D * S; i++) this.psd[i] = clip(data.pSymGivenDis[i], 1e-4, 1 - 1e-4);
    this.logPrior = new Float64Array(D);
    for (let d = 0; d < D; d++) this.logPrior[d] = Math.log(Math.max(data.pDis[d], 1e-12));

    this.areaMembers = meta.areas.map((a) => a.members);
    const A = this.areaMembers.length;
    this.pArea = new Float64Array(D * A);
    for (let d = 0; d < D; d++) {
      for (let a = 0; a < A; a++) {
        let logNone = 0;
        for (const s of this.areaMembers[a]) logNone += Math.log(1 - this.psd[d * S + s]);
        this.pArea[d * A + a] = clip(1 - Math.exp(logNone), 1e-4, 1 - 1e-4);
      }
    }
    this.symLik = likelihood(this.psd, S);
    this.areaLik = likelihood(this.pArea, A);

    this.defaults = { ...meta.defaults, ...stopping };
    this.reset();
  }

  // ----- state -----

  /** Starts a new game, undoing any keepAsking() from the last one. */
  reset() {
    this.stopping = { ...this.defaults };
    this.yes = new Uint8Array(this.S);
    this.no = new Uint8Array(this.S);
    this.asked = new Uint8Array(this.S);
    this.areaAnswers = new Map();
    this.answers = [];
    this.snapshots = [];
    this.top3History = [];
    this.sex = this.age = null;
    this.ruledOut = new Uint8Array(this.D);
    this.skippedAreas = new Set();
    this.touch();
  }

  /** Call right after reset(). Symptoms that can't apply are never asked; diseases that can't apply are ruled out. */
  setProfile(sex: Sex | null, age: Age | null) {
    this.sex = sex;
    this.age = age;
    const rules = this.meta.profiles[`${sex ?? ""}|${age ?? ""}`];
    for (const s of rules.symptoms) this.asked[s] = 1;
    this.ruledOut = new Uint8Array(this.D);
    for (const d of rules.diseases) this.ruledOut[d] = 1;
    const skip = new Set(rules.skipAreas);
    this.skippedAreas = new Set(this.meta.areas.flatMap((a, i) => (skip.has(a.id) ? [i] : [])));
    this.touch();
  }

  private touch() {
    this.version++;
  }

  private snapshot(): Snapshot {
    return { yes: this.yes.slice(), no: this.no.slice(), asked: this.asked.slice(), areaAnswers: new Map(this.areaAnswers) };
  }

  async answer(question: Question, value: Answer) {
    this.snapshots.push(this.snapshot());
    this.answers.push({ question, answer: value, text: this.questionText(question) });
    const i = question.index;
    if (question.kind === "symptom") {
      this.asked[i] = 1;
      this.yes[i] = value === true ? 1 : 0;
      this.no[i] = value === false ? 1 : 0;
    } else {
      this.areaAnswers.set(i, value);
      if (value === false) {
        // "no problems with your eyes" means no to every eye symptom
        for (const s of this.areaMembers[i]) {
          if (!this.yes[s]) {
            this.no[s] = 1;
            this.asked[s] = 1;
          }
        }
      }
    }
    this.touch();
    const top = await this.top(3);
    this.top3History.push(top.map((g) => g.index).sort((a, b) => a - b).join(","));
  }

  /** After a result: ask up to `extra` more questions, ignoring the other stopping rules. */
  keepAsking(extra = 10) {
    this.stopping = { threshold: 1.01, maxQuestions: this.nAnswered + extra, minGain: 0, stableQuestions: 0 };
  }

  undo() {
    const snap = this.snapshots.pop();
    if (!snap) return false;
    this.yes = snap.yes;
    this.no = snap.no;
    this.asked = snap.asked;
    this.areaAnswers = snap.areaAnswers;
    this.answers.pop();
    this.top3History.pop();
    this.touch();
    return true;
  }

  /** Goes back to the state before answer number k (0-based), dropping it and every later answer. */
  restore(k: number) {
    while (this.nAnswered > k) this.undo();
  }

  get nAnswered() {
    return this.snapshots.length;
  }

  hasYes() {
    if (this.yes.some((v) => v === 1)) return true;
    for (const v of this.areaAnswers.values()) if (v === true) return true;
    return false;
  }

  // ----- predictions -----

  private async network(): Promise<Float64Array> {
    const { S, D } = this;
    const x = new Float32Array(2 * S);
    for (let s = 0; s < S; s++) {
      x[s] = this.yes[s];
      x[S + s] = this.no[s];
    }
    const logits = await this.net(x, 1);
    let max = -Infinity;
    for (let d = 0; d < D; d++) max = Math.max(max, logits[d]);
    const P = new Float64Array(D);
    let sum = 0;
    for (let d = 0; d < D; d++) sum += P[d] = Math.exp(logits[d] - max);
    for (let d = 0; d < D; d++) P[d] /= sum;

    if (!this.meta.trainedWithoutYes && !this.yes.some((v) => v === 1)) {
      // Older models never saw interviews without a "yes"; use naive Bayes for those.
      let m = -Infinity;
      for (let d = 0; d < D; d++) {
        let lp = this.logPrior[d];
        for (let s = 0; s < S; s++) if (this.no[s]) lp += Math.log(1 - this.psd[d * S + s]);
        P[d] = lp;
        m = Math.max(m, lp);
      }
      let z = 0;
      for (let d = 0; d < D; d++) z += P[d] = Math.exp(P[d] - m);
      for (let d = 0; d < D; d++) P[d] /= z;
    }
    return P;
  }

  /** Evidence the network input can't express: "yes" to area questions and diseases ruled out by age / sex. */
  private extraLogFactor() {
    const { D } = this;
    const A = this.areaMembers.length;
    const f = new Float64Array(D);
    for (let d = 0; d < D; d++) f[d] = this.ruledOut[d] ? RULED_OUT_LOG : 0;
    for (const [a, v] of this.areaAnswers) {
      if (v === true) for (let d = 0; d < D; d++) f[d] += Math.log(this.pArea[d * A + a]);
    }
    return f;
  }

  async probs(): Promise<Float64Array> {
    if (this.cache?.version === this.version) return this.cache.P;
    const version = this.version;
    const P = await this.network();
    const f = this.extraLogFactor();
    let max = -Infinity;
    for (let d = 0; d < this.D; d++) max = Math.max(max, f[d]);
    let sum = 0;
    for (let d = 0; d < this.D; d++) sum += P[d] *= Math.exp(f[d] - max);
    for (let d = 0; d < this.D; d++) P[d] /= sum;
    if (version === this.version) this.cache = { version, P };
    return P;
  }

  async top(k = 3): Promise<Guess[]> {
    const P = await this.probs();
    const order = Array.from(P.keys()).sort((a, b) => P[b] - P[a]).slice(0, k);
    return order.map((i) => ({ index: i, name: this.meta.diseases[i], label: this.meta.diseaseLabels[i], p: P[i] }));
  }

  /** Common symptoms for a disease vs what the player already answered (from stats + current flags). */
  diseaseSymptomBreakdown(diseaseIndex: number, opts?: { minP?: number; max?: number }): DiseaseSymptomRow[] {
    return buildDiseaseSymptomRows(
      this.psd,
      this.S,
      this.meta.symptomLabels,
      diseaseIndex,
      this.yes,
      this.no,
      this.asked,
      opts,
    );
  }

  // ----- choosing questions -----

  private allowed() {
    const symOk = Array.from(this.asked, (a) => !a);
    const areaOk = this.areaMembers.map(
      (m, i) =>
        !this.areaAnswers.has(i) &&
        !this.skippedAreas.has(i) &&
        m.some((s) => !this.asked[s]) &&
        !m.some((s) => this.yes[s]),
    );
    return { symOk, areaOk };
  }

  /** Expected entropy after asking each question, from P(yes | disease) columns. */
  private expectedEntropy(P: Float64Array, lik: Likelihood, ok: boolean[]) {
    const { n, L, LlogL, MlogM } = lik;
    const zYes = new Float64Array(n);
    const plogpL = new Float64Array(n);
    const plogpM = new Float64Array(n);
    const pLlogL = new Float64Array(n);
    const pMlogM = new Float64Array(n);
    for (let d = 0; d < this.D; d++) {
      const p = P[d];
      const plogp = p * Math.log(Math.max(p, 1e-12));
      const row = d * n;
      for (let q = 0; q < n; q++) {
        const l = L[row + q];
        zYes[q] += p * l;
        plogpL[q] += plogp * l;
        plogpM[q] += plogp * (1 - l);
        pLlogL[q] += p * LlogL[row + q];
        pMlogM[q] += p * MlogM[row + q];
      }
    }
    const h = new Float64Array(n).fill(Infinity);
    for (let q = 0; q < n; q++) {
      if (!ok[q]) continue;
      const zy = clip(zYes[q], 1e-9, 1 - 1e-9);
      const zn = 1 - zy;
      const hYes = -(plogpL[q] + pLlogL[q]) / zy + Math.log(zy);
      const hNo = -(plogpM[q] + pMlogM[q]) / zn + Math.log(zn);
      h[q] = zy * hYes + zn * hNo;
    }
    return h;
  }

  /** Returns the best question and its expected reduction in uncertainty, or null if none are left. */
  async nextQuestion(): Promise<{ question: Question; gain: number } | null> {
    const P = await this.probs();
    const { symOk, areaOk } = this.allowed();
    const hSym = this.expectedEntropy(P, this.symLik, symOk);
    const hArea = this.expectedEntropy(P, this.areaLik, areaOk);
    // Same tie-break as the Python: symptoms (by index) before areas.
    let best: Question | null = null;
    let bestH = Infinity;
    for (let s = 0; s < hSym.length; s++) {
      if (hSym[s] < bestH) {
        bestH = hSym[s];
        best = { kind: "symptom", index: s };
      }
    }
    for (let a = 0; a < hArea.length; a++) {
      if (hArea[a] < bestH) {
        bestH = hArea[a];
        best = { kind: "area", index: a };
      }
    }
    return best ? { question: best, gain: entropy(P) - bestH } : null;
  }

  async nextStep(): Promise<Step> {
    const { threshold, maxQuestions, minGain, stableQuestions: k } = this.stopping;
    if (this.nAnswered >= maxQuestions) return { action: "stop", reason: `reached the ${maxQuestions}-question limit` };
    if (this.hasYes()) {
      const [top] = await this.top(1);
      if (top.p >= threshold) return { action: "stop", reason: `confident (${Math.round(top.p * 100)}%)` };
      const h = this.top3History;
      if (k && h.length >= k && h.slice(-k).every((t) => t === h[h.length - 1]))
        return { action: "stop", reason: `top 3 unchanged for ${k} answers` };
    }
    const next = await this.nextQuestion();
    if (!next) return { action: "stop", reason: "no questions left" };
    if (this.hasYes() && minGain && next.gain < minGain)
      return { action: "stop", reason: "no remaining question is likely to change the answer" };
    return { action: "ask", question: next.question, gain: next.gain };
  }

  // ----- noticing answers that don't add up (training/consistency.py) -----

  /** Log-likelihood of every answer so far under the single disease that explains them best. */
  fit() {
    const { S, D } = this;
    const A = this.areaMembers.length;
    const answered: number[] = [];
    for (let s = 0; s < S; s++) if (this.yes[s] || this.no[s]) answered.push(s);
    let best = -Infinity;
    for (let d = 0; d < D; d++) {
      if (this.ruledOut[d]) continue;
      let ll = 0;
      for (const s of answered) {
        const p = this.psd[d * S + s];
        ll += this.yes[s] ? Math.log(p) : Math.log1p(-p);
      }
      for (const [a, v] of this.areaAnswers) if (v === true) ll += Math.log(this.pArea[d * A + a]);
      if (ll > best) best = ll;
    }
    return best;
  }

  /** null, or why the answers look like someone trying to trick the game. Pass atResult when about to show a guess. */
  suspicion(atResult = false): Suspicion | null {
    const r = this.meta.consistency;
    const a = this.answers.map((h) => h.answer);
    const t = a.length;
    const k = r.dontKnowStreak;
    if (t >= k && a.slice(-k).every((v) => v === null)) return "dont-know";
    if (t >= r.noYesAfter && !a.some((v) => v === true)) return "all-no";
    if (t >= r.mismatchAfter && this.fit() < r.mismatchOffset + r.mismatchSlope * t) return "mismatch";
    if (atResult) {
      if (t >= r.allYesAfter && a.every((v) => v === true)) return "all-yes";
      if (t >= r.alternatingAfter && !a.includes(null) && a.every((v, i) => i === 0 || v !== a[i - 1]))
        return "alternating";
    }
    return null;
  }

  isChild() {
    return this.age !== null && this.meta.childAges.includes(this.age);
  }

  questionText(q: Question) {
    const child = this.isChild();
    if (q.kind === "area") {
      const area = this.meta.areas[q.index];
      return child ? area.childQuestion : area.question;
    }
    return `Does this apply to ${child ? "your child" : "you"}: ${this.meta.symptoms[q.index]}?`;
  }
}
