import { useEffect, useRef } from "react";
import type { GazeSample } from "../types";

// Mouse debug provider: emits the current mouse position as a gaze sample
// at roughly the configured sampling interval. Used for development without
// a webcam / eye tracker.
export function useMouseDebugGaze(
  onSample: ((s: GazeSample) => void) | null,
  samplingIntervalMs: number,
) {
  const lastPos = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  useEffect(() => {
    if (!onSample) return;
    const handler = (e: MouseEvent) => {
      lastPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [onSample]);

  useEffect(() => {
    if (!onSample) return;
    const interval = Math.max(1, samplingIntervalMs);
    const id = window.setInterval(() => {
      const { x, y } = lastPos.current;
      onSample({
        timestamp: Date.now(),
        left_eye_x: null,
        left_eye_y: null,
        right_eye_x: null,
        right_eye_y: null,
        x,
        y,
        raw_event: { source: "MouseDebug" },
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [onSample, samplingIntervalMs]);
}
