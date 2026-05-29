import { useEffect, useMemo, useRef, useState } from "react";
import { useGaze } from "../gaze/GazeContext";
import styles from "./WebGazerCalibrator.module.css";

// 9-dot click-driven calibration for WebGazer.js.
//
// Renders nine red dots in a 3x3 grid that covers the viewport. The participant
// must click each dot `clicksPerPoint` times; every click feeds the position
// into WebGazer via `recordCalibrationPoint(x, y)`, which trains the
// ridge-regression mapping. Dots turn orange when partially trained and green
// once complete. When all nine dots are green, `onComplete()` is fired.

interface Props {
  clicksPerPoint?: number;
  onComplete: () => void;
}

// Viewport-relative positions for the 3x3 grid. 10/50/90% leaves enough
// breathing room from window chrome that the dots don't clip behind scrollbars.
const POSITIONS: Array<[number, number]> = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
];

export function WebGazerCalibrator({ clicksPerPoint = 5, onComplete }: Props) {
  const { recordCalibrationPoint, error, isReady } = useGaze();
  const [clicks, setClicks] = useState<number[]>(() => Array(POSITIONS.length).fill(0));

  const totalNeeded = POSITIONS.length * clicksPerPoint;
  const totalDone = useMemo(() => clicks.reduce((s, c) => s + c, 0), [clicks]);
  const allDone = totalDone >= totalNeeded;

  // Keep the latest onComplete in a ref so the completion timer below does NOT
  // depend on its identity. WebGazer pushes gaze samples continuously, which
  // re-renders this component (and the parent) many times per second; if the
  // effect depended on `onComplete`, each re-render would create a fresh
  // callback, tearing down and rescheduling the timeout faster than it could
  // ever fire — leaving calibration stuck and never advancing.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!allDone) return;
    // Brief delay so the final dot's "done" state (and the "Finalizing…"
    // overlay) is visible before we move on.
    const t = window.setTimeout(() => onCompleteRef.current(), 600);
    return () => window.clearTimeout(t);
  }, [allDone]);

  const handleDotClick = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (clicks[i] >= clicksPerPoint) return;
    // Use the dot's actual centre (which is what we want WebGazer to learn),
    // not the precise click position, so all training samples for one dot map
    // to the same target screen point.
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    recordCalibrationPoint(cx, cy);
    setClicks((cs) => {
      const next = cs.slice();
      next[i] = Math.min(next[i] + 1, clicksPerPoint);
      return next;
    });
  };

  return (
    <div className={styles.root}>
      {error && <div className={styles.error}>WebGazer: {error}</div>}
      {POSITIONS.map(([fx, fy], i) => {
        const c = clicks[i];
        const done = c >= clicksPerPoint;
        const partial = c > 0 && !done;
        const cls = [styles.dot, partial && styles.dotPartial, done && styles.dotDone]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={i}
            type="button"
            className={cls}
            style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
            onClick={(e) => handleDotClick(i, e)}
            disabled={done || !isReady}
            aria-label={`Calibration dot ${i + 1}, ${c}/${clicksPerPoint} clicks`}
          >
            {clicksPerPoint - c}
          </button>
        );
      })}

      <div className={styles.card}>
        <h2>Calibration</h2>
        <p>
          Look at each red dot and click it. Keep clicking until it turns green
          ({clicksPerPoint} clicks per dot).
        </p>
        <div className={styles.progress}>
          {totalDone} / {totalNeeded} clicks
        </div>
        {!isReady && !error && (
          <div className={styles.status}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Initializing webcam &amp; model — please allow camera access…</span>
          </div>
        )}
        {isReady && !allDone && (
          <div className={styles.status}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Training the gaze model as you click…</span>
          </div>
        )}
      </div>

      {allDone && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayCard}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Finalizing calibration…</span>
          </div>
        </div>
      )}
    </div>
  );
}
