# %% [1] Imports and locate the dataset files
import os, re, json, glob, difflib, shutil
import numpy as np
import pandas as pd

INPUT = os.environ.get("KAGGLE_INPUT", "/kaggle/input")
OUT = os.environ.get("KAGGLE_OUT", "/kaggle/working/data")
os.makedirs(OUT, exist_ok=True)

ALL_CSVS = sorted(glob.glob(f"{INPUT}/**/*.csv", recursive=True))

def file_kind(path):
    name = os.path.basename(path).lower()
    if re.search(r"description|precaution|severity", name):
        return "meta"
    # uom190346a: only 4 yes/no symptoms plus a Positive/Negative test outcome,
    # so it can't be treated as "patient has disease X with these symptoms".
    if "patient_profile" in name:
        return "skip"
    return "data"

for p in ALL_CSVS:
    print(f"[{file_kind(p):4s}] {os.path.relpath(p, INPUT)}")


# %% [2] Name normalisation and matching helpers
def norm(s):
    s = str(s).strip().lower().replace("_", " ")
    s = re.sub(r"\s*\(\s*", " (", s)
    s = re.sub(r"\s*\)\s*", ") ", s)
    return re.sub(r"\s+", " ", s).strip()

# Hand-checked name mappings. Applied to every dataset (including the big
# reference one), after norm(). Targets are the big dataset's names unless the
# disease/symptom doesn't exist there, in which case one spelling is chosen.
DISEASE_ALIASES = {
    # typo in the big dataset itself
    "benign paroxysmal positional vertical (bppv)": "benign paroxysmal positional vertigo (bppv)",
    "(vertigo) paroymsal positional vertigo": "benign paroxysmal positional vertigo (bppv)",
    "(vertigo) paroxysmal positional vertigo": "benign paroxysmal positional vertigo (bppv)",
    "paroxysmal positional vertigo": "benign paroxysmal positional vertigo (bppv)",
    "peptic ulcer diseae": "gastroduodenal ulcer",
    "peptic ulcer disease": "gastroduodenal ulcer",
    "dimorphic hemmorhoids (piles)": "hemorrhoids",
    "dimorphic hemorrhoids (piles)": "hemorrhoids",
    "osteoarthristis": "osteoarthritis",
    "alcoholic hepatitis": "alcoholic liver disease",
    "gerd": "gastroesophageal reflux disease (gerd)",
    "bronchial asthma": "asthma",
    "gastroenteritis": "infectious gastroenteritis",
    "fungal infection": "fungal infection of the skin",
    "paralysis (brain hemorrhage)": "intracerebral hemorrhage",
    "paralysis (brain hemorrhageh": "intracerebral hemorrhage",
    "cervical spondylosis": "spondylosis",
    "chicken pox": "chickenpox",
    "typhoid": "typhoid fever",
    "dengue": "dengue fever",
    "aids": "human immunodeficiency virus infection (hiv)",
    "hypertension": "high blood pressure",
    "covid": "covid-19",
    "covid 19": "covid-19",
    # hepatitis types can't be told apart from symptoms (needs a blood test)
    "hepatitis a": "viral hepatitis",
    "hepatitis b": "viral hepatitis",
    "hepatitis c": "viral hepatitis",
    "hepatitis d": "viral hepatitis",
    "hepatitis e": "viral hepatitis",
}

