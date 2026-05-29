// Data logger for one day's run. Spans all sessions (practice + experiment) of
// the day, tagging every row with its session context (day, session type/index,
// trial). Gaze samples and key presses are collected into a SINGLE per-trial
// event log (one CSV per trial). Logging logic is intentionally separated from
// UI components.

import type {
  EventLogRow,
  EventType,
  GazeSample,
  KeyDef,
  SessionContext,
  SessionType,
  TrialFiles,
  TrialSummary,
} from "../types";
import { toCSV } from "../utils/csv";
import { levenshtein } from "../utils/levenshtein";

const EVENT_COLUMNS: (keyof EventLogRow)[] = [
  "timestamp",
  "participant_id",
  "day",
  "session_type",
  "session_index",
  "session_label",
  "trial_id",
  "target_word",
  "event_type",
  "gaze_x",
  "gaze_y",
  "left_eye_x",
  "left_eye_y",
  "right_eye_x",
  "right_eye_y",
  "hovered_key",
  "target_char",
  "target_key_x",
  "target_key_y",
  "physical_key",
  "selected_character",
  "input_index",
  "typed_text_so_far",
  "key_down_time",
  "key_up_time",
  "key_hold_ms",
];

const SUMMARY_COLUMNS: (keyof TrialSummary)[] = [
  "participant_id",
  "day",
  "session_type",
  "session_index",
  "session_label",
  "trial_id",
  "target_word",
  "typed_text",
  "start_time",
  "end_time",
  "duration_ms",
  "num_characters_typed",
  "target_length",
  "error_count",
  "character_error_rate",
  "event_log_file",
];

// Default (null) values for the fields a given row type doesn't use, so each
// push only has to specify what's relevant.
const EMPTY_GAZE = {
  gaze_x: null,
  gaze_y: null,
  left_eye_x: null,
  left_eye_y: null,
  right_eye_x: null,
  right_eye_y: null,
  hovered_key: null,
};
const EMPTY_TARGET = {
  target_char: null,
  target_key_x: null,
  target_key_y: null,
};
const EMPTY_KEY = {
  physical_key: null,
  selected_character: null,
  input_index: null,
  typed_text_so_far: null,
  key_down_time: null,
  key_up_time: null,
  key_hold_ms: null,
};

interface OpenTrial {
  trial_id: string;
  trial_index: number; // 1-based within the session
  target_word: string;
  start_time: number;
  rows: EventLogRow[];
}

export class DataLogger {
  private participantId: string;
  private day: string;
  // Current session context (set via startSession before each session).
  private sessionType: SessionType = "practice";
  private sessionIndex = 0;
  private sessionLabel = "";
  private active: OpenTrial | null = null;
  private trialFiles: TrialFiles[] = [];
  private summaries: TrialSummary[] = [];
  // Latest keyboard geometry (key centres + hit half-extents), captured so the
  // full key layout can be exported alongside the per-trial logs.
  private keyboardLayout: KeyDef[] = [];

  constructor(participantId: string, day: string) {
    this.participantId = participantId;
    this.day = day;
  }

  // Begin a new session (practice or experiment). Subsequent trials are tagged
  // with this context until the next startSession call.
  startSession(type: SessionType, index: number): void {
    this.sessionType = type;
    this.sessionIndex = index;
    this.sessionLabel = `${type}_${index}`;
  }

  private ctx(): SessionContext {
    return {
      participant_id: this.participantId,
      day: this.day,
      session_type: this.sessionType,
      session_index: this.sessionIndex,
      session_label: this.sessionLabel,
    };
  }

  startTrial(trialNumber: number, target: string): void {
    const trial_id = formatTrialId(trialNumber);
    const start_time = Date.now();
    this.active = {
      trial_id,
      trial_index: trialNumber,
      target_word: target,
      start_time,
      rows: [],
    };
    this.active.rows.push({
      ...this.ctx(),
      ...EMPTY_GAZE,
      ...EMPTY_TARGET,
      ...EMPTY_KEY,
      timestamp: start_time,
      trial_id,
      target_word: target,
      event_type: "trial_start",
    });
  }

