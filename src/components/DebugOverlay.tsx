import styles from "./DebugOverlay.module.css";

interface Props {
  gazeX: number | null;
  gazeY: number | null;
  hoveredKey: string | null;
  trialId: string;
  typedText: string;
  sourceActive: boolean;
}

export function DebugOverlay({ gazeX, gazeY, hoveredKey, trialId, typedText, sourceActive }: Props) {
  return (
    <div className={styles.overlay}>
      <div><strong>gaze_x</strong>: {gazeX === null ? "null" : gazeX.toFixed(1)}</div>
      <div><strong>gaze_y</strong>: {gazeY === null ? "null" : gazeY.toFixed(1)}</div>
      <div><strong>hovered_key</strong>: {hoveredKey ?? "—"}</div>
      <div><strong>trial_id</strong>: {trialId}</div>
      <div><strong>source</strong>: {sourceActive ? "active" : "inactive"}</div>
      <div className={styles.typed}><strong>typed</strong>: {typedText}</div>
    </div>
  );
}
