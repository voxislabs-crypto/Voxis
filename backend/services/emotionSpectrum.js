function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

const ZONES = {
  green: {
    key: "green",
    label: "Green Zone",
    accent: "#34d399",
  },
  yellow: {
    key: "yellow",
    label: "Yellow Zone",
    accent: "#fbbf24",
  },
  red: {
    key: "red",
    label: "Red Zone",
    accent: "#fb7185",
  },
  blue: {
    key: "blue",
    label: "Blue Zone",
    accent: "#60a5fa",
  },
};

function resolveZone({ valence, arousal }) {
  if (valence >= 0.2 && arousal <= 0.18) return ZONES.green;
  if (valence >= 0.2 && arousal > 0.18) return ZONES.yellow;
  if (valence <= -0.2 && arousal >= 0.18) return ZONES.red;
  if (valence <= -0.2 && arousal < 0.18) return ZONES.blue;
  if (Math.abs(valence) < 0.2 && arousal >= 0.38) return ZONES.yellow;
  if (Math.abs(valence) < 0.2 && arousal <= -0.28) return ZONES.blue;
  return ZONES.green;
}

function resolveEmotion({ zone, valence, arousal, dominance }) {
  if (zone.key === "green") {
    if (arousal <= -0.35) {
      return {
        primary: "Serene",
        nuance: dominance > 0.2 ? "Centered" : "Soft",
      };
    }
    if (arousal >= 0.45) {
      return {
        primary: dominance >= 0.3 ? "Proud" : "Enthusiastic",
        nuance: valence >= 0.55 ? "Joyful" : "Engaged",
      };
    }
    if (dominance >= 0.35) {
      return {
        primary: "Confident",
        nuance: "Steady",
      };
    }
    return {
      primary: "Calm",
      nuance: arousal < 0 ? "Grounded" : "Comfortable",
    };
  }

  if (zone.key === "yellow") {
    if (valence >= 0.2) {
      return {
        primary: arousal >= 0.58 ? "Excited" : "Playful",
        nuance: dominance >= 0.2 ? "Bold" : "Sparked",
      };
    }
    if (valence <= -0.06) {
      if (arousal >= 0.6) {
        return {
          primary: dominance < -0.1 ? "Panicked" : "Agitated",
          nuance: "Overloaded",
        };
      }
      return {
        primary: "Worried",
        nuance: dominance > 0.2 ? "Irritated" : "Uneasy",
      };
    }
    return {
      primary: arousal >= 0.55 ? "Alert" : "Restless",
      nuance: dominance >= 0.25 ? "Guarded" : "Watching",
    };
  }

  if (zone.key === "red") {
    if (arousal >= 0.72 && dominance >= 0.35) {
      return {
        primary: "Furious",
        nuance: "Combative",
      };
    }
    if (dominance <= -0.15) {
      return {
        primary: arousal >= 0.58 ? "Humiliated" : "Shaken",
        nuance: "Exposed",
      };
    }
    if (dominance >= 0.45) {
      return {
        primary: "Aggressive",
        nuance: "Forceful",
      };
    }
    return {
      primary: arousal >= 0.58 ? "Angry" : "Out of Control",
      nuance: dominance >= 0 ? "Defensive" : "Raw",
    };
  }

  if (arousal <= -0.5 && valence <= -0.48) {
    return {
      primary: "Depressed",
      nuance: "Numb",
    };
  }

  if (valence <= -0.55) {
    return {
      primary: "Sad",
      nuance: arousal < -0.2 ? "Heavy" : "Hurt",
    };
  }

  if (arousal <= -0.34) {
    return {
      primary: "Tired",
      nuance: dominance < -0.2 ? "Withdrawn" : "Low Energy",
    };
  }

  return {
    primary: dominance > 0.25 ? "Disappointed" : "Sorry",
    nuance: "Muted",
  };
}

function computeIntensity({ valence, arousal, dominance }) {
  const v = Math.abs(valence);
  const a = Math.abs(arousal);
  const d = Math.abs(dominance);
  const weighted = Math.sqrt((v * v) * 0.52 + (a * a) * 0.36 + (d * d) * 0.12);
  return clamp(weighted, 0, 1);
}

export function interpretEmotionSpectrum(mood = {}) {
  const valence = clamp(Number(mood?.valence) || 0, -1, 1);
  const arousal = clamp(Number(mood?.arousal) || 0, -1, 1);
  const dominance = clamp(Number(mood?.dominance) || 0, -1, 1);

  const zone = resolveZone({ valence, arousal });
  const emotion = resolveEmotion({
    zone,
    valence,
    arousal,
    dominance,
  });
  const intensity = computeIntensity({ valence, arousal, dominance });

  return {
    zone,
    primaryEmotion: emotion.primary,
    nuance: emotion.nuance,
    displayLabel: `${emotion.primary}${emotion.nuance ? ` - ${emotion.nuance}` : ""}`,
    intensity,
    normalized: {
      valence: roundTo(valence, 3),
      arousal: roundTo(arousal, 3),
      dominance: roundTo(dominance, 3),
    },
  };
}
