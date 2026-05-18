import { useEffect, useRef, useState } from "react";
import type { CalibrationResult, Demographics, GazeSource } from "../types";
import { useGaze } from "../gaze/GazeContext";
import { GazeTrail } from "./GazeTrail";
import styles from "./CalibrationPage.module.css";

interface Props {
  demographics: Demographics;
  gazeSource: GazeSource;
  onChangeSource: (s: GazeSource) => void;
  onDone: (result: CalibrationResult) => void;
}

type Phase = "intro" | "running" | "done";

// Calibration is driven by the underlying gaze library:
//  - EyeGesturesLite renders ~25 red points itself and reports completion
//    via the calibration flag in its onGaze callback (false during, true after).
//  - MouseDebug needs no calibration; the page just records the timestamps.
export function CalibrationPage({
  demographics,
  gazeSource,
  onChangeSource,
  onDone,
}: Props) {
  const { isCalibrating, isActive, calibCount, calibMax, recalibrate } = useGaze();
  const [phase, setPhase] = useState<Phase>("intro");
  const [pickedSource, setPickedSource] = useState<GazeSource>(gazeSource);
  const [libStatus, setLibStatus] = useState<string>("");
  const [libError, setLibError] = useState<string>("");
  const startTimeRef = useRef<number>(0);

  // Mirror the EyeGesturesLite #status / #error DOM elements into React state.
  // The library writes load/init progress to them; this is the only signal we
  // get while waiting for MediaPipe + webcam to come up.
  useEffect(() => {
    if (phase !== "running" || gazeSource !== "EyeGesturesLite") return;
    const statusEl = document.getElementById("status");
    const errorEl = document.getElementById("error");
    if (!statusEl && !errorEl) return;
    const tick = () => {
      setLibStatus((statusEl?.textContent || "").trim());
      setLibError((errorEl?.textContent || "").trim());
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [phase, gazeSource]);

  // Move from "running" to "done" when the library finishes calibrating.
  // For MouseDebug we mark done as soon as the running phase starts.
  useEffect(() => {
    if (phase !== "running") return;
    if (gazeSource === "MouseDebug") {
      setPhase("done");
      return;
    }
    if (isActive && !isCalibrating) {
      setPhase("done");
    }
  }, [phase, gazeSource, isActive, isCalibrating]);

  const begin = () => {
    startTimeRef.current = Date.now();
    if (pickedSource !== gazeSource) onChangeSource(pickedSource);
    setPhase("running");
  };

  const finish = (success: boolean) => {
    const end = Date.now();
    const result: CalibrationResult = {
      participant_id: demographics.participant_id,
      session_id: demographics.session_id,
      calibration_start_time: startTimeRef.current || end,
      calibration_end_time: end,
      calibration_success: success,
      calibration_method:
        gazeSource === "EyeGesturesLite"
          ? "EyeGesturesLite built-in calibration"
          : "MouseDebug (no calibration)",
      notes: "",
    };
    onDone(result);
  };

  if (phase === "intro") {
    return (
      <div className={styles.intro}>
        <h2>Gaze Calibration</h2>

        <div className={styles.sourceRow}>
          <span className={styles.sourceLabel}>Gaze source</span>
          <label>
            <input
              type="radio"
              name="src"
              value="EyeGesturesLite"
              checked={pickedSource === "EyeGesturesLite"}
              onChange={() => setPickedSource("EyeGesturesLite")}
            />
            EyeGesturesLite (webcam)
          </label>
          <label>
            <input
              type="radio"
              name="src"
              value="MouseDebug"
              checked={pickedSource === "MouseDebug"}
              onChange={() => setPickedSource("MouseDebug")}
            />
            MouseDebug
          </label>
        </div>

        {pickedSource === "EyeGesturesLite" ? (
          <p className={styles.note}>
            EyeGesturesLite will request webcam access, then display red points
            across the screen. Look at each one and keep your head still — the
            library finishes calibration automatically.
          </p>
        ) : (
          <p className={styles.note}>
            MouseDebug mode: the mouse cursor stands in for gaze, no real
            calibration is performed.
          </p>
        )}

        <button className={styles.primary} onClick={begin}>
          Begin Calibration
        </button>
      </div>
    );
  }

  if (phase === "running") {
    const progressPct =
      calibMax > 0 ? Math.min(100, (calibCount / calibMax) * 100) : 0;
    return (
      <>
        {gazeSource === "EyeGesturesLite" && (
          <div className={styles.runningBackdrop} />
        )}
        {gazeSource === "EyeGesturesLite" && <GazeTrail />}
        <div className={styles.runningOverlay}>
        <div className={styles.runningCard}>
          <h2>Calibrating…</h2>
          <p>
            Look at each red point as it appears. The library finishes
            automatically; this screen will advance when it's done.
          </p>
          {gazeSource === "EyeGesturesLite" && calibMax > 0 && (
            <div className={styles.progressRow}>
              <div className={styles.progressCount}>
                {calibCount} / {calibMax}
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          {gazeSource === "EyeGesturesLite" && !isActive && (
            <p className={styles.hint}>
              Waiting for the webcam — accept the browser permission prompt if
              you haven't already.
            </p>
          )}
          {gazeSource === "EyeGesturesLite" && libStatus && (
            <p className={styles.libStatus}>EyeGesturesLite: {libStatus}</p>
          )}
          {gazeSource === "EyeGesturesLite" && libError && (
            <>
              <p className={styles.libError}>Error: {libError}</p>
              {/^.*permission.*denied/i.test(libError) && (
                <p className={styles.hint}>
                  Allow webcam access in your browser (address-bar camera icon)
                  and in macOS System Settings → Privacy & Security → Camera,
                  then reload the page (Cmd+Shift+R).
                </p>
              )}
            </>
          )}
          {gazeSource === "EyeGesturesLite" && !isActive && (
            <button
              className={styles.secondary}
              onClick={() => setPhase("intro")}
            >
              Back
            </button>
          )}
        </div>
        </div>
      </>
    );
  }

  // phase === "done"
  return (
    <>
      {gazeSource === "EyeGesturesLite" && <GazeTrail />}
    <div className={styles.intro}>
      <h2>Calibration Complete</h2>
      <p>Verify accuracy by looking around. Continue, or recalibrate.</p>
      <div className={styles.row}>
        <button className={styles.primary} onClick={() => finish(true)}>
          Continue
        </button>
        {gazeSource === "EyeGesturesLite" && (
          <button
            className={styles.secondary}
            onClick={() => {
              startTimeRef.current = Date.now();
              recalibrate();
              setPhase("running");
            }}
          >
            Recalibrate
          </button>
        )}
      </div>
    </div>
    </>
  );
}
