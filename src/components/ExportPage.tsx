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
}

export function ExportPage({
  demographics,
  calibration,
  config,
  logger,
  onRestart,
}: Props) {
  const [zipBuilding, setZipBuilding] = useState(false);

  const trials = useMemo(() => logger.getTrialFiles(), [logger]);
  const summaryCSV = useMemo(() => logger.getSessionSummaryCSV(), [logger]);
  const summaries = useMemo(() => logger.getSummaries(), [logger]);
  const layoutCSV = useMemo(() => logger.getKeyboardLayoutCSV(), [logger]);

  const pid = demographics.participant_id || "unknown";
  const day = demographics.day || "unknown";
  const folderPath = `data/${pid}/day_${day}`;

  const downloadAsZip = async () => {
    setZipBuilding(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(folderPath)!;
      root.file("demographics.json", JSON.stringify(demographics, null, 2));
      root.file("calibration.json", JSON.stringify(calibration, null, 2));
      root.file("experiment_config.json", JSON.stringify(config, null, 2));
      // One unified event log per trial, namespaced under its session folder.
      for (const t of trials) {
        root.file(t.file_name, t.csv);
      }
      root.file("day_summary.csv", summaryCSV);
      root.file("keyboard_layout.csv", layoutCSV);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${pid}_day${day}_data.zip`);
    } finally {
      setZipBuilding(false);
    }
  };

  return (
    <div className={styles.root}>
      <h2>
        Day {day} complete — {pid}
      </h2>
      <p className={styles.subtitle}>
        Download the per-trial logs and aggregate files below. The ZIP bundle
        is recommended. Every row is tagged with day, session type/index, and
        trial.
      </p>

      <section className={styles.summary}>
        <h3>Trial summary ({summaries.length} trials)</h3>
        <table>
          <thead>
            <tr>
              <th>session</th>
              <th>trial</th>
              <th>target</th>
              <th>typed</th>
              <th>chars</th>
              <th>errors</th>
              <th>CER</th>
              <th>duration (s)</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={`${s.session_label}_${s.trial_id}`}>
                <td>{s.session_label}</td>
                <td>{s.trial_id}</td>
                <td className={styles.mono}>{s.target_word}</td>
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
              downloadText(summaryCSV, "day_summary.csv", "text/csv")
            }
          >
            day_summary.csv
          </button>
          <button
            onClick={() =>
              downloadText(layoutCSV, "keyboard_layout.csv", "text/csv")
            }
          >
            keyboard_layout.csv
          </button>
        </div>

        <div className={styles.row}>
          {trials.map((t) => (
            <span key={t.file_name} className={styles.trialChip}>
              <button onClick={() => downloadText(t.csv, t.file_name.replace(/\//g, "_"), "text/csv")}>
                {t.file_name}
              </button>
            </span>
          ))}
        </div>
      </section>

      <div className={styles.restartRow}>
        <button className={styles.primary} onClick={onRestart}>
          ↺ Start a new run (select participant &amp; day)
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
