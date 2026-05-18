import { useEffect, useRef } from "react";
import { useGaze } from "../gaze/GazeContext";

interface Props {
  // Window of points to keep (older drops off the queue).
  maxPoints?: number;
  // How long each point stays visible before fully faded.
  fadeMs?: number;
}

// Canvas overlay that paints the last N gaze samples as soft fading circles —
// the "heatmap-like trail" visible in the EyeGesturesLite demo
// (https://eyegestures.com/tryLite). Mounted only during calibration so the
// actual text-entry experiment is not contaminated by visible gaze feedback.
export function GazeTrail({ maxPoints = 80, fadeMs = 1800 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { subscribe } = useGaze();
  const pointsRef = useRef<Array<{ x: number; y: number; t: number }>>([]);

  // Keep canvas pixel size in sync with the viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Consume every gaze sample so the trail captures samples emitted between
  // React renders (high-frequency).
  useEffect(() => {
    const unsub = subscribe((s) => {
      if (s.x === null || s.y === null) return;
      pointsRef.current.push({ x: s.x, y: s.y, t: performance.now() });
      if (pointsRef.current.length > maxPoints) pointsRef.current.shift();
    });
    return unsub;
  }, [subscribe, maxPoints]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let rafId = 0;
    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      pointsRef.current = pointsRef.current.filter((p) => now - p.t < fadeMs);
      ctx.globalCompositeOperation = "lighter";
      for (const p of pointsRef.current) {
        const age = (now - p.t) / fadeMs;
        const alpha = Math.max(0, (1 - age) * 0.4);
        const radius = 70 * (1 - age * 0.3);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        grad.addColorStop(0, `rgba(255, 120, 60, ${alpha})`);
        grad.addColorStop(0.4, `rgba(255, 80, 0, ${alpha * 0.5})`);
        grad.addColorStop(1, "rgba(255, 80, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [fadeMs]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        // Below the library's red/blue cursor (z-index: 1000 from eyegestures.css)
        // but above the rest of the page so the trail is visible.
        zIndex: 900,
      }}
    />
  );
}
