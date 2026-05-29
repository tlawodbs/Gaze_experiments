# Gaze Text-Entry Experiment

A web-based experiment platform for studying **gaze text-entry**. Participants
hover over QWERTY keys with their eyes and confirm each character by pressing a
configured physical key (default: **Space**). Sentences finish on **Enter**.

The system captures **raw** behavior — no auto-correct, no backspace, no
predictive input — so that errors and gaze trajectories are preserved.

Built with **React + TypeScript + Vite**. Gaze tracking is provided by
[WebGazer.js](https://github.com/brownhci/WebGazer) (TensorFlow.js FaceMesh +
eye-pixel patches + ridge-regression mapping to screen coordinates), with a
**MouseDebug** fallback for development.

---

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). On the calibration
screen choose either **WebGazer** (real webcam-based gaze) or **MouseDebug**
(mouse cursor stands in for gaze).

WebGazer.js is bundled from npm; no Python service or WebSocket bridge is
required. The browser will ask for webcam permission when calibration begins.

---

## Pipeline

The app walks each participant through five stages:

1. **Demographic Session** — `DemographicsForm` collects participant info and
   exports `demographics.json`.
2. **Gaze Calibration Session** — `CalibrationPage` lets the participant pick
   the gaze source. For **WebGazer**, a 3×3 grid of red dots appears across
   the screen. Look at each one and click it 5 times — every click feeds a
   training sample into WebGazer's ridge-regression model. Dots turn orange
   while partially trained and green once complete; the page advances
   automatically when all nine dots are green. The result is exported as
   `calibration.json`.
3. **Experiment Configuration** — `ExperimentConfig` sets selection keys,
   keyboard geometry, sampling interval, dataset file, and exports
   `experiment_config.json`.
4. **Text-entry Experiment Session** — `ExperimentSession` shows one target
   sentence at a time, logs every gaze sample, every keypress, and every
   confirmed character.
5. **Data Export / Completion** — `ExportPage` downloads all per-trial CSVs,
   the session summary, and a single ZIP bundle.

---

## Gaze sources

### WebGazer (real gaze input)

WebGazer.js runs entirely in the browser. It is bundled by Vite from the
`webgazer` npm dependency, so no script tags or vendored assets are needed
in `index.html`. The library creates its own `<video id="webgazerVideoFeed">`
and face-overlay nodes when `webgazer.begin()` runs.

The provider (`src/gaze/WebGazerProvider.ts`) wraps the singleton library:

- `webgazer.begin()` boots the camera + TensorFlow.js FaceMesh model.
- `webgazer.setGazeListener((data) => …)` receives a `{x, y}` viewport-pixel
  prediction on every animation frame; the provider forwards each as a
  `GazeSample`.
- `webgazer.applyKalmanFilter(true)` enables WebGazer's built-in smoothing;
  the project's One-Euro filter is layered on top in `GazeContext`.
- `webgazer.recordScreenPosition(x, y, "click")` adds one calibration sample
  to the ridge regression. The 9-dot calibrator drives this on every click.
- `webgazer.clearData()` wipes the trained mapping for a recalibration cycle.

Calibration UI is rendered by `src/components/WebGazerCalibrator.tsx` — a 3×3
grid of click targets, each requiring 5 clicks. Mid-experiment recalibration
reuses the same component from `ExperimentSession`.

### MouseDebug (development)

The mouse cursor is treated as the single gaze point. Useful when no webcam
is available or for verifying experiment logic. Enable the **Debug overlay**
checkbox in the top bar to display live values for `gaze_x`, `gaze_y`,
`hovered_key`, `trial_id`, and `typed_text`.

---

## Conducting an experiment session

1. Launch `npm run dev`.
2. Fill out the participant demographic form.
3. On the calibration page, pick **WebGazer** or **MouseDebug**, then click
   **Begin Calibration**. For WebGazer, look at each red dot and click it 5
   times — the screen advances automatically when all nine dots are green;
   mark success/failure when done.
4. Open the configuration screen:
   - **# sentences per session**: how many target sentences to sample.
   - **Selection key**: physical key that confirms the currently hovered key.
   - **Finish-sentence key**: physical key that ends the current trial.
   - **Gaze source**: inherited from calibration; can be overridden here.
   - **Key radius / spacing / scale**: visual & detection geometry. Circles
     are guaranteed not to overlap.
   - **Dataset file**: filename in `/public` (default `phrases_mackenzie.json`)
     **or** upload a JSON / CSV / TXT file directly.
5. Press **Save Config & Start Experiment**. The app randomly samples *n*
   unique sentences (no fixed seed) and presents them one trial at a time.
6. For each trial:
   - Look at a key. It highlights.
   - Press the selection key (default **Space**) to append it.
   - Press the finish-sentence key (default **Enter**) to complete the
     trial. There is **no backspace**.
7. After the last trial, the export page appears. Download individual files
   or the recommended ZIP bundle.

---

## Sentence dataset

The default dataset shipped at `public/phrases_mackenzie.json` is the
**MacKenzie & Soukoreff (2003)** phrase set — 500 phrases originally
distributed at <http://www.yorku.ca/mack/PhraseSets.zip>. Phrases are
lowercased to match the lowercase QWERTY layout; original text otherwise
preserved.

