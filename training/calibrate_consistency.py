"""Plays honest test patients and "trolls" (all yes, all no, random, ...) and records,
after every answer, the signals the game uses to notice answers that don't add up.
Used to pick the thresholds in consistency.py so honest players are almost never flagged.

Usage:
    python calibrate_consistency.py            # 600 honest patients, 150 games per troll
"""
import argparse
import os

import numpy as np

import consistency
from akinator_engine import Akinator
from evaluate import pick_profile, truthful_answer

HERE = os.path.dirname(os.path.abspath(__file__))
CAP = 60  # stop recording a game after this many answers


def trolls(rng):
    """name -> answer(question, step). Each is a way of answering without describing a real illness."""
    return {
        "all yes": lambda q, t: True,
        "all no": lambda q, t: False,
        "all don't know": lambda q, t: None,
        "random yes/no": lambda q, t: bool(rng.random() < 0.5),
        "random incl. don't know": lambda q, t: [True, False, None][rng.integers(3)],
        "alternating": lambda q, t: t % 2 == 0,
        "mostly yes": lambda q, t: bool(rng.random() < 0.8),
    }


def dont_know_streak(answers):
    n = 0
    while n < len(answers) and answers[-1 - n] is None:
        n += 1
    return n


def play(ak, answer_fn, profile, rng):
    """Plays like the game does: after each answer, check before asking the next question or
    showing a result. Returns one row per answer: (n_answered, fit, n_yes, dont_know_streak, reason)."""
    ak.reset()
    if profile:
        ak.set_profile(*profile)
    rows = []
    action, q = ak.next_step()
    while action == "ask" and ak.n_answered < CAP:
        ak.answer(q, answer_fn(q, ak.n_answered))
        action, q = ak.next_step()
        a = ak.answer_values
        rows.append((ak.n_answered, consistency.fit(ak), sum(x is True for x in a), dont_know_streak(a),
                     ak.suspicion(at_result=action == "stop")))
    return rows


def first_flag(rows):
    return next(((t, r) for t, _, _, _, r in rows if r), None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.path.join(HERE, "data", "dataset.npz"))
    parser.add_argument("--n", type=int, default=600)
    parser.add_argument("--troll-games", type=int, default=150)
    parser.add_argument("--flip", type=float, default=0.05, help="share of answers flipped in the 'careless' run")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--save", default=os.path.join(HERE, "data", "consistency_traces.npz"))
    args = parser.parse_args()

    d = np.load(args.data)
    X, y, test_idx = d["X"].astype(bool), d["y"], d["test_idx"]
    ak = Akinator(question_mode="stats")
    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(test_idx)[:args.n]

    groups = {}
    for name, flip in [("honest", 0.0), (f"careless ({args.flip:.0%} flipped)", args.flip)]:
        games = []
        for k, i in enumerate(idx, 1):
            prof = pick_profile(ak, X[i], ak.diseases[y[i]], rng)

            def fn(q, t, p=X[i]):
                a = truthful_answer(ak, p, q)
                return (not a) if rng.random() < flip else a

            games.append(play(ak, fn, prof, rng))
            if k % 100 == 0:
                print(f"  {name}: {k}/{len(idx)}", flush=True)
        groups[name] = games

    for name, fn in trolls(rng).items():
        games = []
        for _ in range(args.troll_games):
            i = rng.choice(test_idx)
            games.append(play(ak, fn, pick_profile(ak, X[i], ak.diseases[y[i]], rng), rng))
        groups[name] = games
        print(f"  {name}: done", flush=True)

    print(f"\n{'who':32s} {'flagged':>8s} {'median answer':>14s}  reasons")
    for name, games in groups.items():
        flags = [first_flag(g) for g in games]
        hit = [f for f in flags if f]
        reasons = {}
        for _, r in hit:
            reasons[r] = reasons.get(r, 0) + 1
        med = f"{np.median([t for t, _ in hit]):.0f}" if hit else "-"
        print(f"{name:32s} {len(hit) / len(games):8.1%} {med:>14s}  " +
              ", ".join(f"{r} {c}" for r, c in sorted(reasons.items(), key=lambda kv: -kv[1])))

    flat = {name: np.array([(t, f, ny, dk) for g in games for t, f, ny, dk, _ in g]) for name, games in groups.items()}
    np.savez(args.save, **{k.replace(" ", "_"): v for k, v in flat.items()})
    print(f"\nsaved per-answer traces to {args.save}")


if __name__ == "__main__":
    main()
