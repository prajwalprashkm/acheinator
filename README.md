# **Acheinator:** an *Akinator-style* symptom interviewer

**Track:** AI \+ Health  
**Team:** Prajwal Prashanth, Sharva Desai, Bhargava Gumpula  
**Live demo:** [acheinator.xyz](https://acheinator.xyz)

# **Part 1: Submission Form Answers**

| Form question | Answer |
| :---- | :---- |
| Project title | Acheinator: an Akinator-style symptom interviewer |
| Building as | Team |
| Team name | Awesome |
| Team members | Prajwal Prashanth, Sharva Desai, Bhargava Gumpula |
| Track | AI \+ Health |
| Starting point | 4.1.4 Your own idea |
| One-sentence pitch | Acheinator is an online symptom quiz, reminiscent of Akinator, which asks questions designed to progressively identify and show a ranked list of possible diseases, all running privately in their browser. |
| Code link | https\://github.com/prajwalprashkm/acheinator |
| Write-up link | This document |
| Demo link | [https\://youtu.be/44vUVFdrDS0](https://youtu.be/44vUVFdrDS0) |
| What we added | A vocabulary of 356 symptoms and 778 diseases combined from a few public sources; adaptive questioning based on expected information gain; 20+ body part questions; age and gender filters; Akinator-like consistency checks; full client-side implementation; animated mascot; and 230 game parity checker to make sure that TypeScript version is compatible with Python. |
| Datasets, models and AI tools used | Kaggle Diseases and Symptoms and Disease Symptom Description datasets plus additional symptom CSVs; a custom PyTorch MLP exported to ONNX; ONNX Runtime Web; Cursor and other AI assistants for implementation, refactors and documentation. |
| New to AI? | No |

# **Part 2: Write-up**

# **The problem**

Many times, people google individual symptoms and get either alarming or unhelpful information. The need exists for a systematic approach to narrow down "what can this possibly be?" without posing as a doctor. This is not one single large ML inference task. This involves knowing which question to ask next while maintaining coherence, speed, and privacy.

# **What we built**

Acheinator is an Akinator-style symptom interviewer. It asks yes / no / don't-know questions and ranks possible diseases from your answers. The guesser runs entirely in your browser, so answers are not sent to a server for inference.

* **In:** Age and sex (optional filters), then a stream of yes / no / don't-know answers to symptom and body-area questions.  
* **Out:** A ranked list of diseases with confidence scores, optional descriptions and precautions, and the question history (with undo).  
* **How someone uses it:** Open the site, start a session, and answer questions at your own pace while watching the live top guesses. The session ends when the engine is confident or the question budget is spent. If answers look inconsistent (all no, all yes, nonsense patterns), the genie pauses like Akinator and offers fix / continue / start over.  
* **Stack:** Static Next.js site on GitHub Pages; ONNX Runtime Web (WASM) for inference; custom PyTorch model and game engine in training/.

# **What we added**

This is our own idea, inspired by Akinator and public symptom-disease tables. It is not a copy of a hackathon starter repo. We added:

* Merged multi-dataset vocabulary (356 symptoms × 778 diseases) with name alignment across sources  
* Adaptive questioning via expected information gain on P(symptom \| disease), plus \~20 body-area gate questions  
* Demographics (age/sex) to skip impossible symptoms and diseases  
* Akinator-style consistency checks (streaks, mismatch vs. likelihood, alternating patterns)  
* Full client-side deployment (no backend for answers)  
* Animated mascot (Doctor G) with reactions tied to answers and confidence  
* 230-game parity suite so the TypeScript engine matches Python

# **How it works**

## **Data**

We merged several public symptom → disease datasets from Kaggle. training/prepare\_data.py:

* Normalizes disease and symptom names and maps aliases onto one vocabulary  
* Builds a multi-hot matrix, where each row is one patient profile and the label is the disease  
* Drops unlabeled rows and exact duplicate symptom profiles  
* Computes P(symptom \| disease) and P(disease) on the training split, shipped as stats.bin  
* Splits train / val / test per disease (\~80/10/10)

Scale today: 356 symptoms, 778 diseases, and tens of thousands of patient rows after merge.

## **Model**

SymptomNet is a feedforward MLP (PyTorch to ONNX), found in training/train.py. Each step, it uses the current interview state as a 712-bit vector (356 yes-bits \+ 356 no-bits; unknown symptoms are 0 for both). Architecture:

* Input (batch × 712\)  
* Linear(712→1024) → LayerNorm → GELU → Dropout(0.3)  
* Linear(1024→1024) → LayerNorm → GELU → Dropout(0.3)  
* Linear(1024→1024) → LayerNorm → GELU → Dropout(0.3)  
* Linear(1024→778)  
* Output: logits (batch × 778\) → softmax → P(disease)

| Property | Detail |
| :---- | :---- |
| Family | MLP/fully connected; 3 hidden blocks, width 1024 |
| Parameters | \~4.7M trainable |
| Input tensor | answers, shape \[batch, 712\]: \[yes\_0...yes\_355, no\_0...no\_355\] as 0/1 floats |
| Output tensor | logits, shape \[batch, 778\] |
| Loss | Cross-entropy with label smoothing 0.05; disease-balanced sampling |
| Export | model.onnx (\~14.5 MB) \+ meta.json \+ stats.bin |

## **Hybrid game loop**

Belief updating is performed by the network after each answer, but questions are chosen using the expected entropy calculated statistically from the probabilities of P(symptom \| disease) and areas. It performed better than scoring all potential questions using the network, which was too confident with hypothetical cases. Age/sex elimination rules and "yes" evidence for areas are used as logarithmic factors on the input tensor.

## **Stopping (defaults)**

The interview ends when any of these happens:

* the top disease reaches ≥85% (after at least one yes)  
* no remaining question has gain ≥0.02 nats  
* the top 3 are stable for 12 answers  
* 75 questions have been asked

## **Browser**

onnxruntime-web WASM (single-threaded for GitHub Pages), with the engine ported line-close to Python in app/src/engine/akinator.ts.

# **Results**

| Setting | Top-1 | Top-3 | Notes |
| :---- | :---- | :---- | :---- |
| Baseline: simpler engine (individual symptoms only, no body areas, shorter cap) | File | File | Run training/evaluate.py \--compare |
| Held-out test, all symptoms revealed | \~86% | \~98% | Upper bound: model sees the full yes/no interview |
| Final: simulated Akinator loop on test patients | \~57% | \~70% | Answers read honestly from records; \~29 questions on average |
| Final: per-disease average (same simulation) | \~55% | \~66% | Rare diseases not drowned out by duplicate rows |

The full system adds areas, demographics and smarter stopping over the baseline.

# **Where it fails (and why we think so)**

* Overlapping public terms: similar symptoms can be attributed to multiple diseases.  
* Not actual use: the evaluation relies on honest responses from the medical record.  
* Long tail for rare diseases: there are very few training entries per disease.  
* This is not validated clinically: these are combined educational datasets, not actual patients.  
* Troll detection is rule-based: it identifies patterns rather than inconsistencies in the medical field.

# **What we'd do next**

1. Prospective eval: run a small user study with "ground truth" from clinicians or structured cases, not only dataset playback.  
2. Lighter, clearer mobile path: a smaller WASM bundle, transparent alpha video on iOS, and an optional low-bandwidth mode without .mov duplicates.

# **Sources**

## **Datasets**

* [Diseases and Symptoms Dataset (Kaggle)](https://www.kaggle.com/datasets/dhivyeshrk/diseases-and-symptoms-dataset) (https\://www\.kaggle.com/datasets/dhivyeshrk/diseases-and-symptoms-dataset)  
* [Disease Symptom Description Dataset (Kaggle)](https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset)  
  (https\://www\.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset)  
* Additional symptom CSVs from the Kaggle input tree, merged in training/prepare\_data.py

## **Models and libraries**

PyTorch, ONNX, ONNX Runtime Web, Next.js, GitHub Pages

## **AI tools**

Cursor and other AI assistants for implementation, refactors and documentation; ffmpeg/macOS Video Toolbox for character clip import (.webm \+ iOS .mov)

**Not medical advice. Acheinator is for education and exploration only.**