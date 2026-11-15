"""Records games played by the Python engine so the website's TypeScript engine
can be checked against them (app/test/parity.test.ts).

    python3 make_parity_cases.py          # 200 games -> ../app/test/fixtures/parity.json

Each game uses a held-out test patient who answers truthfully, with a random
age/sex that fits their record, the odd "don't know", some undos and, in some
games, "keep asking to refine" after the first result. A few more games answer like
someone trying to trick the game (all yes, all no, ...) to check the suspicion rules.
"""
import argparse
import json
import os

import numpy as np

import consistency
from akinator_engine import Akinator
from evaluate import pick_profile, truthful_answer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "app", "test", "fixtures", "parity.json")


def top3(ak):
    p = ak.probs()
    order = np.argsort(-p)[:3]
    return [[int(i), float(p[i])] for i in order]


TROLLS = {
    "all yes": lambda t, rng: True,
    "all no": lambda t, rng: False,
    "all don't know": lambda t, rng: None,
    "alternating": lambda t, rng: t % 2 == 0,
    "random": lambda t, rng: [True, False, None][rng.integers(3)],
}
TROLL_CAP = 30  # answers recorded per troll game


def play(ak, patient, disease, rng, troll=None):
    ak.reset()
    profile = None
    if rng.random() < 0.85:
        profile = pick_profile(ak, patient, disease, rng)
        profile = [None if v is None else str(v) for v in profile]
        ak.set_profile(*profile)
    steps = []
    refined = False
    while not (troll and ak.n_answered >= TROLL_CAP):
        action, value = ak.next_step()
        if action == "stop":
            steps.append({"stop": value, "top": top3(ak), "suspicion": ak.suspicion(at_result=True)})
            if refined or rng.random() > 0.15:
                break
            refined = True
            ak.keep_asking(10)
            steps.append({"refine": True})
            continue
        kind, i = value
        if troll:
            ans = TROLLS[troll](ak.n_answered, rng)
        else:
            ans = truthful_answer(ak, patient, value)
            if rng.random() < 0.05:
                ans = None
        steps.append({"ask": [kind, int(i)], "text": ak.question_text(value), "answer": ans})
        ak.answer(value, ans)
        steps[-1].update(top=top3(ak), fit=consistency.fit(ak), suspicion=ak.suspicion())
        if not troll and ak.n_answered > 2 and rng.random() < 0.05:
            ak.undo()
            steps.append({"undo": True, "top": top3(ak)})
    return {"disease": int(ak.diseases.index(disease)), "profile": profile, "troll": troll, "steps": steps}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=200)
    parser.add_argument("--trolls", type=int, default=6, help="games per troll answering style")
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    d = np.load(os.path.join(HERE, "data", "dataset.npz"))
    X, y = d["X"].astype(bool), d["y"]
    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(d["test_idx"])[:args.n]
    ak = Akinator()
    cases = [play(ak, X[i], ak.diseases[y[i]], rng) for i in idx]
    for troll in TROLLS:
        for i in idx[:args.trolls]:
            cases.append(play(ak, X[i], ak.diseases[y[i]], rng, troll))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"cases": cases}, f, separators=(",", ":"))
    n_steps = sum(len(c["steps"]) for c in cases)
    print(f"wrote {len(cases)} games ({n_steps} steps) to {OUT}")


if __name__ == "__main__":
    main()
