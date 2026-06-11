"""Builds analysis.ipynb from cell definitions. Run once, then the .ipynb can be
edited/run in Jupyter. Kept in repo so the notebook is reproducible from source."""
import json
import os

cells = []

def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.splitlines(keepends=True)})

def code(text):
    cells.append({
        "cell_type": "code", "metadata": {}, "execution_count": None,
        "outputs": [], "source": text.splitlines(keepends=True),
    })

# ----------------------------------------------------------------------------
md(r"""# Gaze–Hand Text Entry — Analysis

**Team 4 · CS523 · From Late to Early: Gaze–Hand Coordination Errors Through Interaction Learning**

This notebook analyses the data exported by the web prototype. For every
**experiment session** it computes:

* **WPM** (words per minute) and **errors per phrase / accuracy**
* **Early-trigger** vs **late-trigger** coordination errors
* Supporting gaze/hand dynamics for the RQs: **trigger offset**, **fixation
  duration**, **corrective saccades**

and tracks how these change across **Day 1 → Day 2 → Day 3** (the learning
contrast) and how error patterns relate to performance (RQ3).

---
### Data layout this notebook expects
Each day's ZIP unpacks to a run folder:
```
data/<participant>/day_<d>/
├── demographics.json
├── calibration.json
├── experiment_config.json
├── day_summary.csv            # one row per trial (target, typed, CER, duration…)
├── keyboard_layout.csv        # key centres + hit half-extents (viewport px)
├── practice_1/   trial_001_events.csv …   (excluded from analysis)
└── experiment_1/ trial_001_events.csv …   (per-trial unified event log)
```
The **event log** (one CSV per trial) is the substrate for the trigger analysis.
Key `event_type` values:

| event_type        | what it is |
|-------------------|-----------|
| `gaze_sample`     | a continuous gaze reading (`gaze_x/y`, `hovered_key`, `target_char`, `target_key_x/y`) |
| `selection_down`  | Space pressed — a letter is committed; `selected_character` = key under gaze, `target_char` = intended letter |
| `selection_up`    | Space released |
| `trial_start` / `trial_end` | trial boundaries |

> **No correction is allowed in the task** — typed errors are preserved, which is
> exactly what lets us read off coordination errors.
""")

# ----------------------------------------------------------------------------
md(r"""## 0. Setup & configuration

Run this once. If the scientific libraries are missing, uncomment the install line.""")

code(r"""# !pip install pandas numpy matplotlib scipy

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

pd.set_option("display.max_columns", 60)
pd.set_option("display.width", 160)
""")

code(r'''# ============================ CONFIG ============================
# Point DATA_ROOT at the folder that CONTAINS the per-participant folders
# (e.g. data/P01/day_1/...). This notebook lives in analysis/, while the data
# folder sits at the repo root, so we resolve it relative to the repo using
# paths only — no absolute/machine-specific paths — so it works on any machine
# after a fresh git clone. We search recursively for day_summary.csv, so any
# folder with the runs somewhere underneath works. You can also just hard-set
# DATA_ROOT to any path if your data lives elsewhere.
def _find_data_root():
    here = Path.cwd()
    candidates = [
        here.parent / "data",                  # running from analysis/ (default)
        here / "data",                         # running from repo root
        here / "analysis" / "data",
    ]
    for c in candidates:
        if c.exists() and any(c.rglob("day_summary.csv")):
            return c
    return here.parent / "data"

DATA_ROOT = _find_data_root()

# Where aggregated CSVs + figures are written. Anchored to the repo (next to
# DATA_ROOT) so output always lands in analysis/analysis_output regardless of
# the current working directory the notebook is run from.
OUT_DIR = DATA_ROOT.parent / "analysis" / "analysis_output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Which sessions to analyse. Practice / warm-up is excluded per the protocol.
ANALYSE_SESSION_TYPES = ("experiment",)

# ---- WPM ----
# Standard text-entry WPM = (|typed| - 1) / 5 * (60 / seconds).
# "seconds" is measured from the FIRST committed keystroke to the LAST one
# (MacKenzie & Soukoreff convention). CHARS_PER_WORD is fixed at 5 by definition.
CHARS_PER_WORD = 5

# ---- Early/late trigger classifier (see the long markdown below) ----
# Tolerance band (ms) around a trigger within which a selection is treated as
# "on-time" rather than early/late, for the CONTINUOUS offset measure.
ON_TIME_TOL_MS = 80

# Max look-back / look-ahead (ms) when searching the gaze stream for the moment
# the eye was on the target key, relative to a trigger.
GAZE_SEARCH_BEFORE_MS = 1500
GAZE_SEARCH_AFTER_MS = 800

# ---- Fixation detection (I-DT dispersion) ----
FIX_DISPERSION_PX = 60      # max spread of a fixation cluster (viewport px)
FIX_MIN_DURATION_MS = 80    # minimum fixation duration

print("DATA_ROOT:", DATA_ROOT.resolve())
''')

