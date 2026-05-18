import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { KeyDef } from "../types";
import styles from "./KeyboardLayout.module.css";

interface RowKey {
  char: string;
  // Width as a multiple of a letter-key diameter. 1 for letters, larger for
  // the space bar. Hit detection scales with this — see ExperimentSession.
  widthFactor: number;
  // Label override (e.g. "space" for the " " key). Defaults to char.
  label?: string;
}

// QWERTY rows plus a wide space bar. Each entry is one renderable key.
const ROWS: RowKey[][] = [
  "qwertyuiop".split("").map((c) => ({ char: c, widthFactor: 1 })),
  "asdfghjkl".split("").map((c) => ({ char: c, widthFactor: 1 })),
  "zxcvbnm".split("").map((c) => ({ char: c, widthFactor: 1 })),
  [{ char: " ", widthFactor: 6, label: "space" }],
];

interface Props {
  radius: number; // base radius in px (before scale) — half the letter-key height
  spacing: number; // extra px between neighboring keys (gap on top of diameter)
  scale: number;
  hoveredKey: string | null;
  // Reports the absolute key geometry (viewport coordinates) up to the parent
  // each time the layout settles. The parent uses this to do hover detection
  // in viewport space — no DOM measurement on the hot path.
  onLayout?: (keys: KeyDef[]) => void;
}

// QWERTY keyboard. Letter keys are circles; the space key is a wider pill.
// Keys are positioned absolutely in a rounded container so we can guarantee
// non-overlapping shapes regardless of CSS layout quirks.
export const KeyboardLayout = forwardRef<HTMLDivElement, Props>(function KeyboardLayout(
  { radius, spacing, scale, hoveredKey, onLayout },
  ref,
) {
  const r = radius * scale;
  const diameter = r * 2;
  const slot = diameter + spacing; // horizontal slot center-to-center for letters
  const dy = diameter + spacing; // vertical center-to-center between rows

  // Compute key centers in a local coordinate system anchored at the keyboard's
  // top-left corner. We add a half-key margin so circles never bleed out.
  const layout = useMemo(() => {
    type PlacedKey = {
      char: string;
      label: string;
      localX: number;
      localY: number;
      w: number;
      h: number;
    };
    const keys: PlacedKey[] = [];
    const margin = r + 4;
    // Container width is driven by the widest row, including space-key factor.
    const rowWidths = ROWS.map((row) => {
      const totalSlots = row.reduce((acc, k) => acc + k.widthFactor, 0);
      return totalSlots * diameter + (row.length - 1) * spacing;
    });
    const containerW = Math.max(...rowWidths) + margin * 2;
    const containerH = ROWS.length * diameter + (ROWS.length - 1) * spacing + margin * 2;

    ROWS.forEach((row, rowIdx) => {
      const rowW = rowWidths[rowIdx];
      const startX = (containerW - rowW) / 2;
      const y = margin + rowIdx * dy + r;
      let cursorX = startX; // running x where the next key starts
      for (let i = 0; i < row.length; i++) {
        const k = row[i];
        const keyW = k.widthFactor * diameter;
        const cx = cursorX + keyW / 2;
        keys.push({
          char: k.char,
          label: k.label ?? k.char,
          localX: cx,
          localY: y,
          w: keyW,
          h: diameter,
        });
        cursorX += keyW + spacing;
      }
    });
    return { keys, containerW, containerH };
  }, [r, dy, diameter, spacing]);

  // Keep a local ref so we can read the DOM rect from a layout effect (below)
  // and forward the same node to the parent's ref. Inlining layout computation
  // in the ref-callback caused an infinite render loop, because inline ref
  // callbacks re-fire on every render and triggered the parent's setState.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [ref],
  );

  // Report viewport-space key positions whenever geometry actually changes.
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !onLayout) return;
    const rect = el.getBoundingClientRect();
    const keys: KeyDef[] = layout.keys.map((k) => ({
      char: k.char,
      cx: rect.left + k.localX,
      cy: rect.top + k.localY,
      halfW: k.w / 2,
      halfH: k.h / 2,
    }));
    onLayout(keys);
  }, [layout, onLayout]);

  const containerStyle: CSSProperties = {
    width: layout.containerW,
    height: layout.containerH,
    position: "relative",
  };

  return (
    <div className={styles.wrap}>
      <div ref={setContainerRef} className={styles.board} style={containerStyle}>
        {layout.keys.map((k) => {
          const isHover = hoveredKey === k.char;
          // Square keys → circles; non-square (space) → pills.
          const borderRadius = k.w === k.h ? "50%" : k.h / 2;
          return (
            <div
              key={k.char}
              className={`${styles.key} ${isHover ? styles.hover : ""}`}
              style={{
                width: k.w,
                height: k.h,
                left: k.localX - k.w / 2,
                top: k.localY - k.h / 2,
                fontSize: Math.max(14, r * 0.9),
                borderRadius,
              }}
              // No onClick — selection is via gaze + physical key only.
              aria-label={`key ${k.label}`}
            >
              {k.label}
            </div>
          );
        })}
      </div>
    </div>
  );
});
