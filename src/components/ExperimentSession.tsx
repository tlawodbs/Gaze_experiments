import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGaze } from "../gaze/GazeContext";
import { DataLogger, formatTrialId } from "../logger/DataLogger";
import type {
  Demographics,
  ExperimentConfigData,
  GazeSample,
  KeyDef,
  TrialSummary,
} from "../types";
import { KeyboardLayout } from "./KeyboardLayout";
import { DebugOverlay } from "./DebugOverlay";
import { GazeTrail } from "./GazeTrail";
import styles from "./ExperimentSession.module.css";

interface Props {
  demographics: Demographics;
  config: ExperimentConfigData;
  sentences: string[];
  showDebugOverlay: boolean;
  onFinished: (logger: DataLogger) => void;
}

export function ExperimentSession({
  demographics,
  config,
  sentences,
  showDebugOverlay,
  onFinished,
}: Props) {
  const {
    subscribe,
    isActive,
    isCalibrating,
    calibCount,
    calibMax,
    recalibrate,
    source: gazeSource,
  } = useGaze();

  // Stable logger across the entire session.
  const loggerRef = useRef<DataLogger>(
    new DataLogger(demographics.participant_id, demographics.session_id),
  );

  const [trialIndex, setTrialIndex] = useState(0); // 0-based
  const [typedText, setTypedText] = useState("");
  const [keyDefs, setKeyDefs] = useState<KeyDef[]>([]);

  // Refs that are read in event handlers without re-binding effects each render.
  const hoveredKeyRef = useRef<string | null>(null);
  const lastGazeRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const lastSampleRef = useRef<GazeSample | null>(null);
  const keyDefsRef = useRef<KeyDef[]>([]);
  keyDefsRef.current = keyDefs;
  const typedRef = useRef<string>("");
  typedRef.current = typedText;
  const trialActiveRef = useRef<boolean>(false);
  const inputIndexRef = useRef<number>(0);

  // Mid-experiment recalibration overlay state.
  const [recalibActive, setRecalibActive] = useState(false);
  const recalibActiveRef = useRef<boolean>(false);
  recalibActiveRef.current = recalibActive;
  // Once the library reports calibration finished while the overlay is open,
  // close it automatically and let the trial resume.
  useEffect(() => {
    if (recalibActive && !isCalibrating && isActive) {
      setRecalibActive(false);
    }
  }, [recalibActive, isCalibrating, isActive]);

  const targetSentence = sentences[trialIndex] ?? "";

  // Display state for the hovered key — bumped from raw subscription via rAF.
  const [hoveredKeyDisplay, setHoveredKeyDisplay] = useState<string | null>(null);
  const pendingHoverRef = useRef<string | null>(null);
  const rafScheduledRef = useRef<boolean>(false);

  // Hover detection helper — pure math, no DOM measurement on hot path.
  // Each key is treated as an ellipse with semi-axes (halfW, halfH); the
  // gaze point is inside when (dx/halfW)^2 + (dy/halfH)^2 <= 1. Letter keys
  // are circles (halfW = halfH); the space key is a wide pill. When multiple
  // keys match the gaze, the one with the smallest normalised squared
  // distance wins, which gives a fair tie-break for the wider space key.
  const computeHover = useCallback(
    (gx: number | null, gy: number | null): string | null => {
      if (gx === null || gy === null) return null;
      let best: { key: string; norm: number } | null = null;
      const keys = keyDefsRef.current;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const dx = (gx - k.cx) / k.halfW;
        const dy = (gy - k.cy) / k.halfH;
        const norm = dx * dx + dy * dy;
        if (norm <= 1) {
          if (!best || norm < best.norm) best = { key: k.char, norm };
        }
      }
      return best ? best.key : null;
    },
    [],
  );

  // Subscribe to gaze samples. Logs every sample, updates hovered key.
  useEffect(() => {
    const unsub = subscribe((sample) => {
      lastSampleRef.current = sample;
      lastGazeRef.current = { x: sample.x, y: sample.y };
      const hovered = computeHover(sample.x, sample.y);
      hoveredKeyRef.current = hovered;
      pendingHoverRef.current = hovered;
      if (!rafScheduledRef.current) {
        rafScheduledRef.current = true;
        requestAnimationFrame(() => {
          rafScheduledRef.current = false;
          setHoveredKeyDisplay(pendingHoverRef.current);
        });
      }
      if (trialActiveRef.current) {
        loggerRef.current.logGaze(sample, hovered);
      }
    });
    return unsub;
  }, [subscribe, computeHover]);

  // Start a new trial whenever trialIndex changes.
  useEffect(() => {
    if (trialIndex >= sentences.length) return;
    setTypedText("");
    typedRef.current = "";
    inputIndexRef.current = 0;
    // trialIndex 0 is the practice trial → logged as trial_000.
    loggerRef.current.startTrial(trialIndex, sentences[trialIndex]);
    trialActiveRef.current = true;
    return () => {
      // If we unmount mid-trial, end it so files are still produced.
      if (trialActiveRef.current) {
        loggerRef.current.endTrial(typedRef.current);
        trialActiveRef.current = false;
      }
    };
  }, [trialIndex, sentences]);

  // Physical key handling: selection_key appends, finish_sentence_key ends trial.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key === " " ? "Space" : e.key;
      const isSelect = k === config.selection_key;
      const isFinish = k === config.finish_sentence_key;
      if (!isSelect && !isFinish) return;
      // Prevent default for Space so it doesn't scroll, and for Enter inside form.
      e.preventDefault();
      if (!trialActiveRef.current) return;
      // Suspend input while a recalibration is in progress so participants
      // don't accidentally enter characters while looking at calibration dots.
      if (recalibActiveRef.current) return;

      const hovered = hoveredKeyRef.current;
      const { x: gx, y: gy } = lastGazeRef.current;

      if (isFinish) {
        loggerRef.current.logGazeEvent("finish_key_down", gx, gy, hovered);
        endCurrentTrial();
        return;
      }

      // selection_key path
      loggerRef.current.logGazeEvent("selection_key_down", gx, gy, hovered);
      if (hovered === null) {
        loggerRef.current.logGazeEvent("no_hover_selection", gx, gy, null);
        return; // Spec: log event but do not append a character.
      }
      const newTyped = typedRef.current + hovered;
      typedRef.current = newTyped;
      setTypedText(newTyped);
      inputIndexRef.current += 1;
      loggerRef.current.logCharacter({
        inputIndex: inputIndexRef.current,
        selectedCharacter: hovered,
        hoveredKeyAtSelection: hovered,
        gazeXAtSelection: gx,
        gazeYAtSelection: gy,
        physicalKeyPressed: k,
        typedTextSoFar: newTyped,
      });
    };

    const endCurrentTrial = () => {
      const finishedTyped = typedRef.current;
      const summary: TrialSummary | null = loggerRef.current.endTrial(finishedTyped);
      trialActiveRef.current = false;
      if (summary && trialIndex + 1 >= sentences.length) {
        // Last trial — hand the logger to parent.
        onFinished(loggerRef.current);
      } else {
        setTrialIndex((i) => i + 1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [config.selection_key, config.finish_sentence_key, trialIndex, sentences.length, onFinished]);

  // Recompute key layout when window resizes / scrolls — the layout callback
  // also fires on first render.
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => {
    const bump = () => setLayoutVersion((v) => v + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, []);

  const onKeyboardLayout = useCallback((keys: KeyDef[]) => {
    setKeyDefs(keys);
  }, []);

  const targetCharIndex = typedText.length;
  const renderedTarget = useMemo(() => {
    return targetSentence.split("").map((ch, i) => {
      const cls =
        i < targetCharIndex
          ? typedText[i] === ch
            ? styles.correct
            : styles.wrong
          : i === targetCharIndex
            ? styles.cursor
            : "";
      return (
        <span key={i} className={cls}>
          {ch === " " ? "␣" : ch}
        </span>
      );
    });
  }, [targetSentence, targetCharIndex, typedText]);

  const trialId = formatTrialId(trialIndex);
  // sentences[0] is the practice trial; the remaining N are the real ones.
  const isPractice = trialIndex === 0;
  const realTrialCount = Math.max(0, sentences.length - 1);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.metaLeft}>
          {isPractice
            ? `Practice · ${trialId}`
            : `Trial ${trialIndex} / ${realTrialCount} · ${trialId}`}
        </div>
        <div className={styles.metaRight}>
          gaze: <strong>{config.gaze_source}</strong>{" "}
          {isActive ? <span className={styles.dotOk} /> : <span className={styles.dotBad} />}
          {gazeSource === "EyeGesturesLite" && (
            <button
              type="button"
              className={styles.recalibBtn}
              onClick={() => {
                setRecalibActive(true);
                recalibrate();
              }}
              disabled={recalibActive}
              title="Pause the trial and re-run EyeGesturesLite calibration."
            >
              {recalibActive ? "Recalibrating…" : "Recalibrate"}
            </button>
          )}
        </div>
      </header>

      <section className={styles.target}>
        <div className={styles.label}>Target</div>
        <div className={styles.targetText}>{renderedTarget}</div>
      </section>

      <section className={styles.typed}>
        <div className={styles.label}>Typed</div>
        <div className={styles.typedText}>
          {typedText.length === 0 ? <em>(start typing — look at a key, press {config.selection_key})</em> : typedText}
        </div>
        <div className={styles.help}>
          Press <kbd>{config.selection_key}</kbd> to enter the highlighted key.
          {" "}Press <kbd>{config.finish_sentence_key}</kbd> to finish this sentence.
          {" "}No correction — typing errors are preserved.
        </div>
      </section>

      <KeyboardLayout
        // re-mount on layoutVersion to force recompute via callback ref
        key={layoutVersion}
        radius={config.key_radius_px}
        spacing={config.key_spacing_px}
        scale={config.keyboard_scale}
        hoveredKey={hoveredKeyDisplay}
        onLayout={onKeyboardLayout}
      />

      {showDebugOverlay && (
        <DebugOverlay
          gazeX={lastGazeRef.current.x}
          gazeY={lastGazeRef.current.y}
          hoveredKey={hoveredKeyDisplay}
          trialId={trialId}
          typedText={typedText}
          sourceActive={isActive}
        />
      )}

      {recalibActive && gazeSource === "EyeGesturesLite" && (
        <>
          <div className={styles.recalibBackdrop} />
          <GazeTrail />
          <div className={styles.recalibOverlay}>
            <div className={styles.recalibCard}>
              <h2>Recalibrating…</h2>
              <p>
                Follow each red point until the bar fills. The trial resumes
                automatically when calibration finishes.
              </p>
              {calibMax > 0 && (
                <div className={styles.progressRow}>
                  <div className={styles.progressCount}>
                    {calibCount} / {calibMax}
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${Math.min(100, (calibCount / calibMax) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