# ----------------------------------------------------------------------------
md(r"""## 1. Load all runs

We walk the tree, find every `day_summary.csv`, and load:
* the **trial summary** rows (target/typed/CER/duration), and
* the matching **event-log CSV** for each trial.

Everything is tagged with `participant_id` and `day` so the Day 1→3 contrast is
a simple group-by later.""")

code(r'''def _load_json(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}

def discover_runs(root: Path):
    """Yield (run_dir, day_summary_df, config_dict, demographics_dict) per run."""
    summaries = sorted(root.rglob("day_summary.csv"))
    if not summaries:
        print(f"!! No day_summary.csv found under {root.resolve()} — check DATA_ROOT.")
    for sp in summaries:
        run_dir = sp.parent
        df = pd.read_csv(sp)
        cfg = _load_json(run_dir / "experiment_config.json")
        demo = _load_json(run_dir / "demographics.json")
        yield run_dir, df, cfg, demo

runs = list(discover_runs(DATA_ROOT))
print(f"Found {len(runs)} run(s).")
for run_dir, df, cfg, demo in runs:
    pid = df["participant_id"].iloc[0] if len(df) else demo.get("participant_id", "?")
    day = df["day"].iloc[0] if len(df) else demo.get("day", "?")
    n_exp = (df["session_type"] == "experiment").sum()
    print(f"  {run_dir}  |  participant={pid} day={day}  |  {len(df)} trials ({n_exp} experiment)")
''')

code(r'''# Build the master trial table (one row per trial, all runs concatenated).
trial_frames = []
for run_dir, df, cfg, demo in runs:
    d = df.copy()
    d["run_dir"] = str(run_dir)
    d["participant_id"] = d["participant_id"].astype(str)
    d["day"] = d["day"].astype(str)
    trial_frames.append(d)

trials = pd.concat(trial_frames, ignore_index=True) if trial_frames else pd.DataFrame()
print(f"Total trials loaded: {len(trials)}")
if len(trials):
    display(trials.head())
''')

code(r'''# Restrict to the sessions we analyse (experiment only; practice excluded).
analysis_trials = trials[trials["session_type"].isin(ANALYSE_SESSION_TYPES)].copy()
print(f"Trials kept for analysis: {len(analysis_trials)} "
      f"(excluded {len(trials) - len(analysis_trials)} practice/warm-up).")
''')

# ----------------------------------------------------------------------------
md(r"""## 2. Per-trial performance: WPM & error per phrase

* **`typed`/`target`** drive accuracy. `error_count` is the Levenshtein distance
  (already computed by the app); `character_error_rate` = errors / target length.
* **WPM** uses the keystroke span from the event log (first → last commit). If
  that is unavailable we fall back to the trial `duration_ms`.
* **errors per phrase** = `error_count` (each trial is one phrase/word).""")

