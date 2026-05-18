import { useEffect, useRef, useState } from "react";
import type { GazeSample } from "../types";

// EyeGesturesLite provider — browser-native gaze tracking.
//
// EyeGesturesLite is loaded from CDN in index.html and exposes a global
// `EyeGestures` constructor:
//   new EyeGestures(videoElementId, onGaze)
// where onGaze(point, calibration) is called repeatedly:
//   point        : [x, y] in viewport pixels
//   calibration  : TRUE while the library is still walking calibration points
//                  (calib_counter < calib_max), FALSE once calibration finishes.
//                  Note: the upstream README claims the inverse — the source is
//                  what we follow (`t = this.calib_counter < this.calib_max`).
//
// Calibration is rendered by the library itself (red points + a blue cursor),
// matching the reference flow in https://github.com/NativeSensors/EyeGesturesLite.

interface EyeGesturesInstance {
  start(): void;
  stop(): void;
  invisible(): void;
  visible(): void;
  recalibrate(): void;
  // Plain (non-private) JS instance fields readable from outside:
  calib_counter?: number;
  calib_max?: number;
}

type EyeGesturesCtor = new (
  videoId: string,
  onGaze: (point: [number, number], calibration: boolean) => void,
) => EyeGesturesInstance;

declare global {
  interface Window {
    EyeGestures?: EyeGesturesCtor;
  }
}

// Must be "video" — the library's processing tick uses a hardcoded
// document.getElementById("video"), not the id passed to the constructor.
const VIDEO_ID = "video";

export interface EyeGesturesLiteState {
  // True once the library has produced at least one sample.
  active: boolean;
  // True while the library is still walking calibration points.
  isCalibrating: boolean;
  // Number of calibration points already completed (0 .. calibMax).
  calibCount: number;
  // Total number of calibration points the library will visit.
  calibMax: number;
  // Returns true if the library is loaded and ready to be started.
  ready: boolean;
  // Trigger a fresh calibration cycle.
  recalibrate: () => void;
}

export function useEyeGesturesLiteGaze(
  onSample: ((s: GazeSample) => void) | null,
): EyeGesturesLiteState {
  const [active, setActive] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibCount, setCalibCount] = useState(0);
  const [calibMax, setCalibMax] = useState(0);
  const [ready, setReady] = useState(typeof window !== "undefined" && !!window.EyeGestures);
  const instanceRef = useRef<EyeGesturesInstance | null>(null);
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  // The CDN scripts may not have loaded yet on first render; poll briefly.
  // After ~5s of failure we write a hint to the #error DOM element so the
  // CalibrationPage UI surfaces it.
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let elapsed = 0;
    const tick = () => {
      if (cancelled) return;
      if (window.EyeGestures) {
        setReady(true);
        return;
      }
      elapsed += 100;
      if (elapsed === 5000) {
        const el = document.getElementById("error");
        if (el) {
          el.textContent =
            "EyeGesturesLite did not register window.EyeGestures. Check that /vendor/ml.min.js, /vendor/math.min.js, and /vendor/eyegestures.js loaded (Network tab).";
        }
        console.error(
          "EyeGesturesLite vendor scripts did not register window.EyeGestures after 5s",
        );
      }
      window.setTimeout(tick, 100);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!onSample || !ready) {
      setActive(false);
      return;
    }
    const Ctor = window.EyeGestures;
    if (!Ctor) return;

    let stopped = false;
    let instance: EyeGesturesInstance | null = null;

    try {
      console.log("[EyeGesturesLite] constructing with video id =", VIDEO_ID);
      instance = new Ctor(VIDEO_ID, (point, calibration) => {
        if (stopped) return;
        // calibration === true while still calibrating, false when finished
        // (see comment at top of file).
        setIsCalibrating(!!calibration);
        setActive(true);
        // Read the library's internal counter so we can display progress.
        // These are plain JS instance fields, not `#private`, so accessible.
        const inst = instanceRef.current;
        if (inst) {
          const count = typeof inst.calib_counter === "number" ? inst.calib_counter : 0;
          const max = typeof inst.calib_max === "number" ? inst.calib_max : 0;
          setCalibCount(count);
          if (max > 0) setCalibMax(max);
        }
        const [x, y] = point;
        const sample: GazeSample = {
          timestamp: Date.now(),
          left_eye_x: null,
          left_eye_y: null,
          right_eye_x: null,
          right_eye_y: null,
          x: typeof x === "number" ? x : null,
          y: typeof y === "number" ? y : null,
          raw_event: {
            source: "EyeGesturesLite",
            calibration: !!calibration,
          },
        };
        onSampleRef.current?.(sample);
      });
      instanceRef.current = instance;
      console.log("[EyeGesturesLite] calling start()");
      instance.start();
    } catch (err) {
      console.error("[EyeGesturesLite] failed to start", err);
      const el = document.getElementById("error");
      if (el) el.textContent = `Initialization error: ${(err as Error).message}`;
    }

    return () => {
      stopped = true;
      try {
        instance?.stop();
      } catch {
        // ignore
      }
      instanceRef.current = null;
      setActive(false);
      setIsCalibrating(true);
      setCalibCount(0);
    };
    // We deliberately exclude `active` from deps: the callback updates it,
    // and rerunning the effect would reinstantiate the library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSample, ready]);

  const recalibrate = () => {
    setIsCalibrating(true);
    setCalibCount(0);
    try {
      instanceRef.current?.recalibrate();
    } catch (err) {
      console.warn("EyeGesturesLite: recalibrate failed", err);
    }
  };

  return { active, isCalibrating, calibCount, calibMax, ready, recalibrate };
}
