import JSZip from "jszip";
import { useMemo, useState } from "react";
import type {
  CalibrationResult,
  Demographics,
  ExperimentConfigData,
} from "../types";
import type { DataLogger } from "../logger/DataLogger";
import styles from "./ExportPage.module.css";

interface Props {
  demographics: Demographics;
  calibration: CalibrationResult;
  config: ExperimentConfigData;
  logger: DataLogger;
  onRestart: () => void;
  // Same participant, fresh session — App bumps session_id and routes back to
  // calibration. Useful for studying learning effects across sessions.
  onNextSession: () => void;
}

export function ExportPage({
  demographics,
  calibration,
  config,
  logger,
  onRestart,
  onNextSession,
}: Props) {
  const [zipBuilding, setZipBuilding] = useState(false);

  const trials = useMemo(() => logger.getTrialFiles(), [logger]);
  const summaryCSV = useMemo(() => logger.getSessionSummaryCSV(), [logger]);
  const summaries = useMemo(() => logger.getSummaries(), [logger]);

  const folderPath = `data/participant_${demographics.participant_id || "unknown"}/session_${demographics.session_id || "unknown"}`;

  const downloadAsZip = async () => {
    setZipBuilding(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(folderPath)!;
      root.file("demographics.json", JSON.stringify(demographics, null, 2));
      root.file("calibration.json", JSON.stringify(calibration, null, 2));
      root.file("experiment_config.json", JSON.stringify(config, null, 2));
      for (const t of trials) {
        root.file(t.gaze_file_name, t.gaze_csv);
        root.file(t.input_file_name, t.input_csv);
      }
      root.file("session_summary.csv", summaryCSV);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(
        blob,
        `${demographics.participant_id || "participant"}_${demographics.session_id || "session"}_data.zip`,
      );
    } finally {
      setZipBuilding(false);
    }
  };

  return (
    <div className={styles.root}>
      <h2>Session complete</h2>
      <p className={styles.subtitle}>
        Download the per-trial logs and aggregate files below. The ZIP bundle
        is recommended.
      </p>

      <section className={styles.summary}>
        <h3>Trial summary</h3>
        <table>
          <thead>
            <tr>
              <th>trial_id</th>
              <th>typed</th>
              <th>chars</th>
              <th>errors</th>
              <th>CER</th>
              <th>duration (s)</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.trial_id}>
                <td>{s.trial_id}</td>
                <td className={styles.mono}>{s.typed_text}</td>
                <td>{s.num_characters_typed}</td>
                <td>{s.error_count}</td>
                <td>{s.character_error_rate.toFixed(3)}</td>
                <td>{(s.duration_ms / 1000).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.actions}>
        <button
          className={styles.primary}
          disabled={zipBuilding}
          onClick={downloadAsZip}
        >
          {zipBuilding ? "Building…" : "⬇ Download all (ZIP)"}
        </button>

        <div className={styles.row}>
          <button
            onClick={() =>
              downloadText(
                JSON.stringify(demographics, null, 2),
                "demographics.json",
                "application/json",
              )
            }
          >
            demographics.json
          </button>
          <button
            onClick={() =>
              downloadText(
                JSON.stringify(calibration, null, 2),
                "calibration.json",
                "application/json",
              )
            }
          >
            calibration.json
          </button>
          <button
            onClick={() =>
              downloadText(
                JSON.stringify(config, null, 2),
                "experiment_config.json",
                "application/json",
              )
            }
          >
            experiment_config.json
          </button>
          <button
            onClick={() =>
              downloadText(summaryCSV, "session_summary.csv", "text/csv")
            }
          >
            session_summary.csv
          </button>
        </div>

        <div className={styles.row}>
          {trials.map((t) => (
            <span key={t.trial_id} className={styles.trialChip}>
              <button onClick={() => downloadText(t.gaze_csv, t.gaze_file_name, "text/csv")}>
                {t.gaze_file_name}
              </button>
              <button onClick={() => downloadText(t.input_csv, t.input_file_name, "text/csv")}>
                {t.input_file_name}
              </button>
            </span>
          ))}
        </div>
      </section>

      <div className={styles.restartRow}>
        <button className={styles.primary} onClick={onNextSession}>
          ▶ Run another session (same participant, S
          {String(parseInt(demographics.session_id.replace(/\D/g, ""), 10) + 1).padStart(2, "0")}
          )
        </button>
        <button className={styles.secondary} onClick={onRestart}>
          ↺ Restart for a new participant
        </button>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadText(text: string, name: string, mime: string) {
  downloadBlob(new Blob([text], { type: mime }), name);
}
