"""Age and sex rules: symptoms and diseases that are (near) impossible for a person.

Only things that essentially can't happen are excluded, e.g. a man can't have
vaginal discharge and a baby can't be pregnant, but a man *can* get a breast
lump and an adult *can* wet the bed, so those are left alone.
"""

AGES = {
    "baby": "a baby or toddler (under 4)",
    "child": "a child (4 to 12)",
    "teen": "a teenager (13 to 17)",
    "adult": "an adult (18 or older)",
}
SEXES = {"female": "female", "male": "male"}

PRE_PUBERTY = {"baby", "child"}
UNDER_18 = {"baby", "child", "teen"}
PAST_INFANCY = {"child", "teen", "adult"}
PAST_EARLY_CHILDHOOD = {"teen", "adult"}

MENSTRUATION = [
    "absence of menstruation", "blood clots during menstrual periods", "frequent menstruation",
    "heavy menstrual flow", "intermenstrual bleeding", "long menstrual periods", "painful menstruation",
    "premenstrual tension or irritability", "scanty menstrual flow", "unpredictable menstruation",
]
PREGNANCY = [
    "pain during pregnancy", "problems during pregnancy", "recent pregnancy",
    "spotting or bleeding during pregnancy", "uterine contractions", "postpartum problems of the breast",
]
MENOPAUSE = ["early or late onset of menopause", "vaginal bleeding after menopause"]
VAGINAL = [
    "vaginal discharge", "vaginal dryness", "vaginal itching", "vaginal pain", "vaginal redness",
    "vulvar irritation", "vulvar sore",
]
MALE_GENITAL = [
    "bumps on penis", "itching of scrotum", "mass in scrotum", "pain in testicles", "penile discharge",
    "penis pain", "penis redness", "swelling of scrotum", "symptoms of prostate",
    "symptoms of the scrotum and testes",
]
SEXUAL = ["impotence", "premature ejaculation", "pain during intercourse", "loss of sex drive", "infertility"]
INFANT = ["infant feeding problem", "infant spitting up", "irritable infant", "symptoms of infants"]
SUBSTANCES = ["abusing alcohol", "drug abuse", "smoking problems"]

# (names, sexes it's impossible for, ages it's impossible for)
SYMPTOM_RULES = [
    (MENSTRUATION, {"male"}, {"baby"}),
    (PREGNANCY, {"male"}, PRE_PUBERTY),
    (MENOPAUSE, {"male"}, UNDER_18),
    (VAGINAL, {"male"}, set()),
    (MALE_GENITAL, {"female"}, set()),
    (["impotence", "premature ejaculation"], {"female"}, PRE_PUBERTY),
    (SEXUAL, set(), PRE_PUBERTY),
    (INFANT, set(), PAST_INFANCY),
    (["diaper rash", "pulling at ears"], set(), PAST_EARLY_CHILDHOOD),
    (SUBSTANCES, set(), PRE_PUBERTY),
]

PREGNANCY_DISEASES = [
    "acute fatty liver of pregnancy (aflp)", "ectopic pregnancy", "gestational diabetes", "hyperemesis gravidarum",
    "hypertension of pregnancy", "induced abortion", "missed abortion", "placenta previa", "placental abruption",
    "postpartum depression", "preeclampsia", "pregnancy", "premature rupture of amniotic membrane",
    "problem during pregnancy", "spontaneous abortion", "threatened pregnancy", "uterine atony",
]
MENSTRUAL_DISEASES = [
    "idiopathic absence of menstruation", "idiopathic excessive menstruation", "idiopathic infrequent menstruation",
    "idiopathic irregular menstrual cycle", "idiopathic painful menstruation", "premenstrual tension syndrome",
]
FEMALE_DISEASES = [
    "atrophic vaginitis", "benign vaginal discharge (leukorrhea)", "cervical cancer", "cervical disorder",
    "cervicitis", "endometrial cancer", "endometrial hyperplasia", "endometriosis", "female genitalia infection",
    "female infertility of unknown cause", "foreign body in the vagina", "idiopathic nonmenstrual bleeding",
    "menopause", "ovarian cancer", "ovarian cyst", "ovarian torsion", "pelvic inflammatory disease",
    "pelvic organ prolapse", "polycystic ovarian syndrome (pcos)", "premature ovarian failure", "turner syndrome",
    "uterine cancer", "uterine fibroids", "vaginal cyst", "vaginal yeast infection", "vaginismus", "vaginitis",
    "vulvar cancer", "vulvar disorder", "vulvodynia",
]
MALE_DISEASES = [
    "balanitis", "benign prostatic hyperplasia (bph)", "cryptorchidism", "epididymitis", "erectile dysfunction",
    "gynecomastia", "hydrocele of the testicle", "male genitalia infection", "phimosis", "prostate cancer",
    "prostatitis", "testicular cancer", "testicular disorder", "testicular torsion", "varicocele of the testicles",
]

DISEASE_RULES = [
    (PREGNANCY_DISEASES, {"male"}, PRE_PUBERTY),
    (MENSTRUAL_DISEASES, {"male"}, {"baby"}),
    (FEMALE_DISEASES, {"male"}, set()),
    (MALE_DISEASES, {"female"}, set()),
    (["menopause", "atrophic vaginitis", "premature ovarian failure", "polycystic ovarian syndrome (pcos)",
      "endometriosis", "female infertility of unknown cause"], set(), PRE_PUBERTY),
    (["menopause", "atrophic vaginitis"], set(), UNDER_18),
    (["erectile dysfunction", "benign prostatic hyperplasia (bph)", "prostate cancer"], set(), UNDER_18),
    (["neonatal jaundice", "pyloric stenosis"], set(), PAST_INFANCY),
    (["teething syndrome", "diaper rash"], set(), PAST_EARLY_CHILDHOOD),
]


def _excluded(rules, sex, age):
    out = set()
    for names, sexes, ages in rules:
        if sex in sexes or age in ages:
            out.update(names)
    return out


def excluded_symptoms(sex, age):
    """Names of symptoms that can't apply. sex / age may be None (unknown)."""
    return _excluded(SYMPTOM_RULES, sex, age)


def excluded_diseases(sex, age):
    return _excluded(DISEASE_RULES, sex, age)


def skipped_areas(sex, age):
    """Body-area questions (ids from body_areas.AREAS) that are pointless for this person."""
    skip = {"female"} if sex == "male" else {"male"} if sex == "female" else set()
    if age is not None:
        skip.add("infant")  # "Is this about a baby?" is already answered
    return skip


def check_names(symptoms, diseases):
    """Names in the rules that aren't in the model's vocabulary (e.g. after a data change)."""
    known_s, known_d = set(symptoms), set(diseases)
    missing = {n for names, _, _ in SYMPTOM_RULES for n in names if n not in known_s}
    missing |= {n for names, _, _ in DISEASE_RULES for n in names if n not in known_d}
    return sorted(missing)


if __name__ == "__main__":
    import json, os
    vocab = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "vocab.json")))
    print("names not in the model:", check_names(vocab["symptoms"], vocab["diseases"]) or "none")
    for age in AGES:
        for sex in SEXES:
            print(f"{age:6s} {sex:6s}: {len(excluded_symptoms(sex, age)):3d} symptoms, "
                  f"{len(excluded_diseases(sex, age)):3d} diseases ruled out")