# Symptoms from the smaller datasets (itachi9604 / karthikudyawar, 132-symptom
# vocabulary) mapped onto the big dataset's 327 symptoms. Symptoms with no
# real equivalent there (e.g. loss of taste, yellow crust ooze, coma) are left
# out on purpose and stay as their own symptom.
SYMPTOM_ALIASES = {
    # same thing, different wording
    "abdominal pain": "sharp abdominal pain",
    "belly pain": "sharp abdominal pain",
    "stomach pain": "sharp abdominal pain",
    "acidity": "heartburn",
    "indigestion": "heartburn",
    "anxiety": "anxiety and nervousness",
    "blood in sputum": "hemoptysis",
    "bloody stool": "blood in stool",
    "breathlessness": "shortness of breath",
    "burning micturition": "painful urination",
    "spotting urination": "painful urination",
    "chest pain": "sharp chest pain",
    "congestion": "nasal congestion",
    "continuous feel of urine": "frequent urination",
    "polyuria": "frequent urination",
    "continuous sneezing": "sneezing",
    "cramps": "cramps and spasms",
    "dark urine": "unusual color or odor to urine",
    "yellow urine": "unusual color or odor to urine",
    "foul smell of urine": "unusual color or odor to urine",
    "diarrhoea": "diarrhea",
    "dischromic patches": "abnormal appearing skin",
    "dyschromic patches": "abnormal appearing skin",
    "distention of abdomen": "abdominal distention",
    "swelling of stomach": "swollen abdomen",
    "drying and tingling lips": "dry lips",
    "excessive hunger": "excessive appetite",
    "increased appetite": "excessive appetite",
    "fast heart rate": "increased heart rate",
    "fluid overload": "fluid retention",
    "high fever": "fever",
    "mild fever": "fever",
    "hip joint pain": "hip pain",
    "history of alcohol consumption": "abusing alcohol",
    "brittle nails": "irregular appearing nails",
    "inflammatory nails": "irregular appearing nails",
    "small dents in nails": "irregular appearing nails",
    "irritation in anus": "itching of the anus",
    "pain in anal region": "pain of the anus",
    "pain during bowel movements": "pain of the anus",
    "itching": "itching of skin",
    "lethargy": "fatigue",
    "tiredness": "fatigue",
    "loss of appetite": "decreased appetite",
    "loss of balance": "dizziness",
    "unsteadiness": "dizziness",
    "spinning movements": "dizziness",
    "malaise": "feeling ill",
    "mood swings": "emotional symptoms",
    "movement stiffness": "stiffness all over",
    "mucoid sputum": "coughing up sputum",
    "phlegm": "coughing up sputum",
    "muscle wasting": "muscle weakness",
    "nodal skin eruptions": "skin lesion",
    "obesity": "weight gain",
    "pain behind the eyes": "pain in eye",
    "painful walking": "problems with movement",
    "passage of gases": "flatulence",
    "blackheads": "acne or pimples",
    "pus filled pimples": "acne or pimples",
    "red sore around nose": "sore in nose",
    "red spots over body": "skin rash",
    "redness of eyes": "eye redness",
    "runny nose": "coryza",
    "shivering": "chills",
    "sinus pressure": "painful sinuses",
    "skin peeling": "skin dryness, peeling, scaliness, or roughness",
    "slurred speech": "slurring words",
    "stiff neck": "neck stiffness or tightness",
    "swelled lymph nodes": "swollen lymph nodes",
    "swelling joints": "joint swelling",
    "swollen extremeties": "peripheral edema",
    "swollen extremities": "peripheral edema",
    "swollen legs": "leg swelling",
    "throat irritation": "sore throat",
    "ulcers on tongue": "mouth ulcer",
    "watering from eyes": "lacrimation",
    "weakness in limbs": "weakness",
    "weakness of one body side": "focal weakness",
    "weight loss": "recent weight loss",
    "yellowing of eyes": "jaundice",
    "yellowish skin": "jaundice",
    "blurred and distorted vision": "diminished vision",
    "visual disturbances": "diminished vision",
    "bladder discomfort": "symptoms of bladder",
    "abnormal menstruation": "unpredictable menstruation",
    # spelling variants inside the small datasets (no big-dataset equivalent)
    "cold hands and feets": "cold hands and feet",
    "scurring": "skin scarring",
    "scurrying": "skin scarring",
    "toxic look (typhos)": "toxic look (typhus)",
}

def build_map(names, vocab, manual, label):
    """Map each name onto `vocab`: exact match or hand-checked alias, otherwise
    keep it as a new name. No automatic fuzzy matching: it merged opposites
    like 'increased appetite' -> 'decreased appetite'."""
    vocab = sorted(vocab)
    vocab_set = set(vocab)
    mapping, new = {}, []
    for n in sorted(set(names)):
        mapping[n] = manual.get(n, n)
        if mapping[n] not in vocab_set:
            new.append(mapping[n])
    n_exact = sum(n not in manual and n in vocab_set for n in mapping)
    n_alias = sum(n in manual for n in mapping)
    print(f"  {label}: {len(mapping)} names | {n_exact} exact | {n_alias} via alias | "
          f"{len(set(new))} not in reference dataset")
    for n in sorted(set(new)):
        close = difflib.get_close_matches(n, vocab, n=3, cutoff=0.75)
        hint = f"   (similar names to check: {close})" if close else ""
        print(f"    kept as its own name: {n!r}{hint}")
    return mapping