code(r'''def load_event_log(run_dir: Path, event_log_file: str) -> pd.DataFrame:
    p = Path(run_dir) / event_log_file
    if not p.exists():
        return pd.DataFrame()
    return pd.read_csv(p)

# Cache event logs so we read each CSV once.
_event_cache: dict = {}
def get_events(row) -> pd.DataFrame:
    key = (row["run_dir"], row["event_log_file"])
    if key not in _event_cache:
        _event_cache[key] = load_event_log(Path(row["run_dir"]), row["event_log_file"])
    return _event_cache[key]


def keystroke_span_seconds(ev: pd.DataFrame):
    """Seconds from first to last committed selection_down (a letter entered)."""
    if ev.empty:
        return None
    sd = ev[(ev["event_type"] == "selection_down") & ev["selected_character"].notna()]
    if len(sd) < 2:
        return None
    t = sd["timestamp"].to_numpy(dtype=float)
    return (t.max() - t.min()) / 1000.0


def compute_wpm(typed: str, span_s, duration_ms):
    typed = "" if (isinstance(typed, float) and math.isnan(typed)) else str(typed)
    n = len(typed)
    if n < 1:
        return np.nan
    # MacKenzie WPM: (|T| - 1) / 5 over the entry time, scaled to 60 s.
    if span_s and span_s > 0:
        secs = span_s
    elif duration_ms and duration_ms > 0:
        secs = duration_ms / 1000.0
    else:
        return np.nan
    return ((n - 1) / CHARS_PER_WORD) * (60.0 / secs)


rows = []
for _, r in analysis_trials.iterrows():
    ev = get_events(r)
    span = keystroke_span_seconds(ev)
    wpm = compute_wpm(r.get("typed_text", ""), span, r.get("duration_ms"))
    rows.append({"wpm": wpm, "entry_seconds": span})

perf = pd.concat([analysis_trials.reset_index(drop=True), pd.DataFrame(rows)], axis=1)
perf["accuracy"] = 1.0 - perf["character_error_rate"].astype(float)
perf["errors_per_phrase"] = perf["error_count"].astype(float)
display(perf[["participant_id", "day", "session_label", "target_word", "typed_text",
              "wpm", "entry_seconds", "error_count", "character_error_rate", "accuracy"]].head(12))
''')

# ----------------------------------------------------------------------------
md(r"""## 3. Early- vs late-trigger classification

### Definitions (from the proposal)
* **Late trigger** — the hand fires *after* the eye has already left the intended
  key (gaze "moved to the next target"). The user looked at the right key, then
  the gaze moved on, and the late pinch lands on a later key.
* **Early trigger** — the hand fires *before* the eye has reached the intended
  key. The pinch lands on a key the gaze is still passing through / hasn't left.

### How we read this off the log
For each `selection_down` event (a committed letter) we know:
* `target_char` — the intended letter, and `target_key_x/y` — its key centre;
* `selected_character` — what was actually entered (the key under gaze at the press);
* the full `gaze_sample` stream, each tagged with `hovered_key` (the key under gaze).

We look at the gaze stream in a window around the trigger and ask **when the eye
was on the target key** relative to the trigger time `t_sel`:

| condition | label |
|-----------|-------|
| eye reached the target key **before** `t_sel` and had **left** it by `t_sel` | **late** |
| eye had **not** reached the target key by `t_sel` (reaches it only after, or not at all) | **early** |
| eye is **on** the target key at `t_sel` | **on-time** |

We report classification two ways:
1. **Among error selections only** (`selected_character != target_char`) → the
   late/early split that RQ1 asks about.
2. A **continuous trigger offset** `t_sel − t_on_target` for *every* selection
   (negative = early, positive = late) → RQ2's hand-trigger timing.

> ⚠️ This is an operational definition built from `hovered_key`. The
> `HOVER_DWELL_MS`/key geometry and the search-window constants above shape it —
> tune them with the team and re-run. Everything downstream reads from the
> `selections` table this section produces.""")

