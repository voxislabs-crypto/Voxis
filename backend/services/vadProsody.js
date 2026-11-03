// Engine-agnostic VAD prosody hints.
//
// Modest multipliers layered on top of stylizeSpeech, applyMoodToVoice, and the
// prosody envelope. They do not replace those adjustments and they do not target
// a specific clone engine. Piper, Kokoro, and cloud speech read the resulting
// rate, pause, and style instruction from the shared envelope.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export const VAD_PROSODY_SCALES = {
  arousalRate: 0.05,
  valenceSlow: 0.04,
  dominanceRate: 0.03,
  arousalPause: 0.12,
  valencePause: 0.08,
  dominancePause: 0.06,
  rateMin: 0.9,
  rateMax: 1.1,
  pauseMin: 0.82,
  pauseMax: 1.18,
  arousalStyle: 0.35,
  valenceStyle: 0.25,
  dominanceStyle: 0.35,
};

export function mapVadToProsodyHints(mood = {}) {
  const arousal = clamp(finite(mood?.arousal), -1, 1);
  const valence = clamp(finite(mood?.valence), -1, 1);
  const dominance = clamp(finite(mood?.dominance), -1, 1);
  const lowValence = Math.max(0, -valence);
  const assertive = Math.max(0, dominance);
  const scales = VAD_PROSODY_SCALES;

  const rateMultiplier = clamp(
    1
      + (arousal * scales.arousalRate)
      - (lowValence * scales.valenceSlow)
      + (assertive * scales.dominanceRate),
    scales.rateMin,
    scales.rateMax,
  );
  const pauseMultiplier = clamp(
    1
      - (arousal * scales.arousalPause)
      + (lowValence * scales.valencePause)
      - (assertive * scales.dominancePause),
    scales.pauseMin,
    scales.pauseMax,
  );

  const cues = [];
  if (arousal >= scales.arousalStyle) {
    cues.push("slightly quicker pace and tighter pauses");
  } else if (arousal <= -scales.arousalStyle) {
    cues.push("a slightly slower pace");
  }
  if (valence <= -scales.valenceStyle) {
    cues.push("a slightly flatter delivery");
  }
  if (dominance >= scales.dominanceStyle) {
    cues.push("slightly more assertive pacing");
  }

  return {
    rateMultiplier: round3(rateMultiplier),
    pauseMultiplier: round3(pauseMultiplier),
    styleInstruction: cues.length
      ? `Prosody hint: ${cues.join("; ")}. Keep it modest.`
      : "",
  };
}
