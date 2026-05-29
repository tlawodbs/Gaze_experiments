import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { ExperimentConfigData, GazeSource } from "../types";
import styles from "./ExperimentConfig.module.css";

interface Props {
  initial: ExperimentConfigData;
  onSubmit: (cfg: ExperimentConfigData, sentences: string[]) => void;
}

export function ExperimentConfig({ initial, onSubmit }: Props) {
  const [cfg, setCfg] = useState<ExperimentConfigData>(initial);
  const [datasetPreview, setDatasetPreview] = useState<string[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  const set = <K extends keyof ExperimentConfigData>(k: K, v: ExperimentConfigData[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  // Try to load the dataset from /public.
  const tryLoadDataset = async (path: string) => {
    setDatasetError(null);
    setDatasetPreview([]);
    try {
      const url = path.startsWith("/") ? path : `/${path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sentences = await parseDataset(res, path);
      setDatasetPreview(sentences);
    } catch (err) {
      setDatasetError(String(err));
    }
  };

  // Auto-load the dataset on mount so the experimenter doesn't have to click
  // "Load from /public". Only fires for the initial dataset_file value; if the
  // experimenter edits it, they can use the explicit button.
  useEffect(() => {
    tryLoadDataset(initial.dataset_file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setDatasetError(null);
    setDatasetPreview([]);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const sentences = parseDatasetText(text, file.name);
      setDatasetPreview(sentences);
      set("dataset_file", file.name);
    } catch (err) {
      setDatasetError(String(err));
    }
  };

  const handleStart = (e: FormEvent) => {
    e.preventDefault();
    if (datasetPreview.length === 0) {
      alert("Load a word dataset first.");
      return;
    }
    if (cfg.number_of_sentences_per_session > datasetPreview.length) {
      const ok = confirm(
        `Requested ${cfg.number_of_sentences_per_session} words but dataset only has ${datasetPreview.length}. Continue with ${datasetPreview.length}?`,
      );
      if (!ok) return;
    }
    onSubmit(cfg, datasetPreview);
  };

  return (
    <form className={styles.form} onSubmit={handleStart}>
      <h2>Experiment Configuration</h2>

      <label>
        # words per session
        <input
          type="number"
          min={1}
          value={cfg.number_of_sentences_per_session}
          onChange={(e) => set("number_of_sentences_per_session", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        # practice sessions
        <input
          type="number"
          min={0}
          value={cfg.num_practice_sessions}
          onChange={(e) => set("num_practice_sessions", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        # experiment sessions
        <input
          type="number"
          min={1}
          value={cfg.num_experiment_sessions}
          onChange={(e) => set("num_experiment_sessions", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        Selection key (default Space)
        <KeyPicker
          value={cfg.selection_key}
          onChange={(k) => set("selection_key", k)}
        />
      </label>

      <label>
        Finish-word key (default Enter)
        <KeyPicker
          value={cfg.finish_sentence_key}
          onChange={(k) => set("finish_sentence_key", k)}
        />
      </label>

      <label>
        Gaze source
        <select
          value={cfg.gaze_source}
          onChange={(e) => set("gaze_source", e.target.value as GazeSource)}
        >
          <option value="WebGazer">WebGazer (browser)</option>
          <option value="MouseDebug">MouseDebug</option>
        </select>
      </label>

      <label>
        Gaze sampling interval (ms)
        <input
          type="number"
          min={1}
          value={cfg.gaze_sampling_interval_ms}
          onChange={(e) => set("gaze_sampling_interval_ms", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        Key radius (px)
        <input
          type="number"
          min={10}
          value={cfg.key_radius_px}
          onChange={(e) => set("key_radius_px", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        Key spacing (px, center-to-center extra padding)
        <input
          type="number"
          min={0}
          value={cfg.key_spacing_px}
          onChange={(e) => set("key_spacing_px", parseInt(e.target.value || "0", 10))}
        />
      </label>

      <label>
        Keyboard scale
        <input
          type="number"
          step="0.05"
          min={0.5}
          max={2.5}
          value={cfg.keyboard_scale}
          onChange={(e) => set("keyboard_scale", parseFloat(e.target.value || "1"))}
        />
      </label>

      <label className={styles.fullWidth}>
        Dataset file (in /public)
        <div className={styles.datasetRow}>
          <input
            value={cfg.dataset_file}
            onChange={(e) => set("dataset_file", e.target.value)}
            placeholder="words_8.json"
          />
          <button type="button" onClick={() => tryLoadDataset(cfg.dataset_file)}>
            Load from /public
          </button>
          <label className={styles.upload}>
            ...or upload
            <input type="file" accept=".json,.csv,.txt" onChange={onFileUpload} />
          </label>
        </div>
        {datasetError && <div className={styles.error}>{datasetError}</div>}
        {datasetPreview.length > 0 && (
          <div className={styles.preview}>
            Loaded {datasetPreview.length} words. First three:
            <ol>
              {datasetPreview.slice(0, 3).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
      </label>

      <button type="submit" className={styles.primary}>
        Save Config & Start Experiment →
      </button>
    </form>
  );
}

// Capture-on-press picker so the experimenter can bind any physical key.
function KeyPicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className={styles.keyPicker}>
      <input
        readOnly
        value={value}
        onClick={() => setCapturing(true)}
        onKeyDown={(e) => {
          if (!capturing) return;
          e.preventDefault();
          onChange(e.key === " " ? "Space" : e.key);
          setCapturing(false);
        }}
        placeholder={capturing ? "Press a key…" : "click to capture"}
      />
    </div>
  );
}

// Dataset parsing: JSON array of strings, CSV (one sentence per row), or newline-delimited.
async function parseDataset(res: Response, path: string): Promise<string[]> {
  const text = await res.text();
  return parseDatasetText(text, path);
}

function parseDatasetText(text: string, hint: string): string[] {
  const t = text.trim();
  if (t.startsWith("[")) {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) throw new Error("JSON dataset must be an array of strings");
    return arr.map((x) => String(x)).filter((s) => s.length > 0);
  }
  // CSV / newline-delimited fallback. We take the first column.
  return t
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (hint.endsWith(".csv") && trimmed.includes(",")) {
        // first column
        return trimmed.split(",")[0].replace(/^"|"$/g, "");
      }
      return trimmed;
    })
    .filter((s) => s.length > 0 && !/^#/.test(s));
}
