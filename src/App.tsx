import { useRef, useState } from "react";
import { DemographicsForm } from "./components/DemographicsForm";
import { CalibrationPage } from "./components/CalibrationPage";
import { ExperimentConfig } from "./components/ExperimentConfig";
import { ExperimentSession } from "./components/ExperimentSession";
import { SessionIntro } from "./components/SessionIntro";
import { ExportPage } from "./components/ExportPage";
import { GazeProvider } from "./gaze/GazeContext";
import type {
  CalibrationResult,
  Demographics,
  ExperimentConfigData,
  SessionType,
} from "./types";
import { DataLogger } from "./logger/DataLogger";
import { sampleWithoutReplacement } from "./utils/sample";
import styles from "./App.module.css";

type Stage =
  | "demographics"
  | "calibration"
  | "config"
  | "intro"
  | "session"
  | "export";

// One entry per session in a day's run.
interface SessionSpec {
  type: SessionType;
  index: number; // 1-based within its type
  total: number; // total sessions of this type
}

const DEFAULT_CONFIG: ExperimentConfigData = {
  number_of_sentences_per_session: 10, // words per session
  num_practice_sessions: 1,
  num_experiment_sessions: 5,
  selection_key: "Space",
  finish_sentence_key: "Enter",
  gaze_source: "MouseDebug",
  gaze_sampling_interval_ms: 16,
  key_radius_px: 80,
  key_spacing_px: 320,
  keyboard_scale: 1.3,
  dataset_file: "words_8.json",
  gaze_smoothing_enabled: true,
  gaze_smoothing_min_cutoff: 1.0,
  gaze_smoothing_beta: 0.5,
};

// Tidy participant ids into P01, P02, … Extract digits, drop leading zeros,
// zero-pad to two. Ids with no digits fall back to a trimmed, upper-cased value.
function normalizeParticipantId(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits) return `P${String(parseInt(digits, 10)).padStart(2, "0")}`;
  return raw.trim().toUpperCase();
}

function buildPlan(cfg: ExperimentConfigData): SessionSpec[] {
  const plan: SessionSpec[] = [];
  for (let i = 1; i <= cfg.num_practice_sessions; i++) {
    plan.push({ type: "practice", index: i, total: cfg.num_practice_sessions });
  }
  for (let i = 1; i <= cfg.num_experiment_sessions; i++) {
    plan.push({ type: "experiment", index: i, total: cfg.num_experiment_sessions });
  }
  return plan;
}

export default function App() {
  const [stage, setStage] = useState<Stage>("demographics");
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [config, setConfig] = useState<ExperimentConfigData>(DEFAULT_CONFIG);
  // Full dataset loaded in the config stage; sessions resample from it.
  const [datasetWords, setDatasetWords] = useState<string[]>([]);
  const [debugOverlay, setDebugOverlay] = useState<boolean>(false);

  // One logger for the whole day's run (all sessions).
  const loggerRef = useRef<DataLogger | null>(null);
  // Session sequence for the day, and where we are in it.
  const [plan, setPlan] = useState<SessionSpec[]>([]);
  const [planPos, setPlanPos] = useState<number>(0);
  const [sessionWords, setSessionWords] = useState<string[]>([]);

  // Full reset — back to a blank demographics form for a fresh participant.
  const restart = () => {
    setStage("demographics");
    setDemographics(null);
    setCalibration(null);
    setDatasetWords([]);
    loggerRef.current = null;
    setPlan([]);
    setPlanPos(0);
    setSessionWords([]);
  };

  // Sample the words for one session from the loaded dataset (unique within the
  // session; may repeat across sessions since the dataset is small).
  const sampleSessionWords = (): string[] => {
    const n = Math.min(config.number_of_sentences_per_session, datasetWords.length);
    const unique = Array.from(new Set(datasetWords));
    return sampleWithoutReplacement(unique, n);
  };

  const startSession = () => {
    if (!loggerRef.current) return;
    const spec = plan[planPos];
    setSessionWords(sampleSessionWords());
    loggerRef.current.startSession(spec.type, spec.index);
    setStage("session");
  };

  const finishSession = () => {
    if (planPos + 1 < plan.length) {
      setPlanPos(planPos + 1);
      setStage("intro");
    } else {
      setStage("export");
    }
  };

  // Wrap everything in GazeProvider so calibration / experiment share gaze.
  const gazeSource = config.gaze_source;
  const samplingInterval = Math.max(1, config.gaze_sampling_interval_ms);
  const currentSpec = plan[planPos];

  return (
    <GazeProvider
      source={gazeSource}
      samplingIntervalMs={samplingInterval}
      smoothingEnabled={config.gaze_smoothing_enabled}
      smoothingMinCutoff={config.gaze_smoothing_min_cutoff}
      smoothingBeta={config.gaze_smoothing_beta}
    >
      <div className={styles.app}>
        <div className={styles.topBar}>
          <div className={styles.title}>Gaze Text-Entry Experiment</div>
          <div className={styles.topRight}>
            <label className={styles.debugToggle}>
              <input
                type="checkbox"
                checked={debugOverlay}
                onChange={(e) => setDebugOverlay(e.target.checked)}
              />
              Debug overlay
            </label>
            <span className={styles.stage}>
              stage: {stage}
              {demographics ? ` · ${demographics.participant_id} · day ${demographics.day}` : ""}
            </span>
          </div>
        </div>

        {stage === "demographics" && (
          <DemographicsForm
            initial={demographics ?? undefined}
            onSubmit={(d) => {
              setDemographics({
                ...d,
                participant_id: normalizeParticipantId(d.participant_id),
              });
              setStage("calibration");
            }}
          />
        )}

        {stage === "calibration" && demographics && (
          <CalibrationPage
            demographics={demographics}
            gazeSource={gazeSource}
            onChangeSource={(s) =>
              setConfig((c) => ({ ...c, gaze_source: s }))
            }
            onDone={(c) => {
              setCalibration(c);
              setStage("config");
            }}
          />
        )}

        {stage === "config" && demographics && (
          <ExperimentConfig
            initial={config}
            onSubmit={(cfg, words) => {
              setConfig(cfg);
              setDatasetWords(words);
              loggerRef.current = new DataLogger(
                demographics.participant_id,
                demographics.day,
              );
              setPlan(buildPlan(cfg));
              setPlanPos(0);
              setStage("intro");
            }}
          />
        )}

        {stage === "intro" && currentSpec && (
          <SessionIntro
            sessionType={currentSpec.type}
            sessionIndex={currentSpec.index}
            sessionTotal={currentSpec.total}
            wordCount={Math.min(
              config.number_of_sentences_per_session,
              datasetWords.length,
            )}
            selectionKey={config.selection_key}
            onStart={startSession}
          />
        )}

        {stage === "session" && currentSpec && loggerRef.current && (
          <ExperimentSession
            // Remount per session so trial state resets cleanly.
            key={`${currentSpec.type}_${currentSpec.index}`}
            config={config}
            words={sessionWords}
            sessionType={currentSpec.type}
            sessionIndex={currentSpec.index}
            sessionTotal={currentSpec.total}
            logger={loggerRef.current}
            showDebugOverlay={debugOverlay}
            onFinished={finishSession}
          />
        )}

        {stage === "export" && demographics && calibration && loggerRef.current && (
          <ExportPage
            demographics={demographics}
            calibration={calibration}
            config={config}
            logger={loggerRef.current}
            onRestart={restart}
          />
        )}
      </div>
    </GazeProvider>
  );
}
