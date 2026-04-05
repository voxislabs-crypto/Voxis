const GRID = [
  ["lawful_good",    "neutral_good",    "chaotic_good"],
  ["lawful_neutral", "true_neutral",    "chaotic_neutral"],
  ["lawful_evil",    "neutral_evil",    "chaotic_evil"],
];

const COL_LABELS = ["Lawful", "Neutral", "Chaotic"];
const ROW_LABELS = ["Good", "Neutral", "Evil"];

const SHORT = {
  lawful_good: "LG",    neutral_good: "NG",    chaotic_good: "CG",
  lawful_neutral: "LN", true_neutral: "TN",    chaotic_neutral: "CN",
  lawful_evil: "LE",    neutral_evil: "NE",    chaotic_evil: "CE",
};

const FULL = {
  lawful_good: "Lawful Good",    neutral_good: "Neutral Good",    chaotic_good: "Chaotic Good",
  lawful_neutral: "Lawful Neutral", true_neutral: "True Neutral", chaotic_neutral: "Chaotic Neutral",
  lawful_evil: "Lawful Evil",    neutral_evil: "Neutral Evil",    chaotic_evil: "Chaotic Evil",
};

// Idle background per row: Good = teal, Neutral = indigo, Evil = rose
const BASE_BG = {
  lawful_good: "rgba(0,200,150,0.07)",    neutral_good: "rgba(0,200,150,0.07)",    chaotic_good: "rgba(0,200,150,0.07)",
  lawful_neutral: "rgba(100,90,220,0.07)", true_neutral: "rgba(100,90,220,0.05)",  chaotic_neutral: "rgba(100,90,220,0.07)",
  lawful_evil: "rgba(210,50,100,0.09)",    neutral_evil: "rgba(210,50,100,0.07)",   chaotic_evil: "rgba(210,50,100,0.09)",
};

const SEL_BG = {
  lawful_good: "rgba(0,200,150,0.28)",     neutral_good: "rgba(0,200,150,0.24)",    chaotic_good: "rgba(0,200,150,0.24)",
  lawful_neutral: "rgba(110,100,255,0.28)", true_neutral: "rgba(110,100,255,0.24)", chaotic_neutral: "rgba(110,100,255,0.28)",
  lawful_evil: "rgba(230,55,105,0.32)",     neutral_evil: "rgba(230,55,105,0.26)",   chaotic_evil: "rgba(230,55,105,0.36)",
};

const SEL_BORDER = {
  lawful_good: "rgba(0,210,155,0.85)",    neutral_good: "rgba(0,210,155,0.85)",    chaotic_good: "rgba(0,210,155,0.85)",
  lawful_neutral: "rgba(120,110,255,0.9)", true_neutral: "rgba(120,110,255,0.9)",  chaotic_neutral: "rgba(120,110,255,0.9)",
  lawful_evil: "rgba(235,60,110,0.95)",    neutral_evil: "rgba(235,60,110,0.90)",   chaotic_evil: "rgba(235,60,110,0.95)",
};

export default function AlignmentGrid({ value, onChange, disabled = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : "auto",
        userSelect: "none",
      }}
    >
      {/* Column header row */}
      <div style={{ display: "flex", gap: 4 }}>
        <div style={s.corner} />
        {COL_LABELS.map(l => (
          <div key={l} style={s.colHeader}>{l}</div>
        ))}
      </div>

      {/* Data rows */}
      {GRID.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={s.rowHeader}>{ROW_LABELS[ri]}</div>
          {row.map(alignment => {
            const selected = value === alignment;
            return (
              <button
                key={alignment}
                type="button"
                title={FULL[alignment]}
                aria-label={FULL[alignment]}
                aria-pressed={selected}
                onClick={() => onChange(alignment)}
                style={{
                  width: 54,
                  height: 38,
                  borderRadius: 8,
                  border: selected
                    ? `1.5px solid ${SEL_BORDER[alignment]}`
                    : "1px solid rgba(0,180,255,0.10)",
                  background: selected ? SEL_BG[alignment] : BASE_BG[alignment],
                  boxShadow: selected
                    ? `0 0 10px ${SEL_BORDER[alignment]}55`
                    : "none",
                  color: selected ? "#fff" : "rgba(141,223,255,0.62)",
                  fontWeight: selected ? 800 : 600,
                  fontSize: "0.80rem",
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  transition: "background 150ms, border-color 150ms, box-shadow 150ms, color 150ms",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                {SHORT[alignment]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const s = {
  corner: {
    width: 44,
    flexShrink: 0,
  },
  colHeader: {
    width: 54,
    textAlign: "center",
    fontSize: "0.70rem",
    fontWeight: 700,
    color: "rgba(141,223,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: 1.2,
  },
  rowHeader: {
    width: 44,
    textAlign: "right",
    paddingRight: 6,
    fontSize: "0.70rem",
    fontWeight: 700,
    color: "rgba(141,223,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: 1.2,
    flexShrink: 0,
  },
};