# %% [3] Load every symptom dataset into (disease, row, symptom) triples
def drop_unlabelled(df, label, path):
    """Rows without a disease name can't be used (they'd become a disease called 'nan')."""
    ok = df[label].notna() & (df[label].astype(str).str.strip() != "")
    if (~ok).any():
        print(f"  {os.path.relpath(path, INPUT)}: {(~ok).sum()} rows have no disease name (removed)")
    return df[ok].reset_index(drop=True)

def load_source(path):
    """Supports both layouts used by these datasets:
    - list:    Disease, Symptom_1, Symptom_2, ... (symptom names as values)
    - one-hot: one text label column + one 0/1 column per symptom
    Returns (disease names per row, row ids, symptom name per positive entry)."""
    df = pd.read_csv(path)
    df = df.loc[:, ~df.columns.astype(str).str.lower().str.startswith("unnamed")]
    sym_cols = [c for c in df.columns if re.fullmatch(r"symptom[ _]?\d+", str(c).strip(), re.I)]
    if sym_cols:
        label = next(c for c in df.columns if c not in sym_cols)
        df = drop_unlabelled(df, label, path)
        y = df[label].map(norm).to_numpy()
        rows, syms = [], []
        for r, vals in enumerate(df[sym_cols].itertuples(index=False)):
            for v in vals:
                if pd.notna(v) and str(v).strip():
                    rows.append(r)
                    syms.append(norm(v))
        return y, np.array(rows, np.int64), np.array(syms, dtype=object)

    text_cols = df.select_dtypes(exclude="number").columns
    if len(text_cols) != 1:
        return None
    label = text_cols[0]
    df = drop_unlabelled(df, label, path)
    y = df[label].map(norm).to_numpy()
    # pandas renames repeated CSV headers to "name.1", "name.2"; fold them back together
    names = np.array([norm(re.sub(r"\.\d+$", "", str(c))) for c in df.columns if c != label], dtype=object)
    M = df.drop(columns=label).fillna(0).to_numpy() > 0
    rows, cols = np.nonzero(M)
    return y, rows.astype(np.int64), names[cols]

sources = []
for p in ALL_CSVS:
    if file_kind(p) != "data":
        continue
    loaded = load_source(p)
    if loaded is None:
        print(f"skipping {os.path.relpath(p, INPUT)}: unrecognised layout")
        continue
    y_s, r_s, s_s = loaded
    sources.append({"name": os.path.relpath(p, INPUT), "y": y_s, "rows": r_s, "syms": s_s})
    print(f"loaded {os.path.relpath(p, INPUT)}: {len(y_s)} rows, "
          f"{len(set(s_s))} symptoms, {len(set(y_s))} diseases")

# The largest dataset (dhivyeshrk) defines the reference names; the others are aligned to it.
sources.sort(key=lambda s: -len(s["y"]))
ref = sources[0]
ref_diseases = {DISEASE_ALIASES.get(d, d) for d in ref["y"]}
ref_symptoms = {SYMPTOM_ALIASES.get(s, s) for s in ref["syms"]}
print(f"\nreference dataset: {ref['name']}")


# %% [4] Align disease and symptom names across datasets
disease_map, symptom_map = {}, {}
for src in sources:
    print(f"\n{src['name']}")
    dm = build_map(src["y"], ref_diseases, DISEASE_ALIASES, label="Diseases")
    sm = build_map(src["syms"], ref_symptoms, SYMPTOM_ALIASES, label="Symptoms")
    disease_map.update(dm)
    symptom_map.update(sm)
    src["y"] = np.array([dm[d] for d in src["y"]], dtype=object)
    src["syms"] = np.array([sm[s] for s in src["syms"]], dtype=object)


# %% [5] Merge into one multi-hot matrix over the union of symptoms
symptoms = sorted({s for src in sources for s in src["syms"]})
sym_idx = {s: i for i, s in enumerate(symptoms)}

