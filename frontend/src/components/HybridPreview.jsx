import { useMemo } from "react";

// ── math ported 1:1 from backend/services/hybridPersonalityService.js ──

const ALIGNMENT_VAD_OFFSETS = {
  lawful_good:     { valence:  0.35, arousal: -0.20, dominance:  0.40 },
  neutral_good:    { valence:  0.30, arousal:  0.05, dominance:  0.15 },
  chaotic_good:    { valence:  0.35, arousal:  0.35, dominance:  0.05 },
  lawful_neutral:  { valence:  0.00, arousal: -0.20, dominance:  0.40 },
  true_neutral:    { valence:  0.00, arousal:  0.00, dominance:  0.00 },
  chaotic_neutral: { valence:  0.05, arousal:  0.28, dominance: -0.05 },
  lawful_evil:     { valence: -0.40, arousal: -0.10, dominance:  0.45 },
  neutral_evil:    { valence: -0.45, arousal:  0.10, dominance:  0.25 },
  chaotic_evil:    { valence: -0.55, arousal:  0.45, dominance:  0.20 },
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function clamp01(v, fb = 0.5) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : fb;
}

function computeVAD(b5, alignment) {
  const A = clamp01(b5.agreeableness);
  const E = clamp01(b5.extraversion);
  const N = clamp01(b5.neuroticism);
  const C = clamp01(b5.conscientiousness);
  const off = ALIGNMENT_VAD_OFFSETS[alignment] || ALIGNMENT_VAD_OFFSETS.true_neutral;
  return {
    valence:   clamp((A - 0.5) * 0.9 + (E - 0.5) * 0.25 - (N - 0.5) * 0.5  + off.valence,   -1, 1),
    arousal:   clamp((E - 0.5) * 0.55 + (N - 0.5) * 0.5  - (C - 0.5) * 0.20 + off.arousal,   -1, 1),
    dominance: clamp((C - 0.5) * 0.55 + (E - 0.5) * 0.3  - (A - 0.5) * 0.10 + off.dominance, -1, 1),
  };
}

function computeSensitivity(b5, alignment) {
  const N = clamp01(b5.neuroticism);
  const O = clamp01(b5.openness);
  const C = clamp01(b5.conscientiousness);
  const chaoticBonus = alignment.includes("chaotic") ? 0.2 : 0;
  return clamp(1.0 + (N - 0.5) * 1.2 + (O - 0.5) * 0.35 - (C - 0.5) * 0.45 + chaoticBonus, 0.1, 3.0);
}

function pickContext(alignment, b5) {
  const N = clamp01(b5.neuroticism);
  const C = clamp01(b5.conscientiousness);
  const A = clamp01(b5.agreeableness);
  if (alignment === "lawful_evil" && C >= 0.65)                              return "narrative_antagonist";
  if (alignment === "chaotic_evil" || (alignment === "neutral_evil" && N >= 0.65)) return "tragic_villain";
  if (alignment.includes("evil") || (alignment.includes("neutral") && A < 0.35)) return "morally_complex";
  if (alignment === "chaotic_good" && C < 0.4)                               return "anti_hero";
  return "default";
}

// ── sub-components ──

const VAD_CONFIG = {
  V: { label: "Valence",   posColor: "#00d4a8", negColor: "#ff4d6d" },
  A: { label: "Arousal",   posColor: "#f5a623", negColor: "#6099ff" },
  D: { label: "Dominance", posColor: "#c860ff", negColor: "#ffd060" },
};

function VADBar({ axis, value }) {
  const { label, posColor, negColor } = VAD_CONFIG[axis];
  const color = value >= 0 ? posColor : negColor;
  const midPct = 50;
  const barPct = Math.abs(value) * 50;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: "0.72rem",
        fontWeight: 800,
        color: "rgba(141,223,255,0.55)",
        width: 62,
        flexShrink: 0,
        letterSpacing: "0.04em",
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 8,
        borderRadius: 8,
        background: "rgba(0,180,255,0.08)",
        border: "1px solid rgba(0,180,255,0.12)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Center tick */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "rgba(0,180,255,0.24)",
        }} />
        {/* Filled bar */}
        <div style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          borderRadius: 6,
          background: color,
          opacity: 0.85,
          ...(value >= 0
            ? { left: `${midPct}%`, width: `${barPct}%` }
            : { left: `${midPct - barPct}%`, width: `${barPct}%` }),
        }} />
      </div>
      <span style={{
        fontSize: "0.76rem",
        fontWeight: 700,
        color: color,
        width: 36,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  );
}

// ── main export ──

export default function HybridPreview({ bigFive, alignment, alignmentEnabled }) {
  const result = useMemo(() => {
    if (!alignmentEnabled) return null;
    const vad = computeVAD(bigFive, alignment);
    const sensitivity = computeSensitivity(bigFive, alignment);
    const context = pickContext(alignment, bigFive);
    return { vad, sensitivity, context };
  }, [bigFive, alignment, alignmentEnabled]);

  if (!result) {
    return (
      <div style={{ ...card, opacity: 0.45 }}>
        <span style={inactiveLabel}>
          Enable alignment overlay to see live tuning preview
        </span>
      </div>
    );
  }

  const contextLabel = result.context.replace(/_/g, " ");
  const sensBand =
    result.sensitivity < 0.85 ? { label: "stoic",   color: "#6099ff" } :
    result.sensitivity < 1.35 ? { label: "balanced", color: "#8ddfff" } :
    result.sensitivity < 2.0  ? { label: "reactive", color: "#f5a623" } :
                                 { label: "volatile", color: "#ff4d6d" };

  return (
    <div style={card}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
        <span style={titleStyle}>Hybrid Tuning Preview</span>
        <span style={subStyle}>Live · Big Five × {alignment.replace(/_/g, " ")}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <VADBar axis="V" value={result.vad.valence} />
        <VADBar axis="A" value={result.vad.arousal} />
        <VADBar axis="D" value={result.vad.dominance} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <div style={chip}>
          <span style={chipLabel}>Mood sensitivity</span>
          <span style={{ ...chipValue, color: sensBand.color }}>
            {result.sensitivity.toFixed(2)}× — {sensBand.label}
          </span>
        </div>
        <div style={chip}>
          <span style={chipLabel}>Suggested context</span>
          <span style={chipValue}>{contextLabel}</span>
        </div>
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
  textTransform: "capitalize",
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
