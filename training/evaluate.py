"""Measure how often the Akinator finds the right disease.

Each held-out test patient is interviewed exactly like a real user in
akinator_cli.py, and every answer is read truthfully from the patient's record
(an area question is "yes" if the patient has any symptom in that area).

Usage:
    python evaluate.py                        # 500 random test patients, default settings
    python evaluate.py --compare              # old vs new question strategies on the same patients
    python evaluate.py --n 2000 --show 3      # more patients, print 3 transcripts
    python evaluate.py --disease migraine     # only patients with one disease
"""
import argparse
import os
import time
from collections import Counter

import numpy as np

import demographics
from akinator_engine import Akinator

HERE = os.path.dirname(os.path.abspath(__file__))

# name -> Akinator settings. "old" reproduces the game before body-area
# questions, network-picked questions and the smarter stopping rule.
CONFIGS = {
    "old (stats, symptoms only, stop at 35)":
        dict(question_mode="stats", use_areas=False, max_questions=35, min_gain=0, stable_questions=0),
    "+ body areas":
        dict(question_mode="stats", use_areas=True, max_questions=35, min_gain=0, stable_questions=0),
    "+ smarter stopping, limit 75":
        dict(question_mode="stats", use_areas=True),
    "+ age and sex asked first (default)":
        dict(question_mode="stats", use_areas=True, profile=True),
    "network picks questions instead":
        dict(question_mode="network", use_areas=True, profile=True),
}

# Rough share of users in each age group, used when the record allows several.
AGE_WEIGHTS = {"baby": 0.1, "child": 0.15, "teen": 0.1, "adult": 0.65}


def pick_profile(ak, patient, disease, rng):
    """A random age and sex that fit the patient's symptoms and disease (None if nothing fits)."""
    has = {ak.symptoms[i] for i in np.flatnonzero(patient)}

    def fits(sex, age):
        return not (has & demographics.excluded_symptoms(sex, age)) and \
            disease not in demographics.excluded_diseases(sex, age)

    sexes = [s for s in demographics.SEXES if fits(s, None)]
    sex = rng.choice(sexes) if sexes else None
    ages = [a for a in demographics.AGES if fits(sex, a)]
    if not ages:
        return sex, None
    w = np.array([AGE_WEIGHTS[a] for a in ages])
    return sex, ages[rng.choice(len(ages), p=w / w.sum())]


def truthful_answer(ak, patient, question):
    kind, i = question
    if kind == "symptom":
        return bool(patient[i])
    return bool(patient[ak.area_members[i]].any())


def interview(ak, patient, profile=None):
    ak.reset()
    if profile:
        ak.set_profile(*profile)
    transcript = []
    while True:
        action, value = ak.next_step()
        if action == "stop":
            return ak.top(3), transcript, value
        ans = truthful_answer(ak, patient, value)
        ak.answer(value, ans)
        transcript.append((ak.question_text(value), ans))


def run(ak, X, y, idx, show=0, label="", profile=False, seed=0):
    top1 = top3 = 0
    questions, reasons, confusions = [], Counter(), Counter()
    per_disease = {}
    rng = np.random.default_rng(seed)
    t0 = time.time()
    for k, i in enumerate(idx, 1):
        truth = ak.diseases[y[i]]
        prof = pick_profile(ak, X[i], truth, rng) if profile else None
        guesses, transcript, reason = interview(ak, X[i], prof)
        names = [g for g, _ in guesses]
        hit1, hit3 = names[0] == truth, truth in names
        top1 += hit1
        top3 += hit3
        per_disease.setdefault(truth, []).append((hit1, hit3))
        questions.append(len(transcript))
        reasons[reason.split(" (")[0]] += 1
        if not hit1:
            confusions[(truth, names[0])] += 1
        if k <= show:
            who = f" ({prof[1] or 'age unknown'}, {prof[0] or 'sex unknown'})" if prof else ""
            print(f"\n--- patient {k}{who}: actually has {truth.upper()} ---")
            for q, ans in transcript:
                print(f"    {q} {'yes' if ans else 'no'}")
            mark = "correct" if hit1 else ("in top 3" if hit3 else "WRONG")
            print("  guesses: " + ", ".join(f"{g} {p:.0%}" for g, p in guesses) + f"  [{mark}] ({reason})")
        if k % 100 == 0:
            print(f"  {label} ...{k}/{len(idx)} patients, top1 so far {top1 / k:.1%}", flush=True)
    n = len(idx)
    d1 = np.mean([np.mean([h[0] for h in v]) for v in per_disease.values()])
    d3 = np.mean([np.mean([h[1] for h in v]) for v in per_disease.values()])
    return dict(top1=top1 / n, top3=top3 / n, top1_d=d1, top3_d=d3, q=np.array(questions),
                reasons=reasons, confusions=confusions, secs=time.time() - t0)


