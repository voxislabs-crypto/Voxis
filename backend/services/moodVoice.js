function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function applyMoodToVoice(voiceProfile = {}, mood = {}) {
  const output = { ...voiceProfile };
  const baseRate = Number(voiceProfile?.rate) || 1;
  const basePitch = Number(voiceProfile?.pitch) || 1;
  const arousal = Number(mood?.arousal);
  const dominance = Number(mood?.dominance);

  if (Number.isFinite(arousal)) {
    if (arousal >= 0.6) {
      output.rate = clamp(baseRate * 1.16, 0.6, 1.6);
    } else if (arousal <= -0.4) {
      output.rate = clamp(baseRate * 0.86, 0.6, 1.6);
    } else {
      output.rate = clamp(baseRate, 0.6, 1.6);
    }
  } else {
    output.rate = clamp(baseRate, 0.6, 1.6);
  }

  if (Number.isFinite(dominance)) {
    if (dominance >= 0.5) {
      output.pitch = clamp(basePitch * 0.93, 0.5, 1.6);
    } else if (dominance <= -0.4) {
      output.pitch = clamp(basePitch * 1.12, 0.5, 1.6);
    } else {
      output.pitch = clamp(basePitch, 0.5, 1.6);
    }
  } else {
    output.pitch = clamp(basePitch, 0.5, 1.6);
  }

  return output;
}