  // Log a continuous gaze sample. `target` is the current intended letter and
  // its key centre (the next letter to enter), in the same px space as gaze.
  logGaze(
    sample: GazeSample,
    hoveredKey: string | null,
    target: { char: string | null; x: number | null; y: number | null },
  ): void {
    if (!this.active) return;
    this.active.rows.push({
      ...this.ctx(),
      ...EMPTY_KEY,
      timestamp: sample.timestamp,
      trial_id: this.active.trial_id,
      target_word: this.active.target_word,
      event_type: "gaze_sample",
      gaze_x: sample.x,
      gaze_y: sample.y,
      left_eye_x: sample.left_eye_x,
      left_eye_y: sample.left_eye_y,
      right_eye_x: sample.right_eye_x,
      right_eye_y: sample.right_eye_y,
      hovered_key: hoveredKey,
      target_char: target.char,
      target_key_x: target.x,
      target_key_y: target.y,
    });
  }

  // Log a single key event (a down or an up) as its own row, so the Space-bar
  // down-time and up-time each appear as a distinct, time-ordered entry in the
  // unified log. `time` is this event's timestamp; down_time/up_time/hold are
  // filled in where known (the up row carries both plus the hold duration).
  logKeyEvent(p: {
    eventType: EventType;
    time: number;
    physicalKey: string;
    downTime: number | null;
    upTime: number | null;
    holdMs: number | null;
    gazeX: number | null;
    gazeY: number | null;
    hoveredKey: string | null;
    targetChar: string | null;
    targetKeyX: number | null;
    targetKeyY: number | null;
    selectedCharacter: string | null;
    inputIndex: number | null;
    typedTextSoFar: string | null;
  }): void {
    if (!this.active) return;
    this.active.rows.push({
      ...this.ctx(),
      timestamp: p.time,
      trial_id: this.active.trial_id,
      target_word: this.active.target_word,
      event_type: p.eventType,
      gaze_x: p.gazeX,
      gaze_y: p.gazeY,
      left_eye_x: null,
      left_eye_y: null,
      right_eye_x: null,
      right_eye_y: null,
      hovered_key: p.hoveredKey,
      target_char: p.targetChar,
      target_key_x: p.targetKeyX,
      target_key_y: p.targetKeyY,
      physical_key: p.physicalKey,
      selected_character: p.selectedCharacter,
      input_index: p.inputIndex,
      typed_text_so_far: p.typedTextSoFar,
      key_down_time: p.downTime,
      key_up_time: p.upTime,
      key_hold_ms: p.holdMs,
    });
  }

  endTrial(typedText: string): TrialSummary | null {
    if (!this.active) return null;

    // Discard "ghost" trials produced by React.StrictMode's dev-only
    // mount → cleanup → mount cycle: the cleanup fires endTrial immediately
    // after startTrial with no actual gaze samples or input collected.
    const hasGaze = this.active.rows.some((r) => r.event_type === "gaze_sample");
    const hasInput = this.active.rows.some(
      (r) =>
        r.event_type === "selection_down" ||
        r.event_type === "finish_down",
    );
    if (!hasGaze && !hasInput) {
      this.active = null;
      return null;
    }

    const end_time = Date.now();
    this.active.rows.push({
      ...this.ctx(),
      ...EMPTY_GAZE,
      ...EMPTY_TARGET,
      ...EMPTY_KEY,
      timestamp: end_time,
      trial_id: this.active.trial_id,
      target_word: this.active.target_word,
      event_type: "trial_end",
    });

    const error_count = levenshtein(this.active.target_word, typedText);
    const target_length = this.active.target_word.length;
    const character_error_rate =
      target_length === 0 ? 0 : error_count / target_length;

    // One file per trial, namespaced under the session folder so the same trial
    // numbers across sessions never collide.
    const file = `${this.sessionLabel}/trial_${pad3(this.active.trial_index)}_events.csv`;

    const summary: TrialSummary = {
      ...this.ctx(),
      trial_id: this.active.trial_id,
      target_word: this.active.target_word,
      typed_text: typedText,
      start_time: this.active.start_time,
      end_time,
      duration_ms: end_time - this.active.start_time,
      num_characters_typed: typedText.length,
      target_length,
      error_count,
      character_error_rate,
      event_log_file: file,
    };

    this.summaries.push(summary);
    this.trialFiles.push({
      trial_id: this.active.trial_id,
      session_label: this.sessionLabel,
      file_name: file,
      csv: toCSV(this.active.rows, EVENT_COLUMNS),
    });

    this.active = null;
    return summary;
  }

  // Record the current keyboard geometry (called whenever the layout settles).
  setKeyboardLayout(keys: KeyDef[]): void {
    this.keyboardLayout = keys;
  }

  // CSV of every key's centre and hit half-extents (viewport px), so analyses
  // can compute gaze-to-key distances for any key, not just the current target.
  getKeyboardLayoutCSV(): string {
    return toCSV(this.keyboardLayout, ["char", "cx", "cy", "halfW", "halfH"]);
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
