// Shared types for the gaze text-entry experiment.

export type GazeSource = "EyeGesturesLite" | "MouseDebug";

export interface Demographics {
  participant_id: string;
  session_id: string;
  age: string;
  gender: string;
  dominant_hand: string;
  vision_condition: string;
  glasses_or_contacts: string;
  prior_eye_tracking_experience: string;
  prior_xr_experience: string;
  typing_experience: string;
  notes: string;
}

export interface CalibrationResult {
  participant_id: string;
  session_id: string;
  calibration_start_time: number;
  calibration_end_time: number;
  calibration_success: boolean;
  calibration_method: string;
  notes: string;
}

export interface ExperimentConfigData {
  number_of_sentences_per_session: number;
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
  // Half-width / half-height of the hit area. For circular letter keys both
  // equal the radius. For the pill-shaped space key, halfW > halfH.
  halfW: number;
  halfH: number;
}

export type EventType =
  | "gaze_sample"
  | "selection_key_down"
  | "finish_key_down"
  | "trial_start"
  | "trial_end"
  | "no_hover_selection";

export interface GazeLogRow {
  timestamp: number;
  participant_id: string;
  session_id: string;
  trial_id: string;
  target_sentence: string;
  left_eye_x: number | null;
  left_eye_y: number | null;
  right_eye_x: number | null;
  right_eye_y: number | null;
  gaze_x: number | null;
  gaze_y: number | null;
  hovered_key: string | null;
  event_type: EventType;
}

export interface InputLogRow {
  timestamp: number;
  participant_id: string;
  session_id: string;
  trial_id: string;
  target_sentence: string;
  input_index: number;
  selected_character: string;
  hovered_key_at_selection: string | null;
  gaze_x_at_selection: number | null;
  gaze_y_at_selection: number | null;
  physical_key_pressed: string;
  typed_text_so_far: string;
}

export interface TrialSummary {
  participant_id: string;
  session_id: string;
  trial_id: string;
  target_sentence: string;
  typed_text: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  num_characters_typed: number;
  target_length: number;
  error_count: number;
  character_error_rate: number;
  raw_gaze_log_file: string;
  character_log_file: string;
}

export interface TrialFiles {
  trial_id: string;
  gaze_file_name: string;
  gaze_csv: string;
  input_file_name: string;
  input_csv: string;
}
