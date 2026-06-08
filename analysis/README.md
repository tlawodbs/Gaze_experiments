# Analysis

Analyses the data exported by the gaze text-entry prototype.

## Files
- **`analysis.ipynb`** — the main notebook. Computes per-session **WPM**,
  **errors per phrase / accuracy**, **early- vs late-trigger** errors, plus
  fixation duration and corrective-saccade proxies, and the Day 1→3 learning
  curves (RQ1–RQ3).
- `_build_notebook.py` — regenerates `analysis.ipynb` from source. Edit logic
  here and re-run `python _build_notebook.py` to keep the notebook reproducible.
- `_make_fake_data.py` — generates a synthetic dataset (`data_fake/`) matching
  the export schema, for smoke-testing without real participants.

## Usage
1. Unzip each participant/day export so you have `data/<pid>/day_<d>/...`
   (the notebook searches recursively for `day_summary.csv`).
2. Open `analysis.ipynb`, set `DATA_ROOT` in the **Config** cell, and run all.
   - `pip install pandas numpy matplotlib scipy` if needed.
3. Aggregated tables and figures are written to `analysis_output/`.

## Tuning the early/late classifier
The trigger classification is an **operational definition** built from the
`hovered_key` stream. The constants in the Config cell
(`ON_TIME_TOL_MS`, `GAZE_SEARCH_BEFORE_MS/AFTER_MS`, fixation thresholds) shape
it — review them with the team and re-run. See the markdown above the
classifier cell for the exact rules.
