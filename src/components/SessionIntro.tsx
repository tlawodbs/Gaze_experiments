import type { CSSProperties } from "react";
import type { SessionType } from "../types";

interface Props {
  sessionType: SessionType;
  sessionIndex: number; // 1-based within type
  sessionTotal: number;
  wordCount: number;
  selectionKey: string;
  onStart: () => void;
}

// Interstitial shown before each session in a day's run. Gives the participant
// a moment to rest and explains what the upcoming session is.
export function SessionIntro({
  sessionType,
  sessionIndex,
  sessionTotal,
  wordCount,
  selectionKey,
  onStart,
}: Props) {
  const isPractice = sessionType === "practice";
  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>
          {isPractice
            ? "Practice session"
            : `Experiment session ${sessionIndex} of ${sessionTotal}`}
        </h2>
        <p>
          You will type <strong>{wordCount}</strong> word
          {wordCount === 1 ? "" : "s"}, one at a time.
        </p>
        <p style={{ color: "#555" }}>
          Look at a key so it highlights and press <kbd style={kbd}>{selectionKey}</kbd>{" "}
          to enter it. Each word advances automatically once all its letters are
          entered. There is no correction — typing errors are kept.
        </p>
        {isPractice && (
          <p style={{ color: "#777", fontSize: "0.9rem" }}>
            This practice session is recorded but is meant for warm-up. The five
            experiment sessions follow.
          </p>
        )}
        <button style={primary} onClick={onStart}>
          {isPractice ? "Start practice →" : "Start session →"}
        </button>
      </div>
    </div>
  );
}

const wrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "70vh",
  padding: "2rem",
};

const card: CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "#fff",
  border: "1px solid #e3e8ef",
  borderRadius: 14,
  padding: "1.8rem 2rem",
  boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
  lineHeight: 1.5,
};

const primary: CSSProperties = {
  marginTop: "0.8rem",
  padding: "0.7rem 1.4rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#fff",
  background: "#0d6efd",
  border: "none",
  borderRadius: 9,
  cursor: "pointer",
};

const kbd: CSSProperties = {
  background: "#f1f3f5",
  border: "1px solid #ced4da",
  borderRadius: 5,
  padding: "0.05rem 0.4rem",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: "0.9em",
};