code(r'''def classify_selection(ev: pd.DataFrame, sel_row, prev_sel_t, next_sel_t):
    """Classify one selection_down using the gaze stream `ev` (whole trial).

    Returns dict with: error(bool), label(early/late/on_time/no_target_fix),
    offset_ms (signed; <0 early, >0 late), dist_px (gaze-to-target at trigger).
    """
    t_sel = float(sel_row["timestamp"])
    target = sel_row.get("target_char")
    selected = sel_row.get("selected_character")
    is_error = (pd.notna(target)) and (str(selected) != str(target))

    gz = ev[ev["event_type"] == "gaze_sample"].copy()
    # Window: bounded by neighbouring selections, then clipped to a max span so a
    # long pause before the trial doesn't leak in.
    lo = max(prev_sel_t if prev_sel_t is not None else t_sel - GAZE_SEARCH_BEFORE_MS,
             t_sel - GAZE_SEARCH_BEFORE_MS)
    hi = min(next_sel_t if next_sel_t is not None else t_sel + GAZE_SEARCH_AFTER_MS,
             t_sel + GAZE_SEARCH_AFTER_MS)
    gz = gz[(gz["timestamp"] >= lo) & (gz["timestamp"] <= hi)]

    # Distance from gaze to the target key at the trigger (spatial sanity signal).
    dist_px = np.nan
    if pd.notna(sel_row.get("gaze_x")) and pd.notna(sel_row.get("target_key_x")):
        dist_px = math.hypot(float(sel_row["gaze_x"]) - float(sel_row["target_key_x"]),
                             float(sel_row["gaze_y"]) - float(sel_row["target_key_y"]))

    if pd.isna(target) or gz.empty:
        return {"is_error": bool(is_error), "label": "no_target_fix",
                "offset_ms": np.nan, "dist_px": dist_px}

    on_t = gz[gz["hovered_key"].astype("object") == target]["timestamp"].to_numpy(dtype=float)

    if on_t.size == 0:
        # Eye never on the target in the window. If a wrong key was committed the
        # eye was passing through something else -> treat as early (hand led eye).
        return {"is_error": bool(is_error), "label": "early",
                "offset_ms": np.nan, "dist_px": dist_px}

    t_enter, t_leave = on_t.min(), on_t.max()

    # Where is the trigger relative to the on-target dwell?
    if t_sel < t_enter - ON_TIME_TOL_MS:
        label, offset = "early", t_sel - t_enter           # negative
    elif t_sel > t_leave + ON_TIME_TOL_MS:
        label, offset = "late", t_sel - t_leave            # positive
    else:
        label, offset = "on_time", 0.0
    return {"is_error": bool(is_error), "label": label,
            "offset_ms": float(offset), "dist_px": dist_px}


sel_records = []
for _, r in analysis_trials.iterrows():
    ev = get_events(r)
    if ev.empty:
        continue
    sels = ev[(ev["event_type"] == "selection_down") & ev["selected_character"].notna()]
    sels = sels.sort_values("timestamp").reset_index(drop=True)
    sel_t = sels["timestamp"].to_numpy(dtype=float)
    for i, (_, s) in enumerate(sels.iterrows()):
        prev_t = sel_t[i - 1] if i > 0 else None
        next_t = sel_t[i + 1] if i + 1 < len(sel_t) else None
        c = classify_selection(ev, s, prev_t, next_t)
        sel_records.append({
            "participant_id": r["participant_id"], "day": r["day"],
            "session_label": r["session_label"], "trial_id": r["trial_id"],
            "input_index": s.get("input_index"),
            "target_char": s.get("target_char"), "selected_character": s.get("selected_character"),
            **c,
        })

selections = pd.DataFrame(sel_records)
print(f"Total committed selections analysed: {len(selections)}")
if len(selections):
    print(selections["label"].value_counts())
    display(selections.head(12))
''')

code(r'''# Error-only late/early split (RQ1).
errors = selections[selections["is_error"]].copy()
print(f"Error selections: {len(errors)} of {len(selections)} "
      f"({100*len(errors)/max(len(selections),1):.1f}%)")
if len(errors):
    print("\nError-trigger type counts:")
    print(errors["label"].value_counts())
''')

# ----------------------------------------------------------------------------
md(r"""## 4. Fixation duration & corrective saccades (RQ2)

* **Fixation duration** — a dispersion-based (I-DT) detector groups consecutive
  gaze samples whose spread stays under `FIX_DISPERSION_PX` for at least
  `FIX_MIN_DURATION_MS`. We report the mean fixation duration per session.
* **Corrective saccades (proxy)** — per committed letter, how many times the
  gaze *re-enters* the target key after first leaving it before the commit. A
  clean, confident selection has 0; hunting/correcting raises it.

Both are approximate (webcam gaze is noisy) — treat as proxies and tune the
thresholds with the team.""")