> MacKenzie, I. S., & Soukoreff, R. W. (2003). Phrase sets for evaluating
> text entry techniques. *CHI '03 Extended Abstracts*. <https://doi.org/10.1145/765891.765971>

You can supply your own dataset in either of these formats:

- JSON array of strings — `["sentence one", "sentence two", ...]`
- CSV / TXT — one sentence per line (first column is used for CSV)

Sampling is **without replacement** for each session, so duplicates do not
appear within a single session. No random seed is fixed.

---

## Exported files

Each session produces this folder structure (also wrapped in a ZIP):

```
data/
  participant_<participant_id>/
    session_<session_id>/
      demographics.json
      calibration.json
      experiment_config.json
      trial_001_gaze.csv
      trial_001_input.csv
      trial_002_gaze.csv
      trial_002_input.csv
      ...
      session_summary.csv
```

### `trial_NNN_gaze.csv`

One row per gaze sample (or discrete event) for that trial.

| column            | meaning                                                            |
|-------------------|--------------------------------------------------------------------|
| `timestamp`       | ms since epoch                                                     |
| `participant_id`  | from demographics                                                  |
| `session_id`      | from demographics                                                  |
| `trial_id`        | `trial_001` …                                                      |
| `target_sentence` | sentence shown to the participant                                  |
| `left_eye_x/y`    | viewport px or null (WebGazer reports a single gaze point)         |
| `right_eye_x/y`   | viewport px or null                                                |
| `gaze_x/y`        | viewport px combined point (null if unavailable)                   |
| `hovered_key`     | key under gaze or null                                             |
| `event_type`      | `gaze_sample`, `selection_key_down`, `finish_key_down`, `trial_start`, `trial_end`, `no_hover_selection` |

### `trial_NNN_input.csv`

One row per confirmed character.

| column                      | meaning                                |
|-----------------------------|----------------------------------------|
| `timestamp`                 | ms since epoch                         |
| `participant_id`            |                                        |
| `session_id`                |                                        |
| `trial_id`                  |                                        |
| `target_sentence`           |                                        |
| `input_index`               | 1-based count of confirmed characters  |
| `selected_character`        | the appended character                 |
| `hovered_key_at_selection`  | same character (kept for clarity)      |
| `gaze_x_at_selection`       | gaze position at the moment of press   |
| `gaze_y_at_selection`       |                                        |
| `physical_key_pressed`      | name of the physical key pressed       |
| `typed_text_so_far`         | rolling typed text up to & including   |

### `session_summary.csv`

One row per trial.

| column                  | meaning                                                  |
|-------------------------|----------------------------------------------------------|
| `participant_id`        |                                                          |
| `session_id`            |                                                          |
| `trial_id`              |                                                          |
| `target_sentence`       |                                                          |
| `typed_text`            | what the participant produced (raw, uncorrected)         |
| `start_time` / `end_time` | ms since epoch                                          |
| `duration_ms`           |                                                          |
| `num_characters_typed`  | length of `typed_text`                                   |
| `target_length`         | length of `target_sentence`                              |
| `error_count`           | Levenshtein distance between target & typed              |
| `character_error_rate`  | `error_count / target_length`                            |
| `raw_gaze_log_file`     | filename for cross-reference                             |
| `character_log_file`    | filename for cross-reference                             |

---

## Architecture

```
src/
  App.tsx                      session state machine
  components/
    DemographicsForm.tsx
    CalibrationPage.tsx        intro + post-calibration verification
    WebGazerCalibrator.tsx     9-dot click calibration overlay
    ExperimentConfig.tsx
    KeyboardLayout.tsx         circular QWERTY, reports key geometry
    ExperimentSession.tsx      gaze ↔ keyboard ↔ logger glue
    ExportPage.tsx             per-file + ZIP download
    DebugOverlay.tsx
  gaze/
    GazeContext.tsx            fans out samples + computes midpoint
    WebGazerProvider.ts        wraps the WebGazer.js npm library
    MouseDebugProvider.ts      mouse-as-gaze for development
  logger/
    DataLogger.ts              per-trial buffers + CSV export
  utils/
    csv.ts                     CSV writer
    levenshtein.ts             error count
    sample.ts                  random sampling without replacement
  types.ts
public/
  phrases_mackenzie.json       MacKenzie & Soukoreff 500-phrase set
```

Gaze logic is centralized in `gaze/GazeContext.tsx`. Per-key hover detection
uses **circular distance**:

```
distance = sqrt((gaze_x - key_center_x)^2 + (gaze_y - key_center_y)^2)
hovered  = distance <= key_radius
```

If multiple keys match, the closest is selected. Logging is decoupled from
rendering: every gaze sample passes through the logger when a trial is
active, and the UI only re-renders the hovered key on the next animation
frame, keeping the input path snappy.

---

## Notes & limitations

- WebGazer.js uses the browser's `getUserMedia` API; the user must grant
  webcam access before calibration can run.
- No backspace, no correction. Mistakes are recorded as-is.
- The app stores nothing server-side; all data stays in the browser until
  exported.
