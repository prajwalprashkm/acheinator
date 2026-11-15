"""Groups of symptoms that can be asked about with one broad question
("Do you have any problems with your eyes?"), the way Akinator asks broad
questions before specific ones.

A symptom can belong to several areas. Symptoms that match no pattern (e.g.
family history) are only ever asked about individually.
"""
import re

# area id -> (question, question when the patient is a baby or child, regex patterns matched against symptom names)
AREAS = {
    "head": ("Do you have problems with your head or nerves, like headaches, dizziness, fainting, numbness, seizures or memory trouble?",
             "Does your child have problems with their head or nerves, like headaches, dizziness, fainting, numbness, seizures or memory trouble?",
             [r"headache", r"dizziness", r"fainting", r"seizures", r"memory", r"slurring", r"difficulty speaking",
              r"altered sensorium", r"\bcoma\b", r"concentration", r"loss of sensation", r"paresthesia",
              r"focal weakness", r"involuntary movements", r"facial pain", r"symptoms of the face"]),
    "eyes": ("Do you have any problems with your eyes or vision?",
             "Does your child have any problems with their eyes or vision?",
             [r"\beyes?\b", r"eyelid", r"vision", r"blindness", r"lacrimation", r"cross-eyed"]),
    "ears": ("Do you have any problems with your ears or hearing?",
             "Does your child have any problems with their ears or hearing?",
             [r"\bears?\b", r"ear \(s\)", r"hearing"]),
    "nose": ("Do you have any problems with your nose or sinuses?",
             "Does your child have any problems with their nose or sinuses?",
             [r"\bnose\b", r"nosebleed", r"nasal", r"sinus", r"sneezing", r"coryza", r"smell"]),
    "mouth_throat": ("Do you have any problems with your mouth, teeth or throat?",
                     "Does your child have any problems with their mouth, teeth or throat?",
                     [r"mouth", r"throat", r"tongue", r"\blips?\b", r"\bgums?\b", r"tooth", r"swallowing",
                      r"hoarse", r"tonsils", r"taste", r"\bjaw\b"]),
    "chest_breathing": ("Do you have a cough, breathing problems or chest pain?",
                        "Does your child have a cough, breathing problems or chest pain?",
                        [r"breath", r"cough", r"sputum", r"wheezing", r"chest", r"hemoptysis", r"apnea", r"rib pain"]),
    "heart": ("Do you notice anything unusual with your heartbeat or circulation, like palpitations or swelling in your legs?",
              "Have you noticed anything unusual with your child's heartbeat or circulation, like a racing heart or swelling in their legs?",
              [r"heart rate", r"heartbeat", r"palpitations", r"circulation", r"cold hands and feet",
               r"swollen blood vessels", r"prominent veins", r"peripheral edema", r"fluid retention", r"chest pain"]),
    "digestion": ("Do you have stomach or digestion problems, like stomach pain, nausea, vomiting, diarrhea or constipation?",
                  "Does your child have stomach or digestion problems, like stomach pain, nausea, vomiting, diarrhea or constipation?",
                  [r"abdominal", r"abdomen", r"stomach", r"nausea", r"vomiting", r"diarrhea", r"constipation",
                   r"flatulence", r"heartburn", r"regurgitation", r"stool", r"rectal", r"anus", r"melena",
                   r"belly button", r"jaundice", r"liver", r"side pain", r"difficulty eating", r"spitting up"]),
    "urinary": ("Do you have any problems with urination, your bladder or kidneys?",
                "Does your child have any problems with peeing, their bladder or kidneys?",
                [r"\burin", r"bladder", r"kidney", r"hesitancy", r"bedwetting", r"suprapubic"]),
    "female": ("Do you have problems with periods, pregnancy, your breasts or the vaginal area?",
               "Does your child have any problems with their breasts or vaginal area, or with periods?",
               [r"menstrua", r"menopause", r"pregnancy", r"vaginal", r"vulvar", r"uterine", r"breast", r"nipple",
                r"postpartum", r"hot flashes", r"pelvic", r"infertility", r"intercourse", r"sex drive"]),
    "male": ("Do you have problems with your penis, testicles or prostate?",
             "Does your child have any problems with their penis or testicles?",
             [r"penis", r"penile", r"scrotum", r"testicles", r"testes", r"prostate", r"impotence",
              r"ejaculation", r"groin", r"infertility", r"intercourse", r"sex drive"]),
    "skin": ("Do you have any skin, hair or nail problems, like a rash, itching or spots?",
             "Does your child have any skin, hair or nail problems, like a rash, itching or spots?",
             [r"skin", r"rash", r"acne", r"blister", r"warts", r"moles", r"scalp", r"hair", r"nails", r"wrinkles",
              r"bruising", r"jaundice", r"flushing", r"crust ooze", r"silver like dusting", r"lymphedema"]),
    "back_neck": ("Do you have pain, stiffness or weakness in your back, neck or shoulders?",
                  "Does your child have pain, stiffness or weakness in their back, neck or shoulders?",
                  [r"\bback\b", r"\bneck\b", r"shoulder"]),
    "arms_hands": ("Do you have pain, swelling or weakness in your arms, elbows, wrists or hands?",
                   "Does your child have pain, swelling or weakness in their arms, elbows, wrists or hands?",
                   [r"\barm\b", r"\bhand\b", r"finger", r"wrist", r"elbow"]),
    "legs_feet": ("Do you have pain, swelling or weakness in your hips, legs, knees, ankles or feet?",
                  "Does your child have pain, swelling or weakness in their hips, legs, knees, ankles or feet?",
                  [r"\bhip\b", r"knee", r"\bleg\b", r"foot", r"\btoe\b", r"ankle", r"calf", r"bowlegged",
                   r"lower body pain", r"peripheral edema"]),
    "muscles_joints": ("Do you have aching or stiff muscles or joints in general?",
                       "Does your child have aching or stiff muscles or joints in general?",
                       [r"joint", r"muscle", r"bones", r"ache all over", r"stiffness all over", r"cramps and spasms",
                        r"problems with movement"]),
    "mind_sleep": ("Have you had problems with mood, anxiety, behaviour or sleep?",
                   "Has your child had problems with mood, anxiety, behaviour or sleep?",
                   [r"anxiety", r"depress", r"delusions", r"fears", r"anger", r"hostile", r"hysterical",
                    r"obsessions", r"antisocial", r"temper", r"emotional", r"irritability", r"insomnia",
                    r"nightmares", r"sleepiness", r"restlessness", r"self-esteem", r"premenstrual tension"]),
    "general": ("Do you have whole-body symptoms like fever, chills, tiredness, sweating or weight changes?",
                "Does your child have whole-body symptoms like fever, chills, tiredness, sweating or weight changes?",
                [r"fever", r"chills", r"fatigue", r"^weakness$", r"feeling ill", r"feeling hot", r"feeling cold",
                 r"sweating", r"weight", r"appetite", r"thirst", r"dehydration", r"flu-like", r"lymph nodes",
                 r"toxic look", r"sugar level", r"excessive growth", r"lack of growth", r"thyroid",
                 r"allergic reaction"]),
    "infant": ("Is this about a baby or young child?",
               "Is this about a baby or young child?",
               [r"infant", r"diaper", r"pulling at ears", r"bedwetting"]),
    "habits": ("Do you drink a lot of alcohol, smoke or use drugs?",
               "Does your child drink alcohol, smoke or use drugs?",
               [r"alcohol", r"drug abuse", r"smoking"]),
}


def build_areas(symptoms):
    """Returns {area id: (question, child question, [symptom indices])}, skipping areas with no symptoms."""
    out = {}
    for area, (question, child_question, patterns) in AREAS.items():
        idx = [i for i, s in enumerate(symptoms) if any(re.search(p, s) for p in patterns)]
        if idx:
            out[area] = (question, child_question, idx)
    return out


if __name__ == "__main__":
    import json, os
    vocab = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "vocab.json")))
    syms = vocab["symptoms"]
    areas = build_areas(syms)
    covered = set()
    for area, (q, cq, idx) in areas.items():
        covered |= set(idx)
        print(f"{area} ({len(idx)}): {[syms[i] for i in idx]}\n")
    print("not in any area:", [s for i, s in enumerate(syms) if i not in covered])