code(r'''def detect_fixations(gz: pd.DataFrame):
    """I-DT dispersion fixation detector. Returns list of durations (ms)."""
    g = gz.dropna(subset=["gaze_x", "gaze_y"]).sort_values("timestamp")
    xs = g["gaze_x"].to_numpy(dtype=float)
    ys = g["gaze_y"].to_numpy(dtype=float)
    ts = g["timestamp"].to_numpy(dtype=float)
    n = len(ts)
    durations = []
    i = 0
    while i < n:
        j = i + 1
        while j < n:
            disp = (xs[i:j+1].max() - xs[i:j+1].min()) + (ys[i:j+1].max() - ys[i:j+1].min())
            if disp > FIX_DISPERSION_PX:
                break
            j += 1
        dur = ts[j-1] - ts[i]
        if dur >= FIX_MIN_DURATION_MS and (j - i) >= 2:
            durations.append(dur)
            i = j
        else:
            i += 1
    return durations


def corrective_saccades_for_trial(ev: pd.DataFrame):
    """Per committed letter, count re-entries to the target key before commit."""
    gz = ev[ev["event_type"] == "gaze_sample"].sort_values("timestamp")
    sels = ev[(ev["event_type"] == "selection_down") & ev["selected_character"].notna()]
    sels = sels.sort_values("timestamp")
    sel_t = sels["timestamp"].to_numpy(dtype=float)
    counts = []
    for i, (_, s) in enumerate(sels.iterrows()):
        t_sel = float(s["timestamp"])
        lo = sel_t[i-1] if i > 0 else (t_sel - GAZE_SEARCH_BEFORE_MS)
        seg = gz[(gz["timestamp"] >= lo) & (gz["timestamp"] <= t_sel)]
        target = s.get("target_char")
        if pd.isna(target) or seg.empty:
            continue
        on = (seg["hovered_key"].astype("object") == target).to_numpy()
        # number of rising edges (off->on) beyond the first arrival = re-entries
        entries = int(np.sum((~on[:-1]) & on[1:])) if on.size > 1 else int(on[:1].sum())
        counts.append(max(entries - 1, 0))
    return counts


fix_records = []
for _, r in analysis_trials.iterrows():
    ev = get_events(r)
    if ev.empty:
        continue
    gz = ev[ev["event_type"] == "gaze_sample"]
    durs = detect_fixations(gz)
    corr = corrective_saccades_for_trial(ev)
    fix_records.append({
        "participant_id": r["participant_id"], "day": r["day"],
        "session_label": r["session_label"], "trial_id": r["trial_id"],
        "mean_fixation_ms": np.mean(durs) if durs else np.nan,
        "n_fixations": len(durs),
        "mean_corrective_saccades": np.mean(corr) if corr else np.nan,
    })

trial_gaze = pd.DataFrame(fix_records)
if len(trial_gaze):
    display(trial_gaze.head())
''')

# ----------------------------------------------------------------------------
md(r"""## 5. Aggregate per session & per day

Roll everything up to **(participant, day, session)** and **(participant, day)**.
The per-day table is what drives the learning-curve figures and RQ3 correlations.""")

code(r'''# --- selection-derived rates per (participant, day, session) ---
# Built with an explicit loop (rather than groupby.apply) so it behaves the same
# across pandas versions and never operates on the grouping columns.
def sel_rates(g):
    n = len(g)
    n_err = int(g["is_error"].sum())
    n_late = int(((g["label"] == "late") & g["is_error"]).sum())
    n_early = int(((g["label"] == "early") & g["is_error"]).sum())
    return {
        "n_selections": n,
        "n_errors": n_err,
        "error_rate_per_keystroke": n_err / n if n else np.nan,
        "n_late_err": n_late,
        "n_early_err": n_early,
        "late_share_of_err": n_late / n_err if n_err else np.nan,
        "early_share_of_err": n_early / n_err if n_err else np.nan,
        "mean_trigger_offset_ms": g["offset_ms"].mean(skipna=True),
        "median_trigger_offset_ms": g["offset_ms"].median(skipna=True),
    }

if len(selections):
    _recs = []
    for (pid, day, sl), g in selections.groupby(["participant_id", "day", "session_label"]):
        _recs.append({"participant_id": pid, "day": day, "session_label": sl, **sel_rates(g)})
    sel_by_session = pd.DataFrame(_recs)
else:
    sel_by_session = pd.DataFrame()

# --- performance per (participant, day, session) ---
perf_by_session = (perf.groupby(["participant_id", "day", "session_label"])
                   .agg(mean_wpm=("wpm", "mean"),
                        mean_errors_per_phrase=("errors_per_phrase", "mean"),
                        mean_cer=("character_error_rate", "mean"),
                        mean_accuracy=("accuracy", "mean"),
                        n_trials=("trial_id", "count"))
                   .reset_index())

# --- gaze dynamics per session ---
gaze_by_session = (trial_gaze.groupby(["participant_id", "day", "session_label"])
                   .agg(mean_fixation_ms=("mean_fixation_ms", "mean"),
                        mean_corrective_saccades=("mean_corrective_saccades", "mean"))
                   .reset_index()) if len(trial_gaze) else pd.DataFrame()

session_metrics = perf_by_session
for extra in (sel_by_session, gaze_by_session):
    if len(extra):
        session_metrics = session_metrics.merge(
            extra, on=["participant_id", "day", "session_label"], how="left")

session_metrics = session_metrics.sort_values(["participant_id", "day", "session_label"])
display(session_metrics)
''')