def report(name, r):
    q = r["q"]
    print(f"\n===== {name} =====")
    print(f"Top guess correct:   {r['top1']:.1%}   (averaged per disease {r['top1_d']:.1%})")
    print(f"Correct in top 3:    {r['top3']:.1%}   (averaged per disease {r['top3_d']:.1%})")
    print(f"Questions asked:     avg {q.mean():.1f}, median {np.median(q):.0f}, max {q.max()}")
    print("Why it stopped:      " + ", ".join(f"{k} {v / len(q):.0%}" for k, v in r["reasons"].most_common()))
    print(f"Time:                {r['secs']:.0f}s ({r['secs'] / len(q) * 1000:.0f} ms per patient)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.path.join(HERE, "data", "dataset.npz"))
    parser.add_argument("--n", type=int, default=500, help="number of test patients")
    parser.add_argument("--disease", help="only test patients with this disease")
    parser.add_argument("--compare", action="store_true", help="compare question strategies on the same patients")
    parser.add_argument("--network-questions", action="store_true",
                        help="pick questions by re-running the neural network")
    parser.add_argument("--no-areas", action="store_true")
    parser.add_argument("--no-profile", action="store_true", help="don't give the game each patient's age and sex")
    parser.add_argument("--threshold", type=float, default=0.85)
    parser.add_argument("--max-questions", type=int, default=75)
    parser.add_argument("--min-gain", type=float, default=0.02)
    parser.add_argument("--stable", type=int, default=12, help="stop when the top 3 is unchanged this many answers")
    parser.add_argument("--show", type=int, default=0, help="print this many example interviews")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    if not os.path.exists(args.data):
        raise SystemExit(f"Can't find {args.data}.\nDownload dataset.npz from your Kaggle "
                         "prep notebook's output and put it in a 'data' folder next to this script.")
    d = np.load(args.data)
    X, y, test_idx = d["X"].astype(bool), d["y"], d["test_idx"]

    base = Akinator(question_mode="stats")
    if X.shape[1] != len(base.symptoms):
        raise SystemExit("dataset.npz doesn't match the model's symptom list; use the same prep run's output.")
    if args.disease:
        test_idx = test_idx[y[test_idx] == base.diseases.index(args.disease.lower())]
        print(f"{len(test_idx)} test patients with {args.disease}")
    idx = np.random.default_rng(args.seed).permutation(test_idx)[:args.n]

    if args.compare:
        results = {}
        for name, cfg in CONFIGS.items():
            print(f"\nrunning: {name}")
            cfg = dict(cfg)
            profile = cfg.pop("profile", False)
            results[name] = run(Akinator(**cfg), X, y, idx, label=name, profile=profile, seed=args.seed)
            report(name, results[name])
        print(f"\n===== Summary on the same {len(idx)} test patients =====")
        print(f"{'strategy':42s} {'top1':>6s} {'top3':>6s} {'top1/disease':>13s} {'avg q':>6s}")
        for name, r in results.items():
            print(f"{name:42s} {r['top1']:6.1%} {r['top3']:6.1%} {r['top1_d']:13.1%} {r['q'].mean():6.1f}")
        return

    ak = Akinator(question_mode="network" if args.network_questions else "stats", use_areas=not args.no_areas,
                  threshold=args.threshold, max_questions=args.max_questions,
                  min_gain=args.min_gain, stable_questions=args.stable)
    r = run(ak, X, y, idx, show=args.show, profile=not args.no_profile, seed=args.seed)
    report(f"Results on {len(idx)} test patients", r)
    if r["confusions"]:
        print("\nMost common mix-ups (actual -> guessed):")
        for (a, b), c in r["confusions"].most_common(10):
            print(f"    {a} -> {b}  ({c}x)")


if __name__ == "__main__":
    main()
