# Acheinator

**Track:** Health  
**Team:** *Prajwal Prashanth, Sharva Desai, Bhargava Gumpula*  
**Live demo:** [acheinator.xyz](https://acheinator.xyz)

Acheinator is an Akinator-style symptom interviewer: it asks yes / no / don’t-know questions and ranks possible diseases from your answers. The guesser runs **entirely in your browser**—answers are not sent to a server for inference.

---

## The problem

People often google isolated symptoms and get alarming or useless results. They need a structured way to narrow “what might this be?” without pretending to be a doctor. The hard part is not one big ML call—it is **which question to ask next** while beliefs stay coherent, fast enough to run on a phone, and **private** enough that people will actually use it.

---

## What we built

**In:** Age and sex (optional filters), then a stream of yes / no / don’t-know answers to symptom and body-area questions.

**Out:** A ranked list of diseases with confidence scores, optional descriptions and precautions, and the question history (with undo).

**How someone uses it:** Open the site, start a session, answer questions at their own pace, see live top guesses, finish when the engine is confident or question budget is spent. If answers look inconsistent (all no, all yes, nonsense patterns), the genie pauses like Akinator and offers fix / continue / start over.

**Stack:** Static Next.js site on GitHub Pages; ONNX Runtime Web (WASM) for inference; custom PyTorch model and game engine in `training/`.

---

## What we added

Our own idea, inspired by Akinator and public symptom–disease tables—not a copy of a hackathon starter repo.

We added:

- **Merged multi-dataset vocabulary** (356 symptoms × 778 diseases) with name alignment across sources  
- **Adaptive questioning** via expected information gain on **P(symptom | disease)**, plus **~20 body-area** gate questions  
- **Demographics** (age / sex) to skip impossible symptoms and diseases  
- **Akinator-style consistency checks** (streaks, mismatch vs likelihood, alternating patterns)  
- **Full client-side deployment** (no backend for answers)  
- **Animated mascot** (Symptomator) with reactions tied to answers and confidence  
- **230-game parity suite** so the TypeScript engine matches Python

---

## How it works

### Data

We merged several public **symptom → disease** CSV-style datasets from Kaggle (largest reference: [Diseases and Symptoms](https://www.kaggle.com/datasets/dhivyeshrk/diseases-and-symptoms-dataset); descriptions/precautions from [Disease Symptom Description](https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset) and related files). `training/prepare_data.py`:

- Normalizes disease and symptom names and maps aliases onto one vocabulary  
- Builds a multi-hot matrix: each row = one patient profile, label = disease  
- Drops unlabeled rows and exact duplicate symptom profiles  
- Computes **P(symptom | disease)** and **P(disease)** on the training split → shipped as `stats.bin`  
- Train / val / test split **per disease** (~80 / 10 / 10)

**Scale today:** **356** symptoms, **778** diseases, tens of thousands of patient rows after merge (exact counts per source are printed when you run prepare).

### Model

**Type:** **feedforward multilayer perceptron (MLP)**. At each step the net takes the **current interview state**: a **712-dimensional** vector (356 yes-bits + 356 no-bits; unasked symptoms are 0 in both). The **game engine** picks the next question separately, using expected information gain from **P(symptom | disease)**.

**SymptomNet** (PyTorch → ONNX), implemented in `training/train.py`:

```
Input (batch × 712)
  → Linear(712 → 1024) → LayerNorm → GELU → Dropout(0.3)
  → Linear(1024 → 1024) → LayerNorm → GELU → Dropout(0.3)
  → Linear(1024 → 1024) → LayerNorm → GELU → Dropout(0.3)
  → Linear(1024 → 778)
Output: logits (batch × 778) → softmax → P(disease)
```

| | |
|--|--|
| **Family** | MLP / fully connected; **depth 3** hidden blocks, **hidden width 1024** |
| **Parameters** | **~4.7M** trainable (Linear + LayerNorm + bias) |
| **Input tensor** | `answers`, shape `[batch, 712]`: concatenation `[yes_0…yes_355, no_0…no_355]` as 0/1 floats |
| **Output tensor** | `logits`, shape `[batch, 778]` (ONNX names in `meta.json` → `network`) |
| **Activation / norm** | GELU + LayerNorm in each block; **dropout 0.3** (training only) |
| **Loss** | Cross-entropy + **label smoothing 0.05**; **disease-balanced** sampling (mixture with uniform per-disease sampling) |
| **Design** | Fixed symptom vocabulary → fixed-size state vector; one forward pass per answer; runs in browser WASM |
| **Export** | `model.onnx` (~14.5 MB) + `meta.json` + `stats.bin` |

**Hybrid game loop:** the **neural net updates beliefs** after each answer; **question choice** uses statistical expected entropy on **P(symptom | disease)** (and area probabilities). That stats mode tested better than re-scoring every candidate question through the net (over-confidence on hypotheticals). Age/sex rule-outs and area “yes” evidence are applied as log-factors outside the raw input tensor.

**Stopping (defaults):** top disease ≥ **85%** (after at least one yes), no remaining question with gain ≥ **0.02** nats, top-3 stable for **12** answers, or **75** questions max.

**Browser:** `onnxruntime-web` WASM (single-threaded for GitHub Pages), engine ported line-close to Python in `app/src/engine/akinator.ts`.

---

## Results

| Setting | Top-1 | Top-3 | Notes |
|--------|-------|-------|--------|
| **Held-out test, all symptoms revealed** | **~86%** | **~98%** | Upper bound—model sees full yes/no interview |
| **Simulated Akinator loop on test patients** | **~57%** | **~70%** | Answers read honestly from records; **~29** questions on average (`training/model/metrics.json`) |
| **Per-disease average (same simulation)** | **~55%** | **~66%** | Rare diseases not drowned out by duplicate rows |

**Baseline we compare against:** simpler engine (individual symptoms only, no body areas, shorter cap)—see `training/evaluate.py --compare`. The full system adds areas, demographics, and smarter stopping.

**Where it fails (and why we think so):**

- **Noisy, overlapping public labels**—same symptoms map to many diseases in the data  
- **Simulation ≠ real users**—eval assumes truthful answers from patient records  
- **Long tail of rare diseases**—few training rows per class  
- **Not clinical validation**—merged educational datasets, not prospective care  
- **Troll detection is rule-based**—catches patterns, not subtle medical inconsistency

---

## What we'd do next

1. **Prospective eval**—small user study with “ground truth” from clinicians or structured cases, not only dataset playback.
2. **Lighter + clearer mobile path**—smaller WASM bundle, transparent alpha video on iOS, optional “low bandwidth” mode without `.mov` duplicates.

---

## Sources

**Datasets**

- [Diseases and Symptoms Dataset](https://www.kaggle.com/datasets/dhivyeshrk/diseases-and-symptoms-dataset) (Kaggle)  
- [Disease Symptom Description Dataset](https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset) (Kaggle)  
- Additional symptom CSVs discovered under the Kaggle input tree and merged in `training/prepare_data.py`

**Models & libraries**

- [PyTorch](https://pytorch.org/) — training  
- [ONNX](https://onnx.ai/) — browser export  
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) — in-browser inference

**App & deploy**

- [Next.js](https://nextjs.org/) — static export  
- [GitHub Pages](https://pages.github.com/) — hosting ([workflow](.github/workflows/deploy.yml))

**Tools**

- Cursor and other AI assistants for implementation, refactors, and documentation  
- [ffmpeg](https://ffmpeg.org/) / macOS VideoToolbox — character clip import (`.webm` + iOS `.mov`)

---

## Repo layout

| Path | Purpose |
|------|--------|
| `training/` | Data prep, train, evaluate, export to `app/public/model/` |
| `app/` | Next.js UI, TypeScript engine, mascot |
| `animations/symptomator/` | Source clips → `cd app && npm run animations` |

```bash
cd training && python3 export_web_assets.py && python3 make_parity_cases.py
cd app && npm run animations && npm run dev
cd app && npm test && npm run build
```

**Not medical advice.** Acheinator is for education and exploration only.