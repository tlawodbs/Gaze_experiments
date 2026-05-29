import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GazeSample, GazeSource } from "../types";
import { useMouseDebugGaze } from "./MouseDebugProvider";
import { useWebGazerGaze } from "./WebGazerProvider";
import { OneEuroFilter } from "../utils/oneEuroFilter";

// Public shape exposed to consumers.
interface GazeContextValue {
  // Latest computed gaze point in viewport coordinates (null when unavailable).
  gazeX: number | null;
  gazeY: number | null;
  // Latest full sample (kept fresh for logging).
  latestSample: GazeSample | null;
  // Subscribe to every gaze sample, including those that arrive between renders.
  // Returns an unsubscribe function.
  subscribe: (cb: (s: GazeSample) => void) => () => void;
  source: GazeSource;
  // True if the provider reports it is actively producing samples.
  isActive: boolean;
  // True once the underlying gaze library is ready to accept calibration /
  // produce samples (camera + model loaded). Always true for MouseDebug.
  isReady: boolean;
  // Last initialisation error from the provider, if any.
  error: string | null;
  // Record one calibration sample at (x, y) viewport px. No-op for MouseDebug.
  recordCalibrationPoint: (x: number, y: number) => void;
  // Drop all calibration training data (full reset). No-op for MouseDebug.
  clearCalibration: () => void;
}

const GazeContext = createContext<GazeContextValue | null>(null);

interface ProviderProps {
  source: GazeSource;
  // Hint for providers that throttle (notably MouseDebug). WebGazer pushes raw.
  samplingIntervalMs: number;
  // One-Euro filter applied to the combined gaze point (x, y) before fan-out.
  // When disabled, the raw point is passed through unchanged.
  smoothingEnabled: boolean;
  smoothingMinCutoff: number;
  smoothingBeta: number;
  children: ReactNode;
}

// Top-level provider that picks the active gaze source and fans out samples.
export function GazeProvider({
  source,
  samplingIntervalMs,
  smoothingEnabled,
  smoothingMinCutoff,
  smoothingBeta,
  children,
}: ProviderProps) {
  const subscribersRef = useRef<Set<(s: GazeSample) => void>>(new Set());
  const [latestSample, setLatestSample] = useState<GazeSample | null>(null);
  const [gazeXY, setGazeXY] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  // Per-axis One-Euro filters. Recreated when params change so the new values
  // take effect immediately. State (xPrev/dxPrev) is intentionally dropped on
  // recreation since param changes invalidate the running estimate anyway.
  const filterXRef = useRef(new OneEuroFilter(smoothingMinCutoff, smoothingBeta));
  const filterYRef = useRef(new OneEuroFilter(smoothingMinCutoff, smoothingBeta));
  useEffect(() => {
    filterXRef.current = new OneEuroFilter(smoothingMinCutoff, smoothingBeta);
    filterYRef.current = new OneEuroFilter(smoothingMinCutoff, smoothingBeta);
  }, [smoothingMinCutoff, smoothingBeta]);
  // Drop filter history when the gaze source switches.
  useEffect(() => {
    filterXRef.current.reset();
    filterYRef.current.reset();
  }, [source]);

  // Latest smoothing settings, read inside the (stable) handleSample callback.
  const smoothingEnabledRef = useRef(smoothingEnabled);
  smoothingEnabledRef.current = smoothingEnabled;

  // Internal handler used by the concrete providers. Memoized so child
  // providers' effects don't tear down on every parent render.
  const handleSample = useCallback((sample: GazeSample) => {
    let gx: number | null = sample.x;
    let gy: number | null = sample.y;
    const hasLeft = sample.left_eye_x !== null && sample.left_eye_y !== null;
    const hasRight = sample.right_eye_x !== null && sample.right_eye_y !== null;
    if (hasLeft && hasRight) {
      gx = ((sample.left_eye_x as number) + (sample.right_eye_x as number)) / 2;
      gy = ((sample.left_eye_y as number) + (sample.right_eye_y as number)) / 2;
    } else if (hasLeft) {
      gx = sample.left_eye_x as number;
      gy = sample.left_eye_y as number;
    } else if (hasRight) {
      gx = sample.right_eye_x as number;
      gy = sample.right_eye_y as number;
    }

    // Smooth the combined point. We use the sample's timestamp so the filter
    // sees true inter-sample dt (important when the source pushes irregularly).
    if (smoothingEnabledRef.current && gx !== null && gy !== null) {
      gx = filterXRef.current.filter(gx, sample.timestamp);
      gy = filterYRef.current.filter(gy, sample.timestamp);
    } else if (gx === null || gy === null) {
      // Reset on dropped samples so the filter doesn't extrapolate across gaps.
      filterXRef.current.reset();
      filterYRef.current.reset();
    }

    const enriched: GazeSample = { ...sample, x: gx, y: gy };
    setLatestSample(enriched);
    setGazeXY({ x: gx, y: gy });
    subscribersRef.current.forEach((cb) => {
      try {
        cb(enriched);
      } catch (err) {
        console.error("Gaze subscriber error", err);
      }
    });
  }, []);

  useMouseDebugGaze(source === "MouseDebug" ? handleSample : null, samplingIntervalMs);
  const webGazer = useWebGazerGaze(
    source === "WebGazer" ? handleSample : null,
  );
  const isActive = source === "MouseDebug" ? true : webGazer.active;
  const isReady = source === "MouseDebug" ? true : webGazer.ready;
  const error = source === "WebGazer" ? webGazer.error : null;

  const recordCalibrationPoint = useCallback(
    (x: number, y: number) => {
      if (source === "WebGazer") webGazer.recordPoint(x, y);
    },
    [source, webGazer],
  );
  const clearCalibration = useCallback(() => {
    if (source === "WebGazer") webGazer.clearCalibration();
  }, [source, webGazer]);

  const subscribe = useCallback((cb: (s: GazeSample) => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  // Reset when the source toggles.
  useEffect(() => {
    setLatestSample(null);
    setGazeXY({ x: null, y: null });
  }, [source]);

  const value: GazeContextValue = {
    gazeX: gazeXY.x,
    gazeY: gazeXY.y,
    latestSample,
    subscribe,
    source,
    isActive,
    isReady,
    error,
    recordCalibrationPoint,
    clearCalibration,
  };

  return <GazeContext.Provider value={value}>{children}</GazeContext.Provider>;
}

export function useGaze(): GazeContextValue {
  const ctx = useContext(GazeContext);
  if (!ctx) throw new Error("useGaze must be used inside <GazeProvider>");
  return ctx;
}