code(r'''# --- per (participant, day): the learning-contrast unit ---
agg_cols = {c: "mean" for c in session_metrics.columns
            if c not in ("participant_id", "day", "session_label", "n_trials", "n_selections",
                          "n_errors", "n_late_err", "n_early_err")}
day_metrics = (session_metrics.groupby(["participant_id", "day"])
               .agg(agg_cols).reset_index()
               .sort_values(["participant_id", "day"]))
display(day_metrics)

# Group means across participants, by day (for the headline learning curves).
by_day = day_metrics.groupby("day").mean(numeric_only=True).reset_index()
display(by_day)
''')

# ----------------------------------------------------------------------------
md(r"""## 6. Figures — learning curves & error-pattern shift

* **WPM / accuracy / error rate** vs day — per participant (thin) + mean (bold).
* **Early vs late share** of errors by day — the RQ1 headline.""")

code(r'''def learning_curve(metric, ylabel, ax):
    for pid, g in day_metrics.groupby("participant_id"):
        g = g.sort_values("day")
        ax.plot(g["day"], g[metric], marker="o", alpha=0.35, linewidth=1)
    m = day_metrics.groupby("day")[metric].mean()
    ax.plot(m.index, m.values, marker="o", color="black", linewidth=2.5, label="mean")
    ax.set_xlabel("Day"); ax.set_ylabel(ylabel); ax.set_title(ylabel + " by day")
    ax.legend()

curves = [("mean_wpm", "WPM"),
          ("mean_accuracy", "Accuracy"),
          ("mean_errors_per_phrase", "Errors per phrase")]
curves = [(m, l) for m, l in curves if m in day_metrics.columns]
if curves and len(day_metrics):
    fig, axes = plt.subplots(1, len(curves), figsize=(5 * len(curves), 4))
    if len(curves) == 1:
        axes = [axes]
    for (m, l), ax in zip(curves, axes):
        learning_curve(m, l, ax)
    plt.tight_layout(); plt.savefig(OUT_DIR / "learning_curves.png", dpi=150); plt.show()
else:
    print("Not enough data for learning curves yet.")
''')

