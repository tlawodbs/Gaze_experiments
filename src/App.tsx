import { useState } from "react";
import { DemographicsForm } from "./components/DemographicsForm";
import { CalibrationPage } from "./components/CalibrationPage";
import { ExperimentConfig } from "./components/ExperimentConfig";
import { ExperimentSession } from "./components/ExperimentSession";
import { ExportPage } from "./components/ExportPage";
import { GazeProvider } from "./gaze/GazeContext";
import type {
  CalibrationResult,
  Demographics,
  ExperimentConfigData,
} from "./types";
import type { DataLogger } from "./logger/DataLogger";
import { sampleWithoutReplacement } from "./utils/sample";
import styles from "./App.module.css";

type Stage =
  | "demographics"
  | "calibration"
  | "config"
  | "experiment"
  | "export";

const DEFAULT_CONFIG: ExperimentConfigData = {
  number_of_sentences_per_session: 5,
  selection_key: "Space",
  finish_sentence_key: "Enter",
  gaze_source: "MouseDebug",
  gaze_sampling_interval_ms: 16,
  key_radius_px: 62,
  key_spacing_px: 18,
  keyboard_scale: 1.0,
  dataset_file: "phrases_mackenzie.json",
  gaze_smoothing_enabled: true,
  gaze_smoothing_min_cutoff: 1.0,
  gaze_smoothing_beta: 0.5,
};

const formatSessionId = (n: number) => `S${String(n).padStart(2, "0")}`;

export default function App() {
  const [stage, setStage] = useState<Stage>("demographics");
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [config, setConfig] = useState<ExperimentConfigData>(DEFAULT_CONFIG);
  const [sessionSentences, setSessionSentences] = useState<string[]>([]);
  // Full dataset loaded in the config stage. Kept around so that a same-
  // participant "next session" can resample without re-loading or re-prompting.
  const [datasetSentences, setDatasetSentences] = useState<string[]>([]);
  const [finalLogger, setFinalLogger] = useState<DataLogger | null>(null);
  const [debugOverlay, setDebugOverlay] = useState<boolean>(false);
  // Auto-incremented per participant. Bumped each time the user clicks
  // "Run another session" on the ExportPage.
  const [sessionNumber, setSessionNumber] = useState<number>(1);

  // Full reset — back to demographics, fresh participant.
  const restart = () => {
    setStage("demographics");
    setDemographics(null);
    setCalibration(null);
    setSessionSentences([]);
    setDatasetSentences([]);
    setFinalLogger(null);
    setSessionNumber(1);
  };

  // Same participant, next session. Bumps the session number, resamples
  // sentences from the dataset loaded earlier, and jumps straight to the
  // experiment — calibration and config are reused as-is. The gaze library's
  // internal calibration persists across sessions because the GazeProvider
  // stays mounted with the same source.
  const nextSession = () => {
    if (!demographics || datasetSentences.length === 0) return;
    const nextN = sessionNumber + 1;
    setSessionNumber(nextN);
    setDemographics({ ...demographics, session_id: formatSessionId(nextN) });
    // +1 for the practice trial (trial_000); see config-stage handler.
    const n = Math.min(
      config.number_of_sentences_per_session + 1,
      datasetSentences.length,
    );
    const unique = Array.from(new Set(datasetSentences));
    setSessionSentences(sampleWithoutReplacement(unique, n));
    setFinalLogger(null);
    setStage("experiment");
  };

  // Wrap everything in GazeProvider so calibration / experiment share gaze.
  // The source is taken from config, but we want gaze available during
  // calibration too, even before config — so we pick MouseDebug as a safe
  // default until config is submitted.
  const gazeSource = config.gaze_source;
  const samplingInterval = Math.max(1, config.gaze_sampling_interval_ms);

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
            <span className={styles.stage}>stage: {stage}</span>
          </div>
        </div>

        {stage === "demographics" && (
          <DemographicsForm
            onSubmit={(d) => {
              setDemographics({ ...d, session_id: formatSessionId(sessionNumber) });
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

        {stage === "config" && (
          <ExperimentConfig
            initial={config}
            onSubmit={(cfg, sentences) => {
              setConfig(cfg);
              // Keep the full dataset around so "Run another session" can
              // resample without re-prompting the experimenter.
              setDatasetSentences(sentences);
              // One extra sentence on top of the requested count, used for the
              // practice trial (trial_000). The N requested ones become
              // trial_001 .. trial_00N.
              const n = Math.min(
                cfg.number_of_sentences_per_session + 1,
                sentences.length,
              );
              // Avoid duplicates within the same session; no fixed seed.
              const unique = Array.from(new Set(sentences));
              const sampled = sampleWithoutReplacement(unique, n);
              setSessionSentences(sampled);
              setStage("experiment");
            }}
          />
        )}

        {stage === "experiment" && demographics && (
          <ExperimentSession
            demographics={demographics}
            config={config}
            sentences={sessionSentences}
            showDebugOverlay={debugOverlay}
            onFinished={(logger) => {
              setFinalLogger(logger);
              setStage("export");
            }}
          />
        )}

        {stage === "export" && demographics && calibration && finalLogger && (
          <ExportPage
            demographics={demographics}
            calibration={calibration}
            config={config}
            logger={finalLogger}
            onRestart={restart}
            onNextSession={nextSession}
          />
        )}
      </div>
    </GazeProvider>
  );
}
