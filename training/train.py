# %% [1] Setup: load the prepared data onto the GPU
import os, glob, json, math, time, shutil
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from tqdm.auto import tqdm

INPUT = os.environ.get("KAGGLE_INPUT", "/kaggle/input")
DATA = os.path.dirname(glob.glob(f"{INPUT}/**/dataset.npz", recursive=True)[0])
OUT = os.environ.get("KAGGLE_OUT", "/kaggle/working/model")
os.makedirs(OUT, exist_ok=True)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("device:", torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu")
print("data from:", DATA)
torch.manual_seed(0)
np.random.seed(0)

d = np.load(f"{DATA}/dataset.npz")
X = torch.from_numpy(d["X"]).to(device).bool()
y = torch.from_numpy(d["y"]).long().to(device)
train_idx, val_idx, test_idx = (torch.from_numpy(d[k]).long().to(device) for k in ("train_idx", "val_idx", "test_idx"))
source = d["source"]
vocab = json.load(open(f"{DATA}/vocab.json"))
stats = np.load(f"{DATA}/akinator_stats.npz")

S, D = X.shape[1], len(vocab["diseases"])
print(f"{X.shape[0]} patients | {S} symptoms | {D} diseases")
for name in np.unique(source):
    print(f"  {(source == name).sum():7d} from {name}")


# %% [2] Answer encoding and random "partial interview" sampling
# The network sees two flags per symptom: answered yes / answered no.
# Both 0 means "not asked yet", which is the normal state mid-interview.
def encode(yes, no):
    return torch.cat([yes, no], 1).float()

def sample_answers(x, min_yes_frac=0.2, max_no_frac=0.5, p_full=0.1, p_no_only=0.05):
    """Simulate a half-finished interview: reveal a random subset of the
    patient's symptoms as 'yes' (at least one) and a random subset of the
    symptoms they don't have as 'no'. A fraction of rows are fully answered,
    and a fraction have only 'no' answers (the start of a real interview)."""
    B = x.shape[0]
    p_yes = torch.empty(B, 1, device=x.device).uniform_(min_yes_frac, 1.0)
    yes = x & (torch.rand(B, S, device=x.device) < p_yes)
    yes.scatter_(1, torch.multinomial(x.float(), 1), True)
    p_no = torch.empty(B, 1, device=x.device).uniform_(0.0, max_no_frac)
    no = ~x & (torch.rand(B, S, device=x.device) < p_no)

    r = torch.rand(B, 1, device=x.device)
    full = r < p_full
    yes = torch.where(full, x, yes)
    no = torch.where(full, ~x, no)
    no_only = (r >= p_full) & (r < p_full + p_no_only)
    yes = yes & ~no_only
    return yes, no


# %% [3] Model
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

CFG = dict(
    hidden=1024, depth=3, dropout=0.3, weight_decay=1e-4, batch=1024, label_smoothing=0.05,
    balance=0.75,          # 0 = sample patients uniformly, 1 = every disease equally often
    lr=2e-3,               # peak learning rate, reached after warmup
    warmup_epochs=2,       # ramp the learning rate up from lr/10 over the first epochs
    max_epochs=int(os.environ.get("EPOCHS", 150)),  # safety cap; early stopping normally ends sooner
    plateau_patience=3,    # epochs without val improvement before the learning rate is cut
    plateau_factor=0.3,    # learning rate is multiplied by this on a plateau
    min_lr=1e-5,
    stop_patience=10,      # epochs without val improvement before training stops
    min_delta=1e-3,        # val loss must drop by at least this much to count as an improvement
)

model = SymptomNet(S, D, CFG["hidden"], CFG["depth"], CFG["dropout"]).to(device)
print(f"{sum(p.numel() for p in model.parameters()) / 1e6:.2f}M parameters")


# %% [4] Evaluation helpers
# Fixed interviews so scores are comparable between epochs. The train probe is
# a same-sized sample of training patients scored the same way as validation,
# so the gap between the two measures overfitting.
torch.manual_seed(123)
val_partial = sample_answers(X[val_idx])
probe_idx = train_idx[torch.randperm(len(train_idx), device=device)[:len(val_idx)]]
probe_partial = sample_answers(X[probe_idx])
torch.manual_seed(0)

@torch.no_grad()
def evaluate(idx, yes, no, bs=4096):
    """Returns (cross-entropy loss, top-1 accuracy, top-5 accuracy)."""
    model.eval()
    loss = top1 = top5 = 0.0
    for i in range(0, len(idx), bs):
        logits = model(encode(yes[i:i + bs], no[i:i + bs])).float()
        t = y[idx[i:i + bs]]
        loss += F.cross_entropy(logits, t, reduction="sum").item()
        k = logits.topk(min(5, D), 1).indices
        top1 += (k[:, 0] == t).sum().item()
        top5 += (k == t[:, None]).any(1).sum().item()
    return loss / len(idx), top1 / len(idx), top5 / len(idx)

def accuracy(idx, yes, no):
    _, top1, top5 = evaluate(idx, yes, no)
    return top1, top5


# %% [5] Train on the GPU
# Learning rate: short linear warmup, then cut by plateau_factor whenever the
# validation loss stops improving. Training stops once it hasn't improved for
# stop_patience epochs, and the best epoch's weights are restored.
# Validation loss (not accuracy) is the monitored value: it is smoother, and
# it also rises when the model gets over-confident, which matters because the
# Akinator stops asking based on the model's confidence.
opt = torch.optim.AdamW(model.parameters(), lr=CFG["lr"], weight_decay=CFG["weight_decay"])
steps_per_epoch = math.ceil(len(train_idx) / CFG["batch"])
warmup_steps = CFG["warmup_epochs"] * steps_per_epoch
plateau = torch.optim.lr_scheduler.ReduceLROnPlateau(
    opt, mode="min", factor=CFG["plateau_factor"], patience=CFG["plateau_patience"],
    threshold=CFG["min_delta"], threshold_mode="abs", min_lr=CFG["min_lr"])
use_amp = device.type == "cuda"
scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

# Diseases from the small datasets have ~5 patients vs hundreds for the big
# one, so draw rare diseases more often than their raw share.
train_counts = torch.bincount(y[train_idx], minlength=D).float()
sample_w = train_counts[y[train_idx]].pow(-CFG["balance"])

best_loss, best_acc, best_epoch, best_state = float("inf"), 0.0, 0, None
history = []
global_step = 0
stop_reason = f"reached max_epochs ({CFG['max_epochs']})"
for epoch in range(1, CFG["max_epochs"] + 1):
    model.train()
    t0, total_loss = time.time(), 0.0
    perm = train_idx[torch.multinomial(sample_w, len(train_idx), replacement=True)]
    bar = tqdm(range(0, len(perm), CFG["batch"]), desc=f"epoch {epoch}", leave=False, mininterval=1.0)
    for step, i in enumerate(bar):
        if global_step <= warmup_steps:
            for g in opt.param_groups:
                g["lr"] = CFG["lr"] * (0.1 + 0.9 * global_step / warmup_steps)
        b = perm[i:i + CFG["batch"]]
        yes, no = sample_answers(X[b])
        with torch.autocast(device.type, dtype=torch.float16, enabled=use_amp):
            loss = F.cross_entropy(model(encode(yes, no)), y[b], label_smoothing=CFG["label_smoothing"])
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.step(opt)
        scaler.update()
        global_step += 1
        total_loss += loss.item() * len(b)
        if step % 20 == 0:
            bar.set_postfix(loss=f"{loss.item():.4f}", lr=f"{opt.param_groups[0]['lr']:.2e}")
    bar.close()

    lr_now = opt.param_groups[0]["lr"]
    train_loss, train1, _ = evaluate(probe_idx, *probe_partial)
    val_loss, part1, part5 = evaluate(val_idx, *val_partial)
    xv = X[val_idx]
    full1, _ = accuracy(val_idx, xv, ~xv)
    if epoch > CFG["warmup_epochs"]:
        plateau.step(val_loss)

    improved = val_loss < best_loss - CFG["min_delta"]
    if improved:
        best_loss, best_acc, best_epoch = val_loss, part1, epoch
        best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    waited = epoch - best_epoch
    status = "* best" if improved else f"no improvement {waited}/{CFG['stop_patience']}"
    history.append(dict(epoch=epoch, lr=lr_now, train_loss=train_loss, val_loss=val_loss,
                        train_top1=train1, val_top1=part1, val_top5=part5, val_full_top1=full1))
    print(f"epoch {epoch:3d} | lr {lr_now:.1e} | loss train {train_loss:.3f} val {val_loss:.3f} "
          f"(gap {val_loss - train_loss:+.3f}) | top1 train {train1:.3f} val {part1:.3f} | "
          f"val top5 {part5:.3f} | val all-answers top1 {full1:.3f} | {time.time() - t0:.1f}s | "
          f"{status}", flush=True)

    if waited >= CFG["stop_patience"]:
        stop_reason = f"val loss hasn't improved for {waited} epochs"
        break

model.load_state_dict(best_state)
print(f"\nstopped after epoch {epoch}: {stop_reason}")
print(f"restored best epoch {best_epoch}: val loss {best_loss:.3f} | val partial top1 {best_acc:.3f}")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ep = [h["epoch"] for h in history]
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    axes[0].plot(ep, [h["train_loss"] for h in history], label="train")
    axes[0].plot(ep, [h["val_loss"] for h in history], label="val")
    axes[0].set_title("loss")
    axes[1].plot(ep, [h["train_top1"] for h in history], label="train")
    axes[1].plot(ep, [h["val_top1"] for h in history], label="val")
    axes[1].set_title("top-1 accuracy (partial interviews)")
    axes[2].plot(ep, [h["lr"] for h in history])
    axes[2].set_yscale("log")
    axes[2].set_title("learning rate")
    for ax in axes[:2]:
        ax.axvline(best_epoch, color="gray", linestyle="--", label="best epoch")
        ax.legend()
    for ax in axes:
        ax.set_xlabel("epoch")
    fig.tight_layout()
    fig.savefig(f"{OUT}/training_curves.png", dpi=110)
    plt.close(fig)
    print(f"saved {OUT}/training_curves.png")
except Exception as e:
    print("plot skipped:", e)


# %% [6] Test the full Akinator loop: model picks questions by information gain
# For each candidate symptom, use P(symptom | disease) to predict how the
# answer would reshape the model's current disease probabilities, and ask the
# question with the lowest expected entropy afterwards. The entropy terms are
# rearranged into matrix products so this runs batched on the GPU.
Psd = torch.from_numpy(stats["p_sym_given_dis"]).float().to(device).clamp(1e-4, 1 - 1e-4)
Psd_logPsd = Psd * Psd.log()
Qsd_logQsd = (1 - Psd) * (1 - Psd).log()

def expected_entropy(P):
    PlogP = P * P.clamp_min(1e-12).log()
    z_yes = (P @ Psd).clamp(1e-9, 1 - 1e-9)
    z_no = 1 - z_yes
    h_yes = -(PlogP @ Psd + P @ Psd_logPsd) / z_yes + z_yes.log()
    h_no = -(PlogP @ (1 - Psd) + P @ Qsd_logQsd) / z_no + z_no.log()
    return z_yes * h_yes + z_no * h_no

@torch.no_grad()
def simulate(idx, max_questions=35, threshold=0.85):
    """Same game as akinator_cli.py: start with no answers, ask yes/no
    questions answered truthfully from the patient's record, and stop once
    the model is confident (after at least one 'yes') or hits the limit."""
    model.eval()
    x = X[idx]
    B = len(idx)
    yes = torch.zeros_like(x)
    no = torch.zeros_like(x)
    asked = torch.zeros_like(x)
    done = torch.zeros(B, dtype=torch.bool, device=device)
    n_questions = torch.zeros(B, dtype=torch.long, device=device)
    final = torch.zeros(B, dtype=torch.long, device=device)
    final_top3 = torch.zeros(B, 3, dtype=torch.long, device=device)
    rows = torch.arange(B, device=device)

    for q in range(max_questions + 1):
        P = F.softmax(model(encode(yes, no)).float(), 1)
        conf, pred = P.max(1)
        stop = ~done & ((yes.any(1) & (conf >= threshold)) | (q == max_questions))
        final[stop], n_questions[stop] = pred[stop], q
        final_top3[stop] = P[stop].topk(min(3, D), 1).indices
        done |= stop
        if done.all():
            break
        s = expected_entropy(P).masked_fill(asked, float("inf")).argmin(1)
        ans = x[rows, s]
        active = rows[~done]
        asked[active, s[active]] = True
        yes[active, s[active]] = ans[active]
        no[active, s[active]] = ~ans[active]

    t = y[idx]
    return (final == t), (final_top3 == t[:, None]).any(1), n_questions

parts = [simulate(test_idx[i:i + 500])
         for i in tqdm(range(0, len(test_idx), 500), desc="simulating interviews")]
hit1, hit3, n_q = (torch.cat([p[k] for p in parts]).float().cpu().numpy() for k in range(3))
sim1, sim3, avg_q = float(hit1.mean()), float(hit3.mean()), float(n_q.mean())
test_y = y[test_idx].cpu().numpy()

def per_disease(hits, mask):
    """Average over diseases, so a disease with 100 copies of one row counts once."""
    return float(np.mean([hits[mask & (test_y == c)].mean() for c in np.unique(test_y[mask])]))

all_mask = np.ones(len(test_y), bool)
sim1_d, sim3_d = per_disease(hit1, all_mask), per_disease(hit3, all_mask)
print(f"Akinator simulation on all {len(test_idx)} test patients ({len(np.unique(test_y))} diseases): "
      f"top1 {sim1:.3f} | top3 {sim3:.3f} | avg questions {avg_q:.1f}")
print(f"  averaged per disease: top1 {sim1_d:.3f} | top3 {sim3_d:.3f}")
test_source = source[test_idx.cpu().numpy()]
for name in np.unique(test_source):
    m = test_source == name
    print(f"  {name}: {m.sum()} patients, {len(np.unique(test_y[m]))} diseases | "
          f"top1 {hit1[m].mean():.3f} (per disease {per_disease(hit1, m):.3f}) | "
          f"top3 {hit3[m].mean():.3f} (per disease {per_disease(hit3, m):.3f}) | "
          f"avg questions {n_q[m].mean():.1f}")

xt = X[test_idx]
test1, test5 = accuracy(test_idx, xt, ~xt)
print(f"test all-answers: top1 {test1:.3f} top5 {test5:.3f}")


# %% [7] Export weights + everything the app needs into /kaggle/working/model
config = {"n_symptoms": S, "n_diseases": D, "hidden": CFG["hidden"],
          "depth": CFG["depth"], "dropout": CFG["dropout"], "trained_without_yes": True}
torch.save({"state_dict": best_state, "config": config}, f"{OUT}/model.pt")
for f in ("vocab.json", "disease_info.json", "akinator_stats.npz"):
    shutil.copy(f"{DATA}/{f}", OUT)
with open(f"{OUT}/metrics.json", "w") as f:
    json.dump({"best_epoch": best_epoch, "stop_reason": stop_reason, "val_loss": best_loss,
               "val_partial_top1": best_acc, "test_top1": test1, "test_top5": test5,
               "sim_top1": sim1, "sim_top3": sim3, "sim_avg_questions": avg_q,
               "sim_top1_per_disease": sim1_d, "sim_top3_per_disease": sim3_d,
               "cfg": CFG, "history": history}, f, indent=1)

try:
    cpu_model = SymptomNet(S, D, CFG["hidden"], CFG["depth"], CFG["dropout"])
    cpu_model.load_state_dict(best_state)
    cpu_model.eval()
    torch.onnx.export(cpu_model, torch.zeros(1, 2 * S), f"{OUT}/model.onnx",
                      input_names=["answers"], output_names=["logits"],
                      dynamic_axes={"answers": {0: "batch"}, "logits": {0: "batch"}},
                      opset_version=17, dynamo=False)
except Exception as e:
    print("ONNX export skipped:", e)

print("saved:", sorted(os.listdir(OUT)))

zip_path = shutil.make_archive(os.path.join(os.path.dirname(OUT), "model"), "zip", OUT)
print(f"zipped for download: {zip_path} ({os.path.getsize(zip_path) / 1e6:.1f} MB)")
