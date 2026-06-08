"""Generate a tiny synthetic dataset matching the app's export schema, so we can
smoke-test analysis.ipynb without real participants. Writes to data_fake/."""
import csv
import json
import random
from pathlib import Path

random.seed(0)
ROOT = Path("data_fake")

EVENT_COLS = ["timestamp","participant_id","day","session_type","session_index",
    "session_label","trial_id","target_word","event_type","gaze_x","gaze_y",
    "left_eye_x","left_eye_y","right_eye_x","right_eye_y","hovered_key",
    "target_char","target_key_x","target_key_y","physical_key","selected_character",
    "input_index","typed_text_so_far","key_down_time","key_up_time","key_hold_ms"]
SUMMARY_COLS = ["participant_id","day","session_type","session_index","session_label",
    "trial_id","target_word","typed_text","start_time","end_time","duration_ms",
    "num_characters_typed","target_length","error_count","character_error_rate",
    "event_log_file"]

# crude key centres for letters we use
KEYPOS = {c: (100 + i*60, 300) for i, c in enumerate("abcdefghijklmnopqrstuvwxyz ")}

def levenshtein(a, b):
    m, n = len(a), len(b)
    d = list(range(n+1))
    for i in range(1, m+1):
        prev, d[0] = d[0], i
        for j in range(1, n+1):
            cur = d[j]
            d[j] = min(d[j]+1, d[j-1]+1, prev + (a[i-1] != b[j-1]))
            prev = cur
    return d[n]

def emit_row(**kw):
    return {c: kw.get(c, "") for c in EVENT_COLS}

def gen_trial(pid, day, sess_label, sess_idx, trial_idx, target, t0, trigger_mode):
    """trigger_mode in {'on','early','late'} biases gaze timing vs trigger."""
    rows = []
    ctx = dict(participant_id=pid, day=day, session_type="experiment",
               session_index=sess_idx, session_label=sess_label,
               trial_id=f"trial_{trial_idx:03d}", target_word=target)
    t = t0
    rows.append(emit_row(timestamp=t, event_type="trial_start", **ctx))
    typed = ""
    input_index = 0
    for ch in target:
        tx, ty = KEYPOS.get(ch, (0, 0))
        # gaze approaches the target key over ~5 samples
        for k in range(5):
            t += 30
            gx = tx + (50 if k < 2 else random.uniform(-15, 15))
            gy = ty + random.uniform(-15, 15)
            hov = ch if k >= 2 else random.choice(list("abcdef"))
            rows.append(emit_row(timestamp=t, event_type="gaze_sample",
                gaze_x=round(gx,1), gaze_y=round(gy,1), hovered_key=hov,
                target_char=ch, target_key_x=tx, target_key_y=ty, **ctx))
        # decide trigger timing
        t += 40
        if trigger_mode == "early":
            sel = random.choice(list("abcdef"))   # wrong, eye not yet there
        elif trigger_mode == "late":
            # add post-target gaze drift then trigger -> selected wrong (next-ish)
            for k in range(3):
                t += 30
                rows.append(emit_row(timestamp=t, event_type="gaze_sample",
                    gaze_x=tx+80, gaze_y=ty, hovered_key=random.choice(list("ghij")),
                    target_char=ch, target_key_x=tx, target_key_y=ty, **ctx))
            sel = random.choice(list("ghij"))
        else:
            sel = ch
        input_index += 1
        typed += sel
        tx2, ty2 = KEYPOS.get(sel, (0, 0))
        dn = t
        rows.append(emit_row(timestamp=dn, event_type="selection_down",
            gaze_x=tx2, gaze_y=ty2, hovered_key=sel, target_char=ch,
            target_key_x=tx, target_key_y=ty, physical_key="Space",
            selected_character=sel, input_index=input_index,
            typed_text_so_far=typed, key_down_time=dn, **ctx))
        up = dn + 70
        rows.append(emit_row(timestamp=up, event_type="selection_up",
            physical_key="Space", selected_character=sel, input_index=input_index,
            typed_text_so_far=typed, key_down_time=dn, key_up_time=up, key_hold_ms=70,
            target_char=ch, **ctx))
        t = up
    t += 20
    rows.append(emit_row(timestamp=t, event_type="trial_end", **ctx))
    summary = dict(ctx, typed_text=typed, start_time=t0, end_time=t, duration_ms=t-t0,
        num_characters_typed=len(typed), target_length=len(target),
        error_count=levenshtein(target, typed),
        character_error_rate=round(levenshtein(target, typed)/max(len(target),1),3),
        event_log_file=f"{sess_label}/trial_{trial_idx:03d}_events.csv")
    return rows, summary

def write_csv(path, cols, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)

targets = ["alert", "learn", "stone", "stare"]
for pid in ["P01", "P02"]:
    for day in ["1", "2", "3"]:
        run = ROOT / pid / f"day_{day}"
        summaries = []
        # learning: more 'late' on day1, more 'on' by day3
        modes_by_day = {"1": ["late","late","early","on"],
                        "2": ["late","on","early","on"],
                        "3": ["on","on","late","on"]}
        # one practice + one experiment session
        for sess_label, sess_idx, stype in [("practice_1",1,"practice"),("experiment_1",1,"experiment")]:
            t0 = 1_000_000
            for ti, target in enumerate(targets, start=1):
                mode = random.choice(modes_by_day[day]) if stype=="experiment" else "on"
                rows, summ = gen_trial(pid, day, sess_label, sess_idx, ti, target, t0, mode)
                summ["session_type"] = stype
                for r in rows:
                    r["session_type"] = stype
                write_csv(run / summ["event_log_file"], EVENT_COLS, rows)
                summaries.append(summ)
                t0 = summ["end_time"] + 500
        write_csv(run / "day_summary.csv", SUMMARY_COLS, summaries)
        (run / "demographics.json").write_text(json.dumps(
            {"participant_id": pid, "day": day, "age":"24"}, indent=2))
        (run / "experiment_config.json").write_text(json.dumps(
            {"selection_key":"Space","gaze_source":"WebGazer"}, indent=2))
        (run / "keyboard_layout.csv").write_text("char,cx,cy,halfW,halfH\na,100,300,30,30\n")

print("wrote synthetic dataset under", ROOT.resolve())
