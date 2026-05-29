import { useEffect, useRef } from "react";
import { useGaze } from "../gaze/GazeContext";

interface Props {
  // Diameter of the cursor ring in px.
  size?: number;
}

// A precise gaze cursor: a single ring that tracks the latest gaze point.
// Unlike GazeTrail (a fading heat trail), this gives the participant a clear,
// crisp pointer of where the system thinks they are looking — useful while
// typing so they can tell which key the gaze is over.
//
// To stay smooth without re-rendering React on every high-frequency sample, we
// subscribe imperatively and move the DOM node via `transform` inside a rAF
// loop.
export function GazeCursor({ size = 28 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { subscribe } = useGaze();
  const latest = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const unsub = subscribe((s) => {
      latest.current = { x: s.x, y: s.y };
    });
    return unsub;
  }, [subscribe]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const { x, y } = latest.current;
        if (x === null || y === null) {
          el.style.opacity = "0";
        } else {
          el.style.opacity = "1";
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: size,
        height: size,
        marginLeft: 0,
        marginTop: 0,
        borderRadius: "50%",
        border: "2px solid rgba(0, 153, 255, 0.9)",
        background: "rgba(0, 153, 255, 0.18)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.6), 0 0 10px rgba(0,153,255,0.5)",
        pointerEvents: "none",
        opacity: 0,
        zIndex: 950,
        transition: "opacity 0.15s ease",
        willChange: "transform",
      }}
    />
  );
}
