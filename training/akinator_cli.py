"""Text-based symptom Akinator.

Usage:
    python akinator_cli.py            # normal mode
    python akinator_cli.py --verbose  # also show the top guesses after every answer

Asks age group and sex first, so it never asks impossible questions
(see demographics.py). Use --no-profile to skip that.
"""
import argparse
import textwrap

from akinator_engine import Akinator
from demographics import AGES


def wrap(text, indent="    "):
    return textwrap.fill(text, width=80, initial_indent=indent, subsequent_indent=indent)


def show_result(ak, reason=None):
    guesses = ak.top(3)
    name, p = guesses[0]
    print("\n" + "=" * 60)
    print(f"I think it might be: {name.upper()}  ({p:.0%} confidence)")
    print("=" * 60)
    if reason:
        print(f"(stopped after {ak.n_answered} questions: {reason})")
    info = ak.info.get(name, {})
    if info.get("description"):
        print("\nAbout it:")
        print(wrap(info["description"]))
    if info.get("precautions"):
        print("\nPrecautions:")
        for tip in info["precautions"]:
            print(f"    - {tip}")
    print("\nOther possibilities:")
    for other, q in guesses[1:]:
        print(f"    - {other} ({q:.0%})")
    print("\nThis is a hackathon demo, not medical advice. Please see a doctor for a real diagnosis.")


def choose(prompt, options):
    """options: {key: label}. Returns a key, or None if skipped."""
    keys = list(options)
    print("\n" + prompt)
    for n, k in enumerate(keys, 1):
        print(f"    {n}) {options[k]}")
    print("    s) prefer not to say")
    while True:
        reply = input("> ").strip().lower()
        if reply == "s":
            return None
        if reply.isdigit() and 1 <= int(reply) <= len(keys):
            return keys[int(reply) - 1]
        print(f"  Please answer 1-{len(keys)} or s.")


def ask_profile(ak):
    # Age first: it says who the game is about, so the sex question can be worded to match.
    age = choose("Who are the symptoms for? They are...", AGES)
    who = {"baby": "Is the baby a boy or a girl?", "child": "Is the child a boy or a girl?"}.get(
        age, "What sex were you assigned at birth?")
    sex = choose(who, {"female": "female" if age not in ("baby", "child") else "girl",
                       "male": "male" if age not in ("baby", "child") else "boy"})
    ak.set_profile(sex, age)


SUSPICIONS = {
    "dont-know": "That's a lot of \"don't know\"s... a best guess is fine: answer yes or no if you can.",
    "all-no": "No to everything? If something is bothering you, at least one of these should be a yes.",
    "all-yes": "Yes to everything? Illnesses don't usually work like that. Are you testing me?",
    "alternating": "Yes, no, yes, no... your answers are taking turns. Are you testing me?",
    "mismatch": "Hmm, these answers don't add up: none of the conditions I know fit them all. Maybe one was a slip?",
}


def play(ak, verbose, profile=True):
    ak.reset()
    if profile:
        ask_profile(ak)
    print("\nThink about how you're feeling. I'll ask yes/no questions about your symptoms.")
    print("Answer y (yes), n (no), ? (don't know), u (undo last answer), g (guess now) or q (quit).")
    trusted = False  # chose to keep going after being told the answers look off

    while True:
        if verbose:
            print("    thinking: " + " | ".join(f"{d} {p:.0%}" for d, p in ak.top(3)))
        action, value = ak.next_step()
        suspicion = None if trusted else ak.suspicion(at_result=action == "stop")
        if suspicion:
            print("\n" + SUSPICIONS[suspicion])
            reply = input("Fix your last answer (f), keep going anyway (k) or start over (r)? ").strip().lower()
            if reply == "r":
                return play(ak, verbose, profile)
            if reply == "k":
                trusted = True
            else:
                ak.undo()
                continue
        if action == "stop":
            show_result(ak, value)
            if input("\nKeep asking questions to refine? [y/N] ").strip().lower() != "y":
                return
            ak.keep_asking(10)
            continue

        question = value
        while True:
            reply = input(f"\nQ{ak.n_answered + 1}. {ak.question_text(question)} ").strip().lower()
            if reply in ("y", "yes", "n", "no", "?", "u", "g", "q"):
                break
            print("  Please answer y, n, ?, u, g or q.")

        if reply == "q":
            return
        if reply == "g":
            show_result(ak)
            return
        if reply == "u":
            print("  Undid the last answer." if ak.undo() else "  Nothing to undo.")
            continue
        ak.answer(question, True if reply in ("y", "yes") else False if reply in ("n", "no") else None)


def main():
    parser = argparse.ArgumentParser(description="Symptom Akinator")
    parser.add_argument("--verbose", action="store_true", help="show top guesses after every answer")
    parser.add_argument("--threshold", type=float, default=0.85, help="confidence needed to stop asking")
    parser.add_argument("--max-questions", type=int, default=75, help="hard safety limit")
    parser.add_argument("--network-questions", action="store_true",
                        help="pick questions by re-running the neural network (slower, tested less accurate)")
    parser.add_argument("--no-areas", action="store_true", help="only ask about individual symptoms")
    parser.add_argument("--no-profile", action="store_true", help="don't ask age and sex first")
    args = parser.parse_args()

    print("Loading model...")
    ak = Akinator(question_mode="network" if args.network_questions else "stats", use_areas=not args.no_areas,
                  threshold=args.threshold, max_questions=args.max_questions)
    print(f"Ready: {len(ak.symptoms)} symptoms, {len(ak.diseases)} diseases.")
    while True:
        play(ak, args.verbose, profile=not args.no_profile)
        if input("\nPlay again? [y/N] ").strip().lower() != "y":
            break


if __name__ == "__main__":
    main()
