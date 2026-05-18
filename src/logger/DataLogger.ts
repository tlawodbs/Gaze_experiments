// Per-trial data logger. Keeps rows in memory and produces CSV strings on demand.
// Logging logic is intentionally separated from UI components.

import type {
  EventType,
  GazeLogRow,
  GazeSample,
  InputLogRow,
  TrialFiles,
  TrialSummary,
} from "../types";
import { toCSV } from "../utils/csv";
import { levenshtein } from "../utils/levenshtein";

const GAZE_COLUMNS: (keyof GazeLogRow)[] = [
  "timestamp",
  "participant_id",
  "session_id",
  "trial_id",
  "target_sentence",
  "left_eye_x",
  "left_eye_y",
  "right_eye_x",
  "right_eye_y",
  "gaze_x",
  "gaze_y",
  "hovered_key",
  "event_type",
];

const INPUT_COLUMNS: (keyof InputLogRow)[] = [
  "timestamp",
  "participant_id",
  "session_id",
  "trial_id",
  "target_sentence",
  "input_index",
  "selected_character",
  "hovered_key_at_selection",
  "gaze_x_at_selection",
  "gaze_y_at_selection",
  "physical_key_pressed",
  "typed_text_so_far",
];

const SUMMARY_COLUMNS: (keyof TrialSummary)[] = [
  "participant_id",
  "session_id",
  "trial_id",
  "target_sentence",
  "typed_text",
  "start_time",
  "end_time",
  "duration_ms",
  "num_characters_typed",
  "target_length",
  "error_count",
  "character_error_rate",
  "raw_gaze_log_file",
  "character_log_file",
];

interface OpenTrial {
  trial_id: string;
  trial_index: number; // 1-based
  target_sentence: string;
  start_time: number;
  gaze_rows: GazeLogRow[];
  input_rows: InputLogRow[];
}

export class DataLogger {
  private participantId: string;
  private sessionId: string;
  private active: OpenTrial | null = null;
  private trialFiles: TrialFiles[] = [];
  private summaries: TrialSummary[] = [];

  constructor(participantId: string, sessionId: string) {
    this.participantId = participantId;
    this.sessionId = sessionId;
  }

  startTrial(trialIndex: number, target: string): void {
    const trial_id = formatTrialId(trialIndex);
    const start_time = Date.now();
    this.active = {
      trial_id,
      trial_index: trialIndex,
      target_sentence: target,
      start_time,
      gaze_rows: [],
      input_rows: [],
    };
    // trial_start marker.
    this.active.gaze_rows.push({
      timestamp: start_time,
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id,
      target_sentence: target,
      left_eye_x: null,
      left_eye_y: null,
      right_eye_x: null,
      right_eye_y: null,
      gaze_x: null,
      gaze_y: null,
      hovered_key: null,
      event_type: "trial_start",
    });
  }

  // Log a continuous gaze sample.
  logGaze(sample: GazeSample, hoveredKey: string | null): void {
    if (!this.active) return;
    this.active.gaze_rows.push({
      timestamp: sample.timestamp,
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id: this.active.trial_id,
      target_sentence: this.active.target_sentence,
      left_eye_x: sample.left_eye_x,
      left_eye_y: sample.left_eye_y,
      right_eye_x: sample.right_eye_x,
      right_eye_y: sample.right_eye_y,
      gaze_x: sample.x,
      gaze_y: sample.y,
      hovered_key: hoveredKey,
      event_type: "gaze_sample",
    });
  }

  // Log a discrete event in the gaze stream (selection presses, etc.).
  logGazeEvent(
    event: EventType,
    gazeX: number | null,
    gazeY: number | null,
    hoveredKey: string | null,
  ): void {
    if (!this.active) return;
    this.active.gaze_rows.push({
      timestamp: Date.now(),
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id: this.active.trial_id,
      target_sentence: this.active.target_sentence,
      left_eye_x: null,
      left_eye_y: null,
      right_eye_x: null,
      right_eye_y: null,
      gaze_x: gazeX,
      gaze_y: gazeY,
      hovered_key: hoveredKey,
      event_type: event,
    });
  }

  logCharacter(params: {
    inputIndex: number;
    selectedCharacter: string;
    hoveredKeyAtSelection: string | null;
    gazeXAtSelection: number | null;
    gazeYAtSelection: number | null;
    physicalKeyPressed: string;
    typedTextSoFar: string;
  }): void {
    if (!this.active) return;
    this.active.input_rows.push({
      timestamp: Date.now(),
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id: this.active.trial_id,
      target_sentence: this.active.target_sentence,
      input_index: params.inputIndex,
      selected_character: params.selectedCharacter,
      hovered_key_at_selection: params.hoveredKeyAtSelection,
      gaze_x_at_selection: params.gazeXAtSelection,
      gaze_y_at_selection: params.gazeYAtSelection,
      physical_key_pressed: params.physicalKeyPressed,
      typed_text_so_far: params.typedTextSoFar,
    });
  }

  endTrial(typedText: string): TrialSummary | null {
    if (!this.active) return null;

    // Discard "ghost" trials produced by React.StrictMode's dev-only
    // mount → cleanup → mount cycle: the cleanup fires endTrial immediately
    // after startTrial with no actual gaze samples or input collected. A real
    // trial always accumulates either gaze samples (streamed continuously)
    // or input events. Without this guard the session summary would contain
    // an extra empty row for each remount.
    const hasGazeSamples = this.active.gaze_rows.some(
      (r) => r.event_type === "gaze_sample",
    );
    const hasInput = this.active.input_rows.length > 0;
    if (!hasGazeSamples && !hasInput) {
      this.active = null;
      return null;
    }

    const end_time = Date.now();
    this.active.gaze_rows.push({
      timestamp: end_time,
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id: this.active.trial_id,
      target_sentence: this.active.target_sentence,
      left_eye_x: null,
      left_eye_y: null,
      right_eye_x: null,
      right_eye_y: null,
      gaze_x: null,
      gaze_y: null,
      hovered_key: null,
      event_type: "trial_end",
    });

    const error_count = levenshtein(this.active.target_sentence, typedText);
    const target_length = this.active.target_sentence.length;
    const character_error_rate =
      target_length === 0 ? 0 : error_count / target_length;

    const gaze_file = `trial_${pad3(this.active.trial_index)}_gaze.csv`;
    const input_file = `trial_${pad3(this.active.trial_index)}_input.csv`;

    const summary: TrialSummary = {
      participant_id: this.participantId,
      session_id: this.sessionId,
      trial_id: this.active.trial_id,
      target_sentence: this.active.target_sentence,
      typed_text: typedText,
      start_time: this.active.start_time,
      end_time,
      duration_ms: end_time - this.active.start_time,
      num_characters_typed: typedText.length,
      target_length,
      error_count,
      character_error_rate,
      raw_gaze_log_file: gaze_file,
      character_log_file: input_file,
    };

    this.summaries.push(summary);
    this.trialFiles.push({
      trial_id: this.active.trial_id,
      gaze_file_name: gaze_file,
      gaze_csv: toCSV(this.active.gaze_rows, GAZE_COLUMNS),
      input_file_name: input_file,
      input_csv: toCSV(this.active.input_rows, INPUT_COLUMNS),
    });

    this.active = null;
    return summary;
  }

  getTrialFiles(): TrialFiles[] {
    return this.trialFiles;
  }

  getSummaries(): TrialSummary[] {
    return this.summaries;
  }

  getSessionSummaryCSV(): string {
    return toCSV(this.summaries, SUMMARY_COLUMNS);
  }
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

export function formatTrialId(index: number): string {
  return `trial_${pad3(index)}`;
}
