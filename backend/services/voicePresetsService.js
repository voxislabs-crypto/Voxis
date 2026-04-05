// Voice preset mappings for Voxis personalities.
// Used by PersonalityForm to auto-suggest appropriate Piper models based on archetype.

export const VOICE_PRESETS = {
  chaotic_tween: {
    label: "Chaotic Tween / Bubbly",
    recommended: "en_US-lessac-medium",
    alternatives: ["en_US-amy-medium", "en_US-kristin-medium"],
    description: "High-energy, playful, mischievous. Youthful, energetic female tones.",
  },
  villain: {
    label: "Villain / Dark",
    recommended: "en_US-hfc_male-medium",
    alternatives: ["en_US-ryan-low", "en_US-danny-low"],
    description: "Sly, deep, commanding, sinister. Gravelly, brooding male tones.",
  },
  neutral: {
    label: "Neutral / Grounded",
    recommended: "en_US-arctic-medium",
    alternatives: ["en_US-norman-medium", "en_US-bryce-medium"],
    description: "Calm, approachable, everyday. Clear, steady, grounded voices.",
  },
  professional: {
    label: "Professional / Authority",
    recommended: "en_US-john-medium",
    alternatives: ["en_US-albert-medium", "en_US-sara-medium"],
    description: "Clear, confident, formal. Authoritative, professional tone.",
  },
  warm: {
    label: "Warm / Friendly",
    recommended: "en_US-joe-medium",
    alternatives: ["en_US-glow-medium", "en_US-mary-medium"],
    description: "Smooth, approachable, personable. Warm, friendly, inviting tone.",
  },
};

// Recommend voices based on personality big five + alignment.
export function recommendVoicePreset(personality) {
  if (!personality) return VOICE_PRESETS.warm;

  const alignment = (personality.alignment || "").toLowerCase();
  const bigFive = personality.bigFiveProfile || {};

  // Chaotic evil with high E = chaotic tween (playful chaos)
  if (alignment.includes("chaotic") && alignment.includes("evil") && bigFive.E > 0.55) {
    return VOICE_PRESETS.chaotic_tween;
  }

  // Evil alignment = villain (dark)
  if (alignment.includes("evil")) {
    return VOICE_PRESETS.villain;
  }

  // High openness + not chaotic = professional
  if (bigFive.O > 0.65 && !alignment.includes("chaotic")) {
    return VOICE_PRESETS.professional;
  }

  // Low extraversion neutral = grounded
  if (bigFive.E < 0.4 && !alignment.includes("evil") && !alignment.includes("chaotic")) {
    return VOICE_PRESETS.neutral;
  }

  // High extraversion chaotic = bubbly/chaotic
  if (bigFive.E > 0.65 && alignment.includes("chaotic")) {
    return VOICE_PRESETS.chaotic_tween;
  }

  // Default to warm
  return VOICE_PRESETS.warm;
}

// Get all preset categories.
export function getAllVoicePresets() {
  return VOICE_PRESETS;
}
