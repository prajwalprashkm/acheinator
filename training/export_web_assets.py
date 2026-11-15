"""Copies the model and game data into the website (../app/public/model/).

Run after every retrain or rule change:
    python3 export_web_assets.py

Writes:
    model.onnx  the network, unchanged
    stats.bin   float32 little-endian: P(symptom | disease) (diseases x symptoms), then P(disease)
    meta.json   names, body areas, age/sex rules, disease info and game settings
"""
import json
import os
import re
import shutil

import numpy as np
import torch

import consistency
import demographics
from akinator_engine import Akinator
from body_areas import build_areas

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "model")
OUT = os.path.join(HERE, "..", "app", "public", "model")

ACRONYMS = {
    "adh": "ADH", "adhd": "ADHD", "aflp": "AFLP", "als": "ALS", "ards": "ARDS", "bph": "BPH", "bppv": "BPPV", "cidp": "CIDP",
    "copd": "COPD", "dvt": "DVT", "gerd": "GERD", "hiv": "HIV", "hocm": "HOCM", "hpv": "HPV", "nash": "NASH",
    "ocd": "OCD", "osa": "OSA", "pacs": "PACs", "pvcs": "PVCs", "pcos": "PCOS", "ptsd": "PTSD", "siadh": "SIADH",
    "sle": "SLE", "covid-19": "COVID-19",
}
PROPER_NOUNS = [
    "alzheimer", "asperger", "bell", "crohn", "cushing", "de quervain", "down", "eustachian", "graves",
    "guillain barre", "hashimoto", "hirschsprung", "huntington", "kaposi", "lewy", "lyme", "meckel", "meniere",
    "parkinson", "peyronie", "raynaud", "rocky mountain", "sjogren", "tietze", "tourette", "turner",
    "von willebrand", "wernicke korsakoff", "wilson", "zenker",
]


def display_name(name):
    """'benign prostatic hyperplasia (bph)' -> 'Benign prostatic hyperplasia (BPH)'."""
    out = re.sub(r"[a-z0-9-]+", lambda m: ACRONYMS.get(m.group(0), m.group(0)), name)
    for noun in PROPER_NOUNS:
        if noun == "down" and not out.startswith("down syndrome"):
            continue
        out = re.sub(rf"\b{noun}\b", lambda m: m.group(0).title(), out)
    return out[0].upper() + out[1:]


def main():
    ak = Akinator(MODEL_DIR)
    os.makedirs(OUT, exist_ok=True)
    shutil.copy(os.path.join(MODEL_DIR, "model.onnx"), os.path.join(OUT, "model.onnx"))

    stats = np.load(os.path.join(MODEL_DIR, "akinator_stats.npz"))
    psd = stats["p_sym_given_dis"].astype("<f4")
    p_dis = stats["p_dis"].astype("<f4")
    with open(os.path.join(OUT, "stats.bin"), "wb") as f:
        f.write(psd.tobytes())
        f.write(p_dis.tobytes())

    areas = build_areas(ak.symptoms)
    profiles = {}
    for sex in [None, *demographics.SEXES]:
        for age in [None, *demographics.AGES]:
            profiles[f"{sex or ''}|{age or ''}"] = {
                "symptoms": sorted(ak.sym_index[s] for s in demographics.excluded_symptoms(sex, age)),
                "diseases": sorted(ak.dis_index[d] for d in demographics.excluded_diseases(sex, age)),
                "skipAreas": sorted(demographics.skipped_areas(sex, age) & set(areas)),
            }

    meta = {
        "nSymptoms": len(ak.symptoms),
        "nDiseases": len(ak.diseases),
        "symptoms": ak.symptoms,
        "symptomLabels": [display_name(s) for s in ak.symptoms],
        "diseases": ak.diseases,
        "diseaseLabels": [display_name(d) for d in ak.diseases],
        "areas": [{"id": a, "question": q, "childQuestion": cq, "members": idx} for a, (q, cq, idx) in areas.items()],
        "ages": demographics.AGES,
        "sexes": demographics.SEXES,
        "childAges": sorted(demographics.PRE_PUBERTY),
        "profiles": profiles,
        "info": {str(i): {"description": ak.info[d].get("description"), "precautions": ak.info[d].get("precautions", [])}
                 for i, d in enumerate(ak.diseases)
                 if ak.info.get(d, {}).get("description") or ak.info.get(d, {}).get("precautions")},
        "trainedWithoutYes": ak.trained_without_yes,
        "defaults": {"threshold": ak.threshold, "maxQuestions": ak.max_questions, "minGain": ak.min_gain,
                     "stableQuestions": ak.stable_questions},
        "consistency": {re.sub(r"_(\w)", lambda m: m.group(1).upper(), k): v for k, v in consistency.RULES.items()},
        "network": {"input": "answers", "output": "logits"},
    }
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    for name in sorted(os.listdir(OUT)):
        print(f"  {name:12s} {os.path.getsize(os.path.join(OUT, name)) / 1e6:6.2f} MB")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