code(r'''# Early vs late share of errors, by day (stacked).
if len(day_metrics) and "late_share_of_err" in day_metrics.columns:
    md_ = day_metrics.groupby("day")[["early_share_of_err", "late_share_of_err"]].mean()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar(md_.index, md_["early_share_of_err"], label="early", color="#ef8a62")
    ax.bar(md_.index, md_["late_share_of_err"], bottom=md_["early_share_of_err"],
           label="late", color="#67a9cf")
    ax.set_xlabel("Day"); ax.set_ylabel("Share of error selections")
    ax.set_title("Early- vs late-trigger error share by day (RQ1)")
    ax.legend(); plt.tight_layout()
    plt.savefig(OUT_DIR / "early_late_by_day.png", dpi=150); plt.show()

    # Trigger-offset distribution by day (RQ2).
    # The vast majority of selections are ON-TIME and are recorded with an exact
    # offset of 0 (a sentinel, not a measured value). Mixing those zeros into the
    # histogram produces a single giant spike at 0 that hides the actual early/
    # late timing. So we plot the distribution of GENUINE early/late offsets only
    # (offset != 0) and report the on-time fraction separately in the title.
    off = selections.dropna(subset=["offset_ms"])
    nz = off[off["offset_ms"] != 0]
    n_total = len(off)
    n_ontime = int((off["offset_ms"] == 0).sum())
    fig, ax = plt.subplots(figsize=(7, 4))
    if len(nz):
        # Shared bins across days so the per-day overlays are comparable.
        lo, hi = nz["offset_ms"].min(), nz["offset_ms"].max()
        bins = np.linspace(lo, hi, 25)
        for day, g in nz.groupby("day"):
            ax.hist(g["offset_ms"], bins=bins, alpha=0.45,
                    label=f"day {day} (n={len(g)})")
    ax.axvline(0, color="k", lw=1)
    # Direction hints as small gray text under the axis instead of a long xlabel.
    ax.text(0.0, -0.16, "← early", transform=ax.transAxes,
            ha="left", va="top", fontsize=8, color="gray")
    ax.text(1.0, -0.16, "late →", transform=ax.transAxes,
            ha="right", va="top", fontsize=8, color="gray")
    ax.set_xlabel("trigger offset (ms)")
    ax.set_ylabel("count")
    on_time_pct = 100 * n_ontime / max(n_total, 1)
    ax.set_title(f"Early/late trigger offset by day (RQ2)\n"
                 f"on-time excluded: {n_ontime}/{n_total} selections ({on_time_pct:.0f}%)")
    ax.legend(); plt.tight_layout()
    plt.savefig(OUT_DIR / "trigger_offset_by_day.png", dpi=150); plt.show()
else:
    print("Not enough data for error-pattern figures yet.")
''')

# ----------------------------------------------------------------------------
md(r"""## 7. RQ3 — do error patterns track performance?

Across the (participant, day) points, relate the **late/early error share** and
**trigger offset** to **WPM** and **accuracy**. With few points this is
descriptive (Pearson *r* shown as a guide, not a significance claim).""")

code(r'''def safe_corr(df, a, b):
    s = df[[a, b]].dropna()
    if len(s) < 3:
        return np.nan, len(s)
    return s[a].corr(s[b]), len(s)

pairs = [("late_share_of_err", "mean_wpm"),
         ("late_share_of_err", "mean_accuracy"),
         ("early_share_of_err", "mean_wpm"),
         ("early_share_of_err", "mean_accuracy"),
         ("mean_trigger_offset_ms", "mean_wpm"),
         ("error_rate_per_keystroke", "mean_wpm")]
pairs = [(a, b) for a, b in pairs
         if a in day_metrics.columns and b in day_metrics.columns]

print("Pearson r across (participant, day) points:")
for a, b in pairs:
    r, n = safe_corr(day_metrics, a, b)
    print(f"  {a:28s} vs {b:16s}  r = {r:.3f}  (n={n})")

if pairs and len(day_metrics) >= 3:
    fig, axes = plt.subplots(1, min(3, len(pairs)),
                             figsize=(5 * min(3, len(pairs)), 4))
    if min(3, len(pairs)) == 1:
        axes = [axes]
    for (a, b), ax in zip(pairs[:3], axes):
        s = day_metrics[[a, b]].dropna()
        ax.scatter(s[a], s[b])
        ax.set_xlabel(a); ax.set_ylabel(b)
    plt.tight_layout(); plt.savefig(OUT_DIR / "rq3_scatter.png", dpi=150); plt.show()
''')

# ----------------------------------------------------------------------------
md(r"""## 8. Export aggregated tables

Saved under `analysis_output/` for the report.""")

code(r'''if len(perf):
    perf.to_csv(OUT_DIR / "trial_performance.csv", index=False)
if len(selections):
    selections.to_csv(OUT_DIR / "selection_events.csv", index=False)
if len(session_metrics):
    session_metrics.to_csv(OUT_DIR / "session_metrics.csv", index=False)
if len(day_metrics):
    day_metrics.to_csv(OUT_DIR / "day_metrics.csv", index=False)

print("Wrote to", OUT_DIR.resolve())
for f in sorted(OUT_DIR.glob("*")):
    print("  ", f.name)
''')

# ----------------------------------------------------------------------------
notebook = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.x"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

out = os.path.join(os.path.dirname(__file__), "analysis.ipynb")
with open(out, "w") as f:
    json.dump(notebook, f, indent=1)
print("wrote", out, "with", len(cells), "cells")
