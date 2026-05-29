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

// Reduced 8-letter keyboard for gaze text entry. The alphabet is restricted to
// {a, e, l, n, o, r, s, t} — a set that still composes many short words — laid
// out as two rows of four so each key can be large and well separated, which
// matters for low-accuracy webcam gaze. No space key: targets are single words.
const ROWS: RowKey[][] = [
  "aeln".split("").map((c) => ({ char: c, widthFactor: 1 })),
  "orst".split("").map((c) => ({ char: c, widthFactor: 1 })),
];

// The visible key is drawn a bit smaller than its layout cell. This shrinks the
// *appearance* of each target without touching the hit region (which is reported
// from the full cell + spacing in the effect below), so targets look small and
// clearly separated while selection stays forgiving.
const VISIBLE_KEY_FRACTION = 0.82;

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
  // Compute key centers in a local coordinate system anchored at the keyboard's
  // top-left corner. We add a half-key margin so circles never bleed out.
  //
  // The requested size (radius * scale) is treated as a *desired* size. Because
  // the top row has 10 keys, a large desired size easily exceeds the viewport
  // width; we therefore shrink uniformly so the widest row always fits the
  // available width. On wide screens the keyboard grows to fill the width
  // (= as big as possible); on narrow ones it scales down instead of clipping.
  const layout = useMemo(() => {
    const avail = (typeof window !== "undefined" ? window.innerWidth : 1280) - 32;

    // Width of the widest row (+ side margins) for a given radius/spacing.
    const containerWidthFor = (rr: number, sp: number) => {
      const dia = rr * 2;
      const margin = rr + 4;
      const rowWidths = ROWS.map((row) => {
        const totalSlots = row.reduce((acc, k) => acc + k.widthFactor, 0);
        return totalSlots * dia + (row.length - 1) * sp;
      });
      return Math.max(...rowWidths) + margin * 2;
    };

    let r = radius * scale;
    let sp = spacing;
    const desiredW = containerWidthFor(r, sp);
    if (desiredW > avail) {
      const f = avail / desiredW;
      r *= f;
      sp *= f;
    }

    const diameter = r * 2;
    const dy = diameter + sp; // vertical center-to-center between rows
    const margin = r + 4;

    type PlacedKey = {
      char: string;
      label: string;
      localX: number;
      localY: number;
      w: number;
      h: number;
    };
    const keys: PlacedKey[] = [];
    // Container width is driven by the widest row, including space-key factor.
    const rowWidths = ROWS.map((row) => {
      const totalSlots = row.reduce((acc, k) => acc + k.widthFactor, 0);
      return totalSlots * diameter + (row.length - 1) * sp;
    });
    const containerW = Math.max(...rowWidths) + margin * 2;
    const containerH = ROWS.length * diameter + (ROWS.length - 1) * sp + margin * 2;

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
        cursorX += keyW + sp;
      }
    });
    return { keys, containerW, containerH, r, sp };
  }, [radius, scale, spacing]);

  // Effective radius after fit-scaling — drives font size / shape decisions.
  const r = layout.r;

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
  //
  // The reported hit area is intentionally larger than the visible key: we
  // expand each half-extent by half the inter-key spacing so a key's hit region
  // reaches the midpoint toward its neighbours. The parent treats these as
  // rectangles, so adjacent regions meet exactly on both axes and tile the whole
  // keyboard with no dead gaps (corners included). Gaze that lands anywhere
  // between widely-spaced keys still selects the nearest one — forgiving for
  // low-accuracy gaze while keeping the visible targets small and well separated.
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !onLayout) return;
    const rect = el.getBoundingClientRect();
    const pad = layout.sp / 2;
    const keys: KeyDef[] = layout.keys.map((k) => ({
      char: k.char,
      cx: rect.left + k.localX,
      cy: rect.top + k.localY,
      halfW: k.w / 2 + pad,
      halfH: k.h / 2 + pad,
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
          // Visible size is shrunk from the layout cell; centre stays put so the
          // hit region (full cell + spacing) is unaffected.
          const vw = k.w * VISIBLE_KEY_FRACTION;
          const vh = k.h * VISIBLE_KEY_FRACTION;
          // Square keys → circles; non-square (space) → pills.
          const borderRadius = vw === vh ? "50%" : vh / 2;
          return (
            <div
              key={k.char}
              className={`${styles.key} ${isHover ? styles.hover : ""}`}
              style={{
                width: vw,
                height: vh,
                left: k.localX - vw / 2,
                top: k.localY - vh / 2,
                fontSize: Math.max(14, r * 0.9 * VISIBLE_KEY_FRACTION),
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
