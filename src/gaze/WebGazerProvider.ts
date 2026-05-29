import { useEffect, useRef, useState } from "react";
// @ts-expect-error — webgazer ships no types
import webgazer from "webgazer";
import type { GazeSample } from "../types";

// WebGazer provider — browser-native gaze tracking based on the
// brownhci/WebGazer.js library (https://github.com/brownhci/WebGazer).
//
// Pipeline: TensorFlow.js FaceMesh → eye-pixel patches → ridge regression
// mapping (x, y) screen coordinates. Calibration is supervised: the host page
// renders dots and feeds clicks to `webgazer.recordScreenPosition(x, y, 'click')`.
// The mapping persists across calls until `webgazer.clearData()` is called.

interface WebGazerGlobal {
  begin(): Promise<unknown>;
  end?(): void;
  pause?(): void;
  resume?(): void;
  setGazeListener(cb: (data: { x: number; y: number } | null, t: number) => void): WebGazerGlobal;
  clearGazeListener?(): WebGazerGlobal;
  showVideoPreview(b: boolean): WebGazerGlobal;
  showPredictionPoints(b: boolean): WebGazerGlobal;
  showFaceOverlay(b: boolean): WebGazerGlobal;
  showFaceFeedbackBox(b: boolean): WebGazerGlobal;
  applyKalmanFilter(b: boolean): WebGazerGlobal;
  removeMouseEventListeners(): WebGazerGlobal;
  recordScreenPosition(x: number, y: number, eventType: string): void;
  clearData(): Promise<unknown> | void;
}

const wg = webgazer as WebGazerGlobal;

// WebGazer is a global singleton — begin() must only be called once per page
// load. This module-level promise gates all consumers behind a single init.
let beginPromise: Promise<void> | null = null;

// MediaPipe's WASM binary emits diagnostic lines through emscripten's stdout,
// which surfaces in the browser console as repetitive `I0528 …` / `W0528 …`
// messages (Google glog format: severity letter + MMDD + HH:MM:SS.uuuuuu).
// These are informational, not actionable — silencing them keeps the dev
// console readable. We narrowly target the glog prefix so genuine library
// warnings still come through.
const GLOG_LINE = /^[IWEF]\d{4} \d{2}:\d{2}:\d{2}\.\d+ /;
function silenceMediaPipeGlog(): void {
  const wrap = (orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" && GLOG_LINE.test(first)) return;
      orig(...args);
    };
  // eslint-disable-next-line no-console
  console.log = wrap(console.log);
  // eslint-disable-next-line no-console
  console.warn = wrap(console.warn);
  // eslint-disable-next-line no-console
  console.error = wrap(console.error);
}

async function ensureStarted(): Promise<void> {
  if (!beginPromise) {
    silenceMediaPipeGlog();
    beginPromise = (async () => {
      await wg.begin();
      // Defaults: show camera + face overlay so the participant can see they
      // are being tracked, hide the green prediction dot (we render our own
      // visualisations elsewhere), and rely on WebGazer's built-in Kalman
      // smoothing for stability.
      wg.showVideoPreview(true);
      wg.showFaceOverlay(true);
      wg.showFaceFeedbackBox(true);
      wg.showPredictionPoints(false);
      wg.applyKalmanFilter(true);
      // WebGazer attaches mouse listeners that record every click as
      // calibration. We drive calibration explicitly via the React UI, so
      // remove the implicit listeners to avoid polluting training.
      wg.removeMouseEventListeners();
    })();
  }
  return beginPromise;
}

export interface WebGazerState {
  // True once at least one gaze sample has arrived.
  active: boolean;
  // True once webgazer.begin() has resolved (camera up, model loaded).
  ready: boolean;
  // Last initialisation error, if any.
  error: string | null;
  // Feed a calibration sample at (x, y) viewport px. Called by the
  // calibration UI on each click.
  recordPoint: (x: number, y: number) => void;
  // Drop all calibration training data (full reset of the regression model).
  clearCalibration: () => void;
}

export function useWebGazerGaze(
  onSample: ((s: GazeSample) => void) | null,
): WebGazerState {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  useEffect(() => {
    if (!onSample) {
      setActive(false);
      return;
    }
    let stopped = false;
    (async () => {
      try {
        await ensureStarted();
        if (stopped) return;
        setReady(true);
        wg.setGazeListener((data) => {
          if (stopped || !data) return;
          setActive(true);
          const { x, y } = data;
          const sample: GazeSample = {
            timestamp: Date.now(),
            left_eye_x: null,
            left_eye_y: null,
            right_eye_x: null,
            right_eye_y: null,
            x: typeof x === "number" ? x : null,
            y: typeof y === "number" ? y : null,
            raw_event: { source: "WebGazer" },
          };
          onSampleRef.current?.(sample);
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        console.error("[WebGazer] init failed", err);
        setError(msg);
      }
    })();

    return () => {
      stopped = true;
      try {
        wg.clearGazeListener?.();
      } catch {
        // ignore
      }
      setActive(false);
    };
  }, [onSample]);

  const recordPoint = (x: number, y: number) => {
    try {
      wg.recordScreenPosition(x, y, "click");
    } catch (err) {
      console.warn("[WebGazer] recordScreenPosition failed", err);
    }
  };

  const clearCalibration = () => {
    try {
      wg.clearData();
    } catch (err) {
      console.warn("[WebGazer] clearData failed", err);
    }
  };

  return { active, ready, error, recordPoint, clearCalibration };
}
