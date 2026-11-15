"""The Akinator game logic, shared by akinator_cli.py and evaluate.py.

Questions are either ("symptom", symptom index) or ("area", area index).
"""
import json
import os

import numpy as np
import torch
import torch.nn as nn

import consistency
import demographics
from body_areas import build_areas

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")


class SymptomNet(nn.Module):
    def __init__(self, n_symptoms, n_diseases, hidden=1024, depth=3, dropout=0.3):
        super().__init__()
        layers, d_in = [], 2 * n_symptoms
        for _ in range(depth):
            layers += [nn.Linear(d_in, hidden), nn.LayerNorm(hidden), nn.GELU(), nn.Dropout(dropout)]
            d_in = hidden
        self.body = nn.Sequential(*layers)
        self.head = nn.Linear(hidden, n_diseases)

    def forward(self, x):
        return self.head(self.body(x))


def entropy(P):
    return -(P * np.log(np.clip(P, 1e-12, None))).sum(-1)


class Akinator:
    def __init__(self, model_dir=MODEL_DIR, question_mode="stats", use_areas=True,
                 threshold=0.85, max_questions=75, min_gain=0.02, stable_questions=12,
                 network_candidates=40):
        """
        question_mode: "stats" scores questions with P(symptom | disease) from the
            data; "network" re-runs the neural network on both answers to every
            candidate question. "stats" tested more accurate (84% vs 76% top-1)
            because the network is over-confident about hypothetical answers.
        Stopping rules (game ends at the first one that applies):
            threshold         top guess at least this probable (after at least one "yes")
            min_gain          no remaining question is expected to reduce uncertainty
                              by at least this much (nats); 0 disables
            stable_questions  top 3 guesses unchanged for this many answers; 0 disables
            max_questions     hard safety limit
        """
        ckpt = torch.load(os.path.join(model_dir, "model.pt"), map_location="cpu")
        cfg = ckpt["config"]
        self.model = SymptomNet(cfg["n_symptoms"], cfg["n_diseases"], cfg["hidden"], cfg["depth"], cfg["dropout"])
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()
        self.trained_without_yes = cfg.get("trained_without_yes", False)

        vocab = json.load(open(os.path.join(model_dir, "vocab.json")))
        self.symptoms, self.diseases = vocab["symptoms"], vocab["diseases"]
        self.info = json.load(open(os.path.join(model_dir, "disease_info.json")))

        stats = np.load(os.path.join(model_dir, "akinator_stats.npz"))
        self.psd = np.clip(stats["p_sym_given_dis"].astype(np.float64), 1e-4, 1 - 1e-4)
        self.log_prior = np.log(np.clip(stats["p_dis"].astype(np.float64), 1e-12, None))

        areas = build_areas(self.symptoms) if use_areas else {}
        self.area_ids = list(areas)
        self.area_questions = [areas[a][0] for a in self.area_ids]
        self.area_child_questions = [areas[a][1] for a in self.area_ids]
        self.area_members = [np.array(areas[a][2]) for a in self.area_ids]
        # P(at least one symptom of the area | disease), assuming symptoms are independent given the disease
        log_none = np.stack([np.log(1 - self.psd[:, m]).sum(1) for m in self.area_members], 1) \
            if self.area_ids else np.zeros((len(self.diseases), 0))
        self.p_area = np.clip(1 - np.exp(log_none), 1e-4, 1 - 1e-4)

        missing = demographics.check_names(self.symptoms, self.diseases)
        if missing:
            print(f"warning: age/sex rules mention names the model doesn't know: {missing}")
        self.sym_index = {s: i for i, s in enumerate(self.symptoms)}
        self.dis_index = {d: i for i, d in enumerate(self.diseases)}

        self.question_mode = question_mode
        self.network_candidates = network_candidates
        self.stopping = dict(threshold=threshold, max_questions=max_questions, min_gain=min_gain,
                             stable_questions=stable_questions)
        self.reset()

    # ----- state -----
    def reset(self):
        """Starts a new game, undoing any keep_asking() from the last one."""
        for k, v in self.stopping.items():
            setattr(self, k, v)
        n = len(self.symptoms)
        self.yes = np.zeros(n, bool)
        self.no = np.zeros(n, bool)
        self.asked = np.zeros(n, bool)
        self.area_answers = {}  # area index -> True / False / None
        self.history = []
        self.answer_values = []  # True / False / None per answer, same length as history
        self.top3_history = []
        self.sex = self.age = None
        self.ruled_out = np.zeros(len(self.diseases), bool)
        self.skipped_areas = set()

    def set_profile(self, sex=None, age=None):
        """Call right after reset(). sex in demographics.SEXES, age in demographics.AGES, or None if unknown.
        Symptoms that can't apply are never asked and diseases that can't apply are ruled out.
        The skipped symptoms aren't fed to the network as "no": dozens of "no"s before any "yes"
        is unlike its training interviews and made its guesses slightly worse."""
        self.sex, self.age = sex, age
        for name in demographics.excluded_symptoms(sex, age):
            self.asked[self.sym_index[name]] = True
        self.ruled_out[:] = False
        self.ruled_out[[self.dis_index[d] for d in demographics.excluded_diseases(sex, age)]] = True
        skip = demographics.skipped_areas(sex, age)
        self.skipped_areas = {i for i, a in enumerate(self.area_ids) if a in skip}

    def _snapshot(self):
        return self.yes.copy(), self.no.copy(), self.asked.copy(), dict(self.area_answers)

    def answer(self, question, value):
        """value: True (yes), False (no) or None (don't know)."""
        self.history.append(self._snapshot())
        self.answer_values.append(value)
        kind, i = question
        if kind == "symptom":
            self.asked[i] = True
            self.yes[i] = value is True
            self.no[i] = value is False
        else:
            self.area_answers[i] = value
            m = self.area_members[i]
            if value is False:
                # "no problems with your eyes" means no to every eye symptom
                unanswered = m[~self.yes[m]]
                self.no[unanswered] = True
                self.asked[unanswered] = True
        self.top3_history.append(frozenset(d for d, _ in self.top(3)))

    def keep_asking(self, extra=10):
        """After a result: ask up to `extra` more questions, ignoring the other stopping rules."""
        self.max_questions = self.n_answered + extra
        self.threshold, self.min_gain, self.stable_questions = 1.01, 0, 0

    def undo(self):
        if not self.history:
            return False
        self.yes, self.no, self.asked, self.area_answers = self.history.pop()
        self.answer_values.pop()
        self.top3_history.pop()
        return True

    @property
    def n_answered(self):
        return len(self.history)

    def has_yes(self):
        return self.yes.any() or any(v is True for v in self.area_answers.values())

    # ----- predictions -----
    @torch.no_grad()
    def _network(self, yes, no):
        """Disease probabilities for a batch of answer states (B, S) -> (B, D)."""
        x = torch.from_numpy(np.concatenate([yes, no], 1).astype(np.float32))
        P = torch.softmax(self.model(x), 1).double().numpy()
        if not self.trained_without_yes:
            # Older models never saw interviews without a "yes"; use naive Bayes for those.
            for b in np.flatnonzero(~yes.any(1)):
                logp = self.log_prior + np.log(1 - self.psd[:, no[b]]).sum(1)
                P[b] = np.exp(logp - logp.max())
                P[b] /= P[b].sum()
        return P

    def _extra_log_factor(self):
        """Evidence the network input can't express: "yes" answers to area questions and
        diseases ruled out by age / sex."""
        f = np.where(self.ruled_out, -50.0, 0.0)
        for i, v in self.area_answers.items():
            if v is True:
                f += np.log(self.p_area[:, i])
        return f

    @staticmethod
    def _apply(P, log_factor):
        P = P * np.exp(log_factor - log_factor.max())
        return P / P.sum(-1, keepdims=True)

    def probs(self):
        return self._apply(self._network(self.yes[None], self.no[None]), self._extra_log_factor())[0]

    def top(self, k=3):
        p = self.probs()
        order = np.argsort(-p)[:k]
        return [(self.diseases[i], float(p[i])) for i in order]

    # ----- choosing questions -----
    def _allowed(self):
        sym_ok = ~self.asked
        area_ok = np.array([i not in self.area_answers and i not in self.skipped_areas
                            and (~self.asked[m]).any() and not self.yes[m].any()
                            for i, m in enumerate(self.area_members)], bool)
        return sym_ok, area_ok

    def _stats_expected_entropy(self, P, likelihood):
        """Expected entropy after asking each question, from P(yes | disease) columns."""
        plogp = P * np.log(np.clip(P, 1e-12, None))
        L = likelihood
        z_yes = np.clip(P @ L, 1e-9, 1 - 1e-9)
        z_no = 1 - z_yes
        h_yes = -(plogp @ L + P @ (L * np.log(L))) / z_yes + np.log(z_yes)
        h_no = -(plogp @ (1 - L) + P @ ((1 - L) * np.log(1 - L))) / z_no + np.log(z_no)
        return z_yes * h_yes + z_no * h_no

    def _network_expected_entropy(self, P, syms, areas):
        """Runs the network on the 'yes' and 'no' outcome of every candidate question."""
        n = len(syms) + len(areas)
        yes = np.repeat(self.yes[None], 2 * n, 0)
        no = np.repeat(self.no[None], 2 * n, 0)
        extra = np.zeros((2 * n, len(self.diseases)))
        for k, s in enumerate(syms):
            yes[2 * k, s] = True
            no[2 * k + 1, s] = True
        for k, a in enumerate(areas, start=len(syms)):
            extra[2 * k] = np.log(self.p_area[:, a])
            m = self.area_members[a]
            no[2 * k + 1, m[~self.yes[m]]] = True
        Q = self._apply(self._network(yes, no), self._extra_log_factor()[None] + extra)
        H = entropy(Q).reshape(n, 2)
        z_yes = np.concatenate([P @ self.psd[:, syms], P @ self.p_area[:, areas]]) if n else np.zeros(0)
        z_yes = np.clip(z_yes, 1e-9, 1 - 1e-9)
        return z_yes * H[:, 0] + (1 - z_yes) * H[:, 1]

    def next_question(self):
        """Returns (question, expected reduction in uncertainty) or (None, 0)."""
        P = self.probs()
        sym_ok, area_ok = self._allowed()
        h_sym = np.where(sym_ok, self._stats_expected_entropy(P, self.psd), np.inf)
        h_area = np.where(area_ok, self._stats_expected_entropy(P, self.p_area), np.inf) \
            if self.area_ids else np.zeros(0)
        if not np.isfinite(h_sym).any() and not np.isfinite(h_area).any():
            return None, 0.0

        if self.question_mode == "network":
            syms = [int(s) for s in np.argsort(h_sym)[:self.network_candidates] if np.isfinite(h_sym[s])]
            areas = [int(a) for a in np.flatnonzero(area_ok)]
            h = self._network_expected_entropy(P, syms, areas)
            questions = [("symptom", s) for s in syms] + [("area", a) for a in areas]
        else:
            questions = [("symptom", int(s)) for s in np.flatnonzero(np.isfinite(h_sym))] + \
                        [("area", int(a)) for a in np.flatnonzero(np.isfinite(h_area))]
            h = np.concatenate([h_sym[np.isfinite(h_sym)], h_area[np.isfinite(h_area)]])
        best = int(np.argmin(h))
        return questions[best], float(entropy(P) - h[best])

    def next_step(self):
        """Returns ("ask", question) or ("stop", reason)."""
        if self.n_answered >= self.max_questions:
            return "stop", f"reached the {self.max_questions}-question limit"
        if self.has_yes():
            name, p = self.top(1)[0]
            if p >= self.threshold:
                return "stop", f"confident ({p:.0%})"
            k = self.stable_questions
            if k and len(self.top3_history) >= k and len(set(self.top3_history[-k:])) == 1:
                return "stop", f"top 3 unchanged for {k} answers"
        question, gain = self.next_question()
        if question is None:
            return "stop", "no questions left"
        if self.has_yes() and self.min_gain and gain < self.min_gain:
            return "stop", "no remaining question is likely to change the answer"
        return "ask", question

    def suspicion(self, at_result=False):
        """None, or why the answers look like someone trying to trick the game (see consistency.py)."""
        return consistency.suspicion(self, self.answer_values, at_result)

    def question_text(self, question):
        kind, i = question
        child = self.age in demographics.PRE_PUBERTY
        if kind == "area":
            return (self.area_child_questions if child else self.area_questions)[i]
        return f"Does this apply to {'your child' if child else 'you'}: {self.symptoms[i]}?"
