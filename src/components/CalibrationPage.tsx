import { useRef, useState } from "react";
import type { CalibrationResult, Demographics, GazeSource } from "../types";
import { useGaze } from "../gaze/GazeContext";
import { GazeTrail } from "./GazeTrail";
import { WebGazerCalibrator } from "./WebGazerCalibrator";
import styles from "./CalibrationPage.module.css";

interface Props {
  demographics: Demographics;
  gazeSource: GazeSource;
  onChangeSource: (s: GazeSource) => void;
  onDone: (result: CalibrationResult) => void;
}

type Phase = "intro" | "running" | "done";

// Calibration is driven from the React app for both gaze sources:
//  - WebGazer: WebGazerCalibrator renders a 3x3 grid of click targets. Each
//    click feeds (x, y, 'click') into webgazer.recordScreenPosition, training
//    the regression model. The grid moves to phase "done" automatically.
//  - MouseDebug: no calibration; phase advances immediately.
export function CalibrationPage({
  demographics,
  gazeSource,
  onChangeSource,
  onDone,
}: Props) {
  const { clearCalibration } = useGaze();
  const [phase, setPhase] = useState<Phase>("intro");
  const [pickedSource, setPickedSource] = useState<GazeSource>(gazeSource);
  const startTimeRef = useRef<number>(0);

  const begin = () => {
    startTimeRef.current = Date.now();
    if (pickedSource !== gazeSource) onChangeSource(pickedSource);
    if (pickedSource === "MouseDebug") {
      setPhase("done");
    } else {
      setPhase("running");
    }
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
        gazeSource === "WebGazer"
          ? "WebGazer 9-dot click calibration"
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
              value="WebGazer"
              checked={pickedSource === "WebGazer"}
              onChange={() => setPickedSource("WebGazer")}
            />
            WebGazer (webcam)
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

        {pickedSource === "WebGazer" ? (
          <p className={styles.note}>
            WebGazer will request webcam access, then display 9 red dots across
            the screen. Look at each one and click it 5 times — keep your head
            still while clicking. Dots turn green when complete.
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
    return <WebGazerCalibrator onComplete={() => setPhase("done")} />;
  }

  // phase === "done"
  return (
    <>
      {gazeSource === "WebGazer" && <GazeTrail />}
      <div className={styles.intro}>
        <h2>Calibration Complete</h2>
        <p>Verify accuracy by looking around. Continue, or recalibrate.</p>
        <div className={styles.row}>
          <button className={styles.primary} onClick={() => finish(true)}>
            Continue
          </button>
          {gazeSource === "WebGazer" && (
            <button
              className={styles.secondary}
              onClick={() => {
                startTimeRef.current = Date.now();
                clearCalibration();
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