n_rows = sum(len(src["y"]) for src in sources)
X = np.zeros((n_rows, len(symptoms)), np.int8)
y, source = [], []
offset = 0
for src in sources:
    cols = np.array([sym_idx[s] for s in src["syms"]], np.int64)
    X[offset + src["rows"], cols] = 1
    y.extend(src["y"])
    source.extend([src["name"]] * len(src["y"]))
    offset += len(src["y"])
y = np.array(y, dtype=object)
source = np.array(source)
del sources


# %% [6] Data-removal settings (everything is kept by default)
# Duplicate rows are kept: repeated symptom combinations tell the model which
# combinations are common. All copies of a row go to the same split (below),
# so the test set never contains a copy of a training row.
DROP_DUPLICATE_ROWS = False
# Diseases with fewer distinct symptom combinations than this are removed.
# 1 keeps every disease.
MIN_DISTINCT_PATIENTS = 1

n_loaded = len(X)
# Rows with no symptoms at all have nothing to learn from.
empty = X.sum(1) == 0
print(f"rows with no symptoms (removed, unusable): {empty.sum()}")
X, y, source = X[~empty], y[~empty], source[~empty]

row_keys = pd.Series([b.tobytes().hex() + "|" + d for b, d in zip(np.packbits(X, axis=1), y)])
group = pd.factorize(row_keys)[0]
dup = pd.Series(group).duplicated().to_numpy()
print(f"duplicate rows: {dup.sum()} ({'removed' if DROP_DUPLICATE_ROWS else 'kept'})")
if DROP_DUPLICATE_ROWS:
    X, y, source, group = X[~dup], y[~dup], source[~dup], group[~dup]

distinct = pd.Series(group).groupby(y).nunique()
rare = sorted(distinct[distinct < MIN_DISTINCT_PATIENTS].index)
if rare:
    print(f"removing {len(rare)} diseases with < {MIN_DISTINCT_PATIENTS} distinct patients: {rare}")
    keep = ~pd.Series(y).isin(rare).to_numpy()
    X, y, source, group = X[keep], y[keep], source[keep], group[keep]

# Symptom columns that nobody in the data has carry no information.
used = X.sum(0) > 0
if (~used).any():
    print(f"symptoms that never occur (removed): {[s for s, u in zip(symptoms, used) if not u]}")
X = X[:, used]
symptoms = [s for s, u in zip(symptoms, used) if u]
sym_idx = {s: i for i, s in enumerate(symptoms)}

diseases = sorted(set(y))
dis_idx = {d: i for i, d in enumerate(diseases)}
y_id = np.array([dis_idx[d] for d in y], np.int32)
print(f"\nkept {len(X)} of {n_loaded} rows | {len(symptoms)} symptoms | {len(diseases)} diseases")
print(pd.Series(source).value_counts().to_string())


# %% [7] Per-disease train / val / test split (~80 / 10 / 10 of rows)
# Splits by distinct symptom combination so copies of a row stay together.
# Held-out combinations are picked until they reach ~10% of the disease's
# rows, so one combination copied 100 times can't pull most of a disease's
# data out of training. Diseases with fewer than 3 distinct combinations go
# entirely to train (nothing would be left to learn from otherwise).
HOLDOUT_FRAC = 0.1

def pick_holdout(groups, sizes, target):
    """Random groups whose total size stays within target (at least one group, the smallest if none fit)."""
    chosen, total = [], 0
    for g in groups:
        if total + sizes[g] <= target:
            chosen.append(g)
            total += sizes[g]
    return chosen or [min(groups, key=lambda g: sizes[g])]

rng = np.random.default_rng(42)
split = np.zeros(len(X), np.int8)  # 0 train, 1 val, 2 test
train_only = []
for c in range(len(diseases)):
    rows = np.flatnonzero(y_id == c)
    g_ids, g_sizes = np.unique(group[rows], return_counts=True)
    if len(g_ids) < 3:
        train_only.append(diseases[c])
        continue
    sizes = dict(zip(g_ids, g_sizes))
    target = HOLDOUT_FRAC * len(rows)
    largest = g_ids[np.argmax(g_sizes)]  # always stays in training
    remaining = [g for g in rng.permutation(g_ids) if g != largest]
    test_g = pick_holdout(remaining, sizes, target)
    remaining = [g for g in remaining if g not in set(test_g)]
    val_g = pick_holdout(remaining, sizes, target)
    split[rows[np.isin(group[rows], test_g)]] = 2
    split[rows[np.isin(group[rows], val_g)]] = 1
