import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGaze } from "../gaze/GazeContext";
import { DataLogger, formatTrialId } from "../logger/DataLogger";
import type {
  ExperimentConfigData,
  GazeSample,
  KeyDef,
  SessionType,
  TrialSummary,
} from "../types";
import { KeyboardLayout } from "./KeyboardLayout";
import { DebugOverlay } from "./DebugOverlay";
import { WebGazerCalibrator } from "./WebGazerCalibrator";
import styles from "./ExperimentSession.module.css";

// How long (ms) a key must remain the raw gaze hover before it becomes the
// committed (highlighted + selectable) key. Debounces flicker; small enough to
// not feel sluggish.
const HOVER_DWELL_MS = 150;

interface Props {
  config: ExperimentConfigData;
  // The words shown in this session, one per trial.
  words: string[];
  // Session context — drives the header and the data tagging in the logger.
  sessionType: SessionType;
  sessionIndex: number; // 1-based within its type
  sessionTotal: number; // total sessions of this type for the day
  // Shared logger for the whole day's run. The session has already been started
  // (logger.startSession) by the parent before this component mounts.
  logger: DataLogger;
  showDebugOverlay: boolean;
  onFinished: () => void;
}

export function ExperimentSession({
  config,
  words,
  sessionType,
  sessionIndex,
  sessionTotal,
  logger,
  showDebugOverlay,
  onFinished,
}: Props) {
  const {
    subscribe,
    isActive,
    clearCalibration,
    source: gazeSource,
  } = useGaze();

  // The shared day-logger, held in a ref so effects don't re-bind on parent
  // re-renders (its identity is stable for the whole run anyway).
  const loggerRef = useRef<DataLogger>(logger);
  loggerRef.current = logger;

  const [trialIndex, setTrialIndex] = useState(0); // 0-based within the session
  const [typedText, setTypedText] = useState("");
  const [keyDefs, setKeyDefs] = useState<KeyDef[]>([]);

  // Refs that are read in event handlers without re-binding effects each render.
  // hoveredKeyRef holds the *committed* (debounced) hover used for highlight +
  // selection; rawHoverRef is the instantaneous hover, logged per sample.
  const hoveredKeyRef = useRef<string | null>(null);
  const rawHoverRef = useRef<string | null>(null);
  // Dwell-debounce bookkeeping: a candidate key must remain the raw hover for
  // HOVER_DWELL_MS before it becomes the committed hover, so the highlight does
  // not flicker as gaze jitters across key boundaries.
  const pendingKeyRef = useRef<string | null>(null);
  const pendingSinceRef = useRef<number>(0);
  const lastGazeRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const lastSampleRef = useRef<GazeSample | null>(null);
  const keyDefsRef = useRef<KeyDef[]>([]);
  keyDefsRef.current = keyDefs;
  // char → key centre, for logging the current target's position alongside gaze.
  const keyPosRef = useRef<Map<string, { cx: number; cy: number }>>(new Map());
  const typedRef = useRef<string>("");
  typedRef.current = typedText;
  const trialActiveRef = useRef<boolean>(false);
  const inputIndexRef = useRef<number>(0);
  // The currently-held tracked key (selection/finish), captured at key-down so
  // key-up can emit one row carrying both the down-time and up-time.
  const keyDownRef = useRef<{
    key: string;
    isFinish: boolean;
    downTime: number;
    gx: number | null;
    gy: number | null;
    hovered: string | null;
    targetChar: string | null;
    targetKeyX: number | null;
    targetKeyY: number | null;
    selectedChar: string | null;
    inputIndex: number | null;
    typedSoFar: string | null;
    willComplete: boolean;
  } | null>(null);

  // Mid-experiment recalibration overlay state. The 9-dot calibrator fires
  // onComplete when all dots are clicked the required number of times; until
  // then we suspend trial input via recalibActiveRef.
  const [recalibActive, setRecalibActive] = useState(false);
  const recalibActiveRef = useRef<boolean>(false);
  recalibActiveRef.current = recalibActive;

  const targetWord = words[trialIndex] ?? "";
  // Latest target word, readable from gaze/key handlers without re-binding.
  const targetWordRef = useRef<string>(targetWord);
  targetWordRef.current = targetWord;

  // The current intended letter (next to enter) and its key centre.
  const currentTarget = (): { char: string | null; x: number | null; y: number | null } => {
    const ch = targetWordRef.current[typedRef.current.length] ?? null;
    if (ch === null) return { char: null, x: null, y: null };
    const pos = keyPosRef.current.get(ch);
    return { char: ch, x: pos?.cx ?? null, y: pos?.cy ?? null };
  };

  // Display state for the hovered key, driven by the debounced committed hover.
  const [hoveredKeyDisplay, setHoveredKeyDisplay] = useState<string | null>(null);

  // Hover detection helper — pure math, no DOM measurement on hot path.
  // Each key's hit region is a rectangle centred at (cx, cy) with half-extents
  // (halfW, halfH). Those half-extents already include half the inter-key
  // spacing (see KeyboardLayout), so neighbouring rectangles meet exactly at the
  // midpoints on BOTH axes and therefore tile the keyboard area with no gaps —
  // including the diagonal corners that a circular/elliptical region would leave
  // dead. The gaze point is inside when |dx| <= halfW and |dy| <= halfH; if it
  // somehow falls inside more than one (only possible on a shared edge), the key
  // whose centre is closest wins.
  const computeHover = useCallback(
    (gx: number | null, gy: number | null): string | null => {
      if (gx === null || gy === null) return null;
      let best: { key: string; d: number } | null = null;
      const keys = keyDefsRef.current;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const dx = gx - k.cx;
        const dy = gy - k.cy;
        if (Math.abs(dx) <= k.halfW && Math.abs(dy) <= k.halfH) {
          const d = dx * dx + dy * dy;
          if (!best || d < best.d) best = { key: k.char, d };
        }
      }
      return best ? best.key : null;
    },
    [],
  );

  // Subscribe to gaze samples. Logs every sample (with the raw instantaneous
  // hover for data fidelity) and updates the debounced committed hover that
  // drives the highlight and selection.
  useEffect(() => {
    const unsub = subscribe((sample) => {
      lastSampleRef.current = sample;
      lastGazeRef.current = { x: sample.x, y: sample.y };
      const raw = computeHover(sample.x, sample.y);
      rawHoverRef.current = raw;

      // Dwell debounce: only commit a new hover once it has been the raw hover
      // continuously for HOVER_DWELL_MS. This adds a little latency but stops the
      // highlight from flashing as gaze flickers between adjacent keys.
      const now = sample.timestamp;
      if (raw === hoveredKeyRef.current) {
        // Already committed — keep the candidate aligned so brief excursions
        // need the full dwell again.
        pendingKeyRef.current = raw;
        pendingSinceRef.current = now;
      } else if (raw !== pendingKeyRef.current) {
        pendingKeyRef.current = raw;
        pendingSinceRef.current = now;
      } else if (now - pendingSinceRef.current >= HOVER_DWELL_MS) {
        hoveredKeyRef.current = raw;
        setHoveredKeyDisplay(raw);
      }

      if (trialActiveRef.current) {
        loggerRef.current.logGaze(sample, raw, currentTarget());
      }
    });
    return unsub;
  }, [subscribe, computeHover]);

  // Start a new trial whenever trialIndex changes.
  useEffect(() => {
    if (trialIndex >= words.length) return;
    setTypedText("");
    typedRef.current = "";
    inputIndexRef.current = 0;
    // Trials are 1-based within the session (trial_001 .. trial_0NN).
    loggerRef.current.startTrial(trialIndex + 1, words[trialIndex]);
    trialActiveRef.current = true;
    return () => {
      // If we unmount mid-trial, end it so files are still produced.
      if (trialActiveRef.current) {
        loggerRef.current.endTrial(typedRef.current);
        trialActiveRef.current = false;
      }
    };
  }, [trialIndex, words]);

  // Physical key handling. Each press is logged as TWO rows — a *_down event at
  // key-down and a *_up event at key-up — so the keyboard down-time and up-time
  // each appear as their own time-ordered entry. The character is appended on
  // key-down (responsive), but the trial only advances on key-up, so a
  // word-completing press records both its down and up rows within the same
  // trial before we move on. The selection key enters the highlighted key; the
  // word advances automatically once all letters are entered.
  useEffect(() => {
    const keyDownInfo = keyDownRef;

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key === " " ? "Space" : e.key;
      const isSelect = k === config.selection_key;
      const isFinish = k === config.finish_sentence_key;
      if (!isSelect && !isFinish) return;
      // Prevent default for Space (scroll) / Enter (form submit).
      e.preventDefault();
      // Ignore OS auto-repeat and any press while another tracked key is held.
      if (e.repeat || keyDownInfo.current) return;
      if (!trialActiveRef.current || recalibActiveRef.current) return;

      const hovered = hoveredKeyRef.current;
      const { x: gx, y: gy } = lastGazeRef.current;
      const downTime = Date.now();
      // Intended target for THIS press (captured before the character append).
      const tgt = currentTarget();

      let selectedChar: string | null = null;
      let inputIndex: number | null = null;
      let typedSoFar: string | null = null;
      let willComplete = false;

      if (isSelect && hovered !== null) {
        const newTyped = typedRef.current + hovered;
        typedRef.current = newTyped;
        setTypedText(newTyped);
        inputIndexRef.current += 1;
        selectedChar = hovered;
        inputIndex = inputIndexRef.current;
        typedSoFar = newTyped;
        const target = words[trialIndex] ?? "";
        willComplete = target.length > 0 && newTyped.length >= target.length;
      }

      keyDownInfo.current = {
        key: k,
        isFinish,
        downTime,
        gx,
        gy,
        hovered,
        targetChar: tgt.char,
        targetKeyX: tgt.x,
        targetKeyY: tgt.y,
        selectedChar,
        inputIndex,
        typedSoFar,
        willComplete,
      };

      // Log the key-DOWN as its own row (down-time = event time).
      loggerRef.current.logKeyEvent({
        eventType: isFinish ? "finish_down" : "selection_down",
        time: downTime,
        physicalKey: k,
        downTime,
        upTime: null,
        holdMs: null,
        gazeX: gx,
        gazeY: gy,
        hoveredKey: hovered,
        targetChar: tgt.char,
        targetKeyX: tgt.x,
        targetKeyY: tgt.y,
        selectedCharacter: selectedChar,
        inputIndex,
        typedTextSoFar: typedSoFar,
      });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key === " " ? "Space" : e.key;
      const d = keyDownInfo.current;
      if (!d || d.key !== k) return;
      keyDownInfo.current = null;
      if (!trialActiveRef.current) return;

      const upTime = Date.now();
      const { x: ugx, y: ugy } = lastGazeRef.current;
      // target_char tracks the *current* target at this timestamp, so the column
      // stays monotonic across the whole log (the gaze samples right after the
      // key-down already advanced to the next letter). The letter this press
      // aimed at is still recoverable from input_index.
      const upTarget = currentTarget();
      loggerRef.current.logKeyEvent({
        eventType: d.isFinish ? "finish_up" : "selection_up",
        time: upTime,
        physicalKey: d.key,
        downTime: d.downTime,
        upTime,
        holdMs: upTime - d.downTime,
        gazeX: ugx,
        gazeY: ugy,
        hoveredKey: hoveredKeyRef.current,
        targetChar: upTarget.char,
        targetKeyX: upTarget.x,
        targetKeyY: upTarget.y,
        selectedCharacter: d.selectedChar,
        inputIndex: d.inputIndex,
        typedTextSoFar: d.typedSoFar,
      });

      if (d.isFinish || d.willComplete) endCurrentTrial();
    };

    const endCurrentTrial = () => {
      const finishedTyped = typedRef.current;
      const summary: TrialSummary | null = loggerRef.current.endTrial(finishedTyped);
      trialActiveRef.current = false;
      if (summary && trialIndex + 1 >= words.length) {
        // Last word of the session — tell the parent to advance.
        onFinished();
      } else {
        setTrialIndex((i) => i + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [config.selection_key, config.finish_sentence_key, trialIndex, words.length, onFinished]);

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
    const m = new Map<string, { cx: number; cy: number }>();
    for (const k of keys) m.set(k.char, { cx: k.cx, cy: k.cy });
    keyPosRef.current = m;
    loggerRef.current.setKeyboardLayout(keys);
  }, []);

  const targetCharIndex = typedText.length;
  const renderedTarget = useMemo(() => {
    return targetWord.split("").map((ch, i) => {
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
  }, [targetWord, targetCharIndex, typedText]);

  const trialId = formatTrialId(trialIndex + 1);
  const sessionLabel =
    sessionType === "practice" ? "Practice" : "Experiment";

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.metaLeft}>
          {sessionLabel} session {sessionIndex} / {sessionTotal} · word{" "}
          {trialIndex + 1} / {words.length}
        </div>
        <div className={styles.metaRight}>
          gaze: <strong>{config.gaze_source}</strong>{" "}
          {isActive ? <span className={styles.dotOk} /> : <span className={styles.dotBad} />}
          {gazeSource === "WebGazer" && (
            <button
              type="button"
              className={styles.recalibBtn}
              onClick={() => {
                clearCalibration();
                setRecalibActive(true);
              }}
              disabled={recalibActive}
              title="Pause the trial and re-run WebGazer calibration."
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
          {" "}The word advances automatically once all letters are entered.
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

      {recalibActive && gazeSource === "WebGazer" && (
        <WebGazerCalibrator onComplete={() => setRecalibActive(false)} />
      )}
    </div>
  );
}
