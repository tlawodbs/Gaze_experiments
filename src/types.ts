// Shared types for the gaze text-entry experiment.

export type GazeSource = "WebGazer" | "MouseDebug";

// A study is run once per day for several days. One day's run consists of a
// calibration followed by a fixed sequence of sessions (practice + experiment),
// each session being a set of single-word trials.
export type SessionType = "practice" | "experiment";

export interface Demographics {
  participant_id: string; // normalized to P01, P02, … (see App.normalizeParticipantId)
  day: string; // "1" | "2" | "3" — which day of the multi-day study this run is
  age: string;
  gender: string;
  dominant_hand: string;
  dominant_eye: string; // left / right / unknown
  glasses_or_contacts: string;
  prior_eye_tracking_experience: string;
  prior_xr_experience: string;
  typing_experience: string;
  notes: string;
}

export interface CalibrationResult {
  participant_id: string;
  day: string;
  calibration_start_time: number;
  calibration_end_time: number;
  calibration_success: boolean;
  calibration_method: string;
  notes: string;
}

export interface ExperimentConfigData {
  // Words shown per session (each word is one trial).
  number_of_sentences_per_session: number;
  // Session structure for one day's run.
  num_practice_sessions: number;
  num_experiment_sessions: number;
  selection_key: string;
  finish_sentence_key: string;
  gaze_source: GazeSource;
  gaze_sampling_interval_ms: number;
  key_radius_px: number;
  key_spacing_px: number;
  keyboard_scale: number;
  dataset_file: string;
  // One-Euro filter applied to raw gaze coordinates before hit-testing /
  // logging. See utils/oneEuroFilter.ts for the math. Values are exported as
  // part of experiment_config.json so analyses can reproduce the smoothing.
  gaze_smoothing_enabled: boolean;
  gaze_smoothing_min_cutoff: number; // Hz — smoothing floor at low speed
  gaze_smoothing_beta: number; // speed sensitivity
}

// Raw gaze sample emitted by a gaze provider.
export interface GazeSample {
  timestamp: number;
  left_eye_x: number | null;
  left_eye_y: number | null;
  right_eye_x: number | null;
  right_eye_y: number | null;
  x: number | null;
  y: number | null;
  raw_event?: unknown;
}

export interface KeyDef {
  char: string;
  cx: number;
  cy: number;
  // Half-width / half-height of the (rectangular) hit area, already expanded by
  // half the inter-key spacing so neighbouring regions tile with no gaps.
  halfW: number;
  halfH: number;
}

export type EventType =
  | "gaze_sample" // a continuous gaze reading
  | "selection_down" // selection (Space) key pressed down; char entered if a key was under gaze
  | "selection_up" // selection (Space) key released
  | "finish_down" // finish key pressed down
  | "finish_up" // finish key released
  | "trial_start"
  | "trial_end";

// Fields identifying which day / session / trial a logged row belongs to.
export interface SessionContext {
  participant_id: string;
  day: string;
  session_type: SessionType;
  session_index: number; // 1-based within its type
  session_label: string; // e.g. "practice_1", "experiment_3"
}

// One unified per-trial log: gaze samples and key presses share a single file
// (and a single row schema). Gaze rows fill the gaze/eye fields; key-press rows
// fill the key fields, including the keyboard down-time and up-time.
export interface EventLogRow extends SessionContext {
  timestamp: number; // primary event time (gaze sample time, or key-down time)
  trial_id: string;
  target_word: string;
  event_type: EventType;
  // Gaze (present on gaze_sample rows, and captured at key-down for press rows).
  gaze_x: number | null;
  gaze_y: number | null;
  left_eye_x: number | null;
  left_eye_y: number | null;
  right_eye_x: number | null;
  right_eye_y: number | null;
  hovered_key: string | null;
  // The intended target at this moment (the next letter to enter) and its key
  // centre in viewport px — same coordinate space as gaze_x/gaze_y.
  target_char: string | null;
  target_key_x: number | null;
  target_key_y: number | null;
  // Key-press fields (null on gaze rows).
  physical_key: string | null;
  selected_character: string | null;
  input_index: number | null; // running character count within the trial
  typed_text_so_far: string | null;
  key_down_time: number | null; // keyboard down-time (ms epoch)
  key_up_time: number | null; // keyboard up-time (ms epoch)
  key_hold_ms: number | null; // up_time - down_time
}

export interface TrialSummary extends SessionContext {
  trial_id: string;
  target_word: string;
  typed_text: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  num_characters_typed: number;
  target_length: number;
  error_count: number;
  character_error_rate: number;
  event_log_file: string;
}

export interface TrialFiles {
  trial_id: string;
  session_label: string;
  file_name: string;
  csv: string;
}