tr, va, te = (rng.permutation(np.flatnonzero(split == k)) for k in (0, 1, 2))
print(f"train {len(tr)} | val {len(va)} | test {len(te)}")
if train_only:
    print(f"{len(train_only)} diseases have < 3 distinct patients, so all their rows are in train "
          f"(not tested): {train_only}")


# %% [8] Disease info (description, precautions) and symptom severity, merged across datasets
def to_final_disease(name):
    n = norm(name)
    return disease_map.get(n, DISEASE_ALIASES.get(n, n))

def to_final_symptom(name):
    n = norm(name)
    return symptom_map.get(n, SYMPTOM_ALIASES.get(n, n))

info = {d: {"description": None, "precautions": []} for d in diseases}
sev_weights = {}
for p in ALL_CSVS:
    if file_kind(p) != "meta":
        continue
    meta = pd.read_csv(p)
    name = os.path.basename(p).lower()
    for _, r in meta.iterrows():
        if "severity" in name:
            s = to_final_symptom(r.iloc[0])
            w = pd.to_numeric(r.iloc[1], errors="coerce")
            if s in sym_idx and pd.notna(w):
                sev_weights[s] = max(sev_weights.get(s, 0), int(w))
            continue
        d = to_final_disease(r.iloc[0])
        if d not in info:
            continue
        if "description" in name and not info[d]["description"] and pd.notna(r.iloc[1]):
            info[d]["description"] = str(r.iloc[1]).strip()
        elif "precaution" in name and not info[d]["precautions"]:
            info[d]["precautions"] = [str(x).strip() for x in r.iloc[1:] if pd.notna(x) and str(x).strip()]
print(f"diseases with a description: {sum(v['description'] is not None for v in info.values())}/{len(diseases)}")

default_w = int(np.median(list(sev_weights.values()))) if sev_weights else 1
severity = [sev_weights.get(s, default_w) for s in symptoms]


# %% [9] Akinator statistics from the training split: P(symptom | disease) and P(disease)
# Smoothing adds ALPHA imaginary patients per disease whose symptoms follow the
# overall symptom frequencies. (Adding 50/50 pseudo-counts instead would make
# every symptom ~20% likely for diseases with only a few patients.)
ALPHA = 1.0
Xtr, ytr = X[tr], y_id[tr]
n_d = np.bincount(ytr, minlength=len(diseases))
sym_counts = np.zeros((len(diseases), len(symptoms)), np.float64)
np.add.at(sym_counts, ytr, Xtr)
base_rate = np.clip(Xtr.mean(0), 1e-4, None)
p_sym_given_dis = ((sym_counts + ALPHA * base_rate) / (n_d[:, None] + ALPHA)).astype(np.float32)
p_dis = (n_d / n_d.sum()).astype(np.float32)


# %% [10] Save everything to /kaggle/working/data
np.savez_compressed(
    f"{OUT}/dataset.npz",
    X=X, y=y_id, train_idx=tr, val_idx=va, test_idx=te, source=source,
)
np.savez_compressed(f"{OUT}/akinator_stats.npz", p_sym_given_dis=p_sym_given_dis, p_dis=p_dis)
with open(f"{OUT}/vocab.json", "w") as f:
    json.dump({"symptoms": symptoms, "diseases": diseases, "severity": severity}, f)
with open(f"{OUT}/disease_info.json", "w") as f:
    json.dump(info, f, indent=1)
with open(f"{OUT}/name_maps.json", "w") as f:
    json.dump({"disease_map": disease_map, "symptom_map": symptom_map}, f, indent=1)

print("saved:", sorted(os.listdir(OUT)))

zip_path = shutil.make_archive(os.path.join(os.path.dirname(OUT), "data"), "zip", OUT)
print(f"zipped for download: {zip_path} ({os.path.getsize(zip_path) / 1e6:.1f} MB)")
