import { useMemo } from "react";
import { mapToVoxisPersonality } from "../lib/mapToVoxisPersonality.js";

const VAD_CONFIG = {
  V: { label: "Valence", posColor: "#00d4a8", negColor: "#ff4d6d" },
  A: { label: "Arousal", posColor: "#f5a623", negColor: "#6099ff" },
  D: { label: "Dominance", posColor: "#c860ff", negColor: "#ffd060" },
};

function VADBar({ axis, value }) {
  const { label, posColor, negColor } = VAD_CONFIG[axis];
  const color = value >= 0 ? posColor : negColor;
  const midPct = 50;
  const barPct = Math.abs(value) * 50;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 800,
          color: "rgba(141,223,255,0.55)",
          width: 62,
          flexShrink: 0,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 8,
          background: "rgba(0,180,255,0.08)",
          border: "1px solid rgba(0,180,255,0.12)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(0,180,255,0.24)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            borderRadius: 6,
            background: color,
            opacity: 0.85,
            ...(value >= 0
              ? { left: `${midPct}%`, width: `${barPct}%` }
              : { left: `${midPct - barPct}%`, width: `${barPct}%` }),
          }}
        />
      </div>
      <span
        style={{
          fontSize: "0.76rem",
          fontWeight: 700,
          color,
          width: 36,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export default function HybridPreview({
  bigFive,
  alignment,
  alignmentEnabled,
  previewAlignment,
}) {
  const activeAlignment = previewAlignment || alignment;
  const isPreviewing = Boolean(previewAlignment && previewAlignment !== alignment);

  const result = useMemo(() => {
    if (!alignmentEnabled) {
      return null;
    }

    return mapToVoxisPersonality({
      bigFiveProfile: bigFive,
      alignmentProfile: {
        enabled: true,
        alignment: activeAlignment,
      },
    });
  }, [activeAlignment, alignmentEnabled, bigFive]);

  if (!result) {
    return (
      <div style={{ ...card, opacity: 0.45 }}>
        <span style={inactiveLabel}>Enable alignment overlay to see live tuning preview</span>
      </div>
    );
  }

  const sensBand =
    result.moodSensitivity < 0.85
      ? { label: "stoic", color: "#6099ff" }
      : result.moodSensitivity < 1.35
        ? { label: "balanced", color: "#8ddfff" }
        : result.moodSensitivity < 2.0
          ? { label: "reactive", color: "#f5a623" }
          : { label: "volatile", color: "#ff4d6d" };

  return (
    <div style={card}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
        <span style={titleStyle}>Hybrid Tuning Preview</span>
        <span style={{ ...subStyle, color: isPreviewing ? "#f5a623" : subStyle.color }}>
          {isPreviewing ? "Hover preview" : "Live"} · {result.alignmentLabel}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <VADBar axis="V" value={result.moodBaseline.valence} />
        <VADBar axis="A" value={result.moodBaseline.arousal} />
        <VADBar axis="D" value={result.moodBaseline.dominance} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <div style={chip}>
          <span style={chipLabel}>Mood sensitivity</span>
          <span style={{ ...chipValue, color: sensBand.color }}>
            {result.moodSensitivity.toFixed(2)}x - {sensBand.label}
          </span>
        </div>
        <div style={chip}>
          <span style={chipLabel}>Suggested context</span>
          <span style={chipValue}>{result.creativeContext.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={chipLabel}>Expression rules</span>
        {(result.expressionStyle?.rules || []).slice(0, 3).map((rule, i) => (
          <span key={i} style={ruleItemStyle}>
            - {rule}
          </span>
        ))}
      </div>
    </div>
  );
}

const card = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(0,180,255,0.15)",
  background: "rgba(0,180,255,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 240,
};

const inactiveLabel = {
  fontSize: "0.80rem",
  color: "rgba(109,128,160,0.65)",
  lineHeight: 1.5,
};

const titleStyle = {
  fontSize: "0.78rem",
  fontWeight: 800,
  color: "#8ddfff",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const subStyle = {
  fontSize: "0.75rem",
  color: "rgba(109,128,160,0.80)",
};

const chip = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const chipLabel = {
  fontSize: "0.70rem",
  fontWeight: 700,
  color: "rgba(109,128,160,0.75)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const chipValue = {
  fontSize: "0.80rem",
  fontWeight: 700,
  color: "#8ddfff",
  textTransform: "capitalize",
};

const ruleItemStyle = {
  fontSize: "0.76rem",
  color: "rgba(141,223,255,0.72)",
  lineHeight: 1.45,
};
