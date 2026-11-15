"""Notices answers that don't add up, like Akinator does when you try to trick it.
Mirrored in app/src/engine/akinator.ts (suspicion()); thresholds are exported to meta.json.

Thresholds come from calibrate_consistency.py (600 honest test patients, 150 games per troll):
honest players were flagged in 0.2% of games (all "yes"), each troll pattern below in 100%.
Random yes/no answers are rarely caught: the game reaches a confident guess in about 10
answers, and so few random answers usually look like a real illness."""
import numpy as np

RULES = dict(
    dont_know_streak=8,     # this many "don't know"s in a row
    no_yes_after=20,        # this many answers without a single "yes"
    all_yes_after=5,        # at a result: every answer was "yes"
    alternating_after=8,    # at a result: answers went yes, no, yes, no, ...
    mismatch_after=8,       # no disease explains the answers: best log-likelihood below
    mismatch_offset=-2.0,   # offset + slope * answers
    mismatch_slope=-0.75,
)


def fit(ak):
    """Log-likelihood of every answer so far under the single disease that explains them best."""
    ll = np.log(ak.psd) @ ak.yes.astype(np.float64) + np.log1p(-ak.psd) @ ak.no.astype(np.float64)
    for a, v in ak.area_answers.items():
        if v is True:
            ll += np.log(ak.p_area[:, a])
    ll[ak.ruled_out] = -np.inf
    return float(ll.max())


def suspicion(ak, answers, at_result=False):
    """None, or why the answers look like someone trying to trick the game:
    "dont-know", "all-no", "mismatch", and at a result also "all-yes" or "alternating".
    answers: True / False / None per answer, in order."""
    r, t = RULES, len(answers)
    k = r["dont_know_streak"]
    if t >= k and all(a is None for a in answers[-k:]):
        return "dont-know"
    if t >= r["no_yes_after"] and not any(a is True for a in answers):
        return "all-no"
    if t >= r["mismatch_after"] and fit(ak) < r["mismatch_offset"] + r["mismatch_slope"] * t:
        return "mismatch"
    if at_result:
        if t >= r["all_yes_after"] and all(a is True for a in answers):
            return "all-yes"
        if t >= r["alternating_after"] and None not in answers and \
                all(answers[i] != answers[i - 1] for i in range(1, t)):
            return "alternating"
    return None
