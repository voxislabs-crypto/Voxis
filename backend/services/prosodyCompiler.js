function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function detectPhrasing({ cadenceLabel, arousal, speechHint }) {
  const hint = String(speechHint || "").toLowerCase();
  if (/(staccato|chop|rapid|hype|aggressive)/.test(hint)) {
    return "bursty";
  }
  if (/(calm|slow|deliberate|grave|cinematic)/.test(hint)) {
    return "measured";
  }
  if (cadenceLabel === "rapid" || arousal >= 0.55) {
    return "bursty";
  }
  if (cadenceLabel === "deliberate" || arousal <= -0.35) {
    return "measured";
  }
  return "balanced";
}

function estimateConfidence({ hasTemplate, hasSamples, hasMood }) {
  let confidence = 0.2;
  if (hasTemplate) confidence += 0.35;
  if (hasSamples) confidence += 0.25;
  if (hasMood) confidence += 0.2;
  return clamp(confidence, 0, 1);
}

export function compileProsodyEnvelope({ personality = {}, mood = {}, voiceProfile = {}, directedText = "", speechHint = "" }) {
  const template = personality?.prosodyTemplate && typeof personality.prosodyTemplate === "object"
    ? personality.prosodyTemplate
    : {};
  const sampleAnalysis = personality?.voiceSampleAnalysis?.analysis && typeof personality.voiceSampleAnalysis.analysis === "object"
    ? personality.voiceSampleAnalysis.analysis
    : {};

  const cadenceLabel = String(template?.cadence?.label || "balanced").toLowerCase();
  const rhythmLabel = String(template?.rhythm?.label || "balanced").toLowerCase();
  const avgPauseSeconds = asNumber(template?.cadence?.avgPauseSeconds, 0.28);
  const speechDensity = asNumber(template?.rhythm?.speechDensity, asNumber(sampleAnalysis?.averageDensity, 0.64));
  const arousal = asNumber(mood?.arousal, 0);
  const dominance = asNumber(mood?.dominance, 0);

  let rateMultiplier = 1;
  if (cadenceLabel === "rapid") rateMultiplier += 0.08;
  if (cadenceLabel === "deliberate") rateMultiplier -= 0.08;
  if (rhythmLabel === "dense") rateMultiplier += 0.04;
  if (rhythmLabel === "spaced") rateMultiplier -= 0.04;
  if (arousal >= 0.55) rateMultiplier += 0.07;
  if (arousal <= -0.35) rateMultiplier -= 0.07;
  rateMultiplier = clamp(rateMultiplier, 0.75, 1.25);

  const baseRate = asNumber(voiceProfile?.rate, 1);
  const targetRate = clamp(baseRate * rateMultiplier, 0.6, 1.6);

  const phrasing = detectPhrasing({ cadenceLabel, arousal, speechHint });
  const intensity = clamp(0.45 + (Math.abs(arousal) * 0.35) + (Math.max(0, dominance) * 0.2), 0, 1);

  const elevenLabs = {
    stability: clamp(
      asNumber(voiceProfile?.stability, 0.5) + (phrasing === "measured" ? 0.1 : phrasing === "bursty" ? -0.1 : 0),
      0,
      1,
    ),
    style: clamp(
      asNumber(voiceProfile?.style, 0.5) + (intensity - 0.5) * 0.55,
      0,
      1,
    ),
    similarityBoost: clamp(asNumber(voiceProfile?.similarityBoost, 0.75), 0, 1),
  };

  const kokoro = {
    pauseSeconds: clamp(avgPauseSeconds, 0.1, 0.8),
    phrasing,
  };

  const confidence = estimateConfidence({
    hasTemplate: Boolean(Object.keys(template).length),
    hasSamples: Boolean(Object.keys(sampleAnalysis).length),
    hasMood: Number.isFinite(Number(mood?.arousal)) || Number.isFinite(Number(mood?.dominance)),
  });

  return {
    version: 1,
    targetRate: Number(targetRate.toFixed(3)),
    rateMultiplier: Number(rateMultiplier.toFixed(3)),
    cadenceLabel,
    rhythmLabel,
    speechDensity: Number(speechDensity.toFixed(3)),
    avgPauseSeconds: Number(avgPauseSeconds.toFixed(3)),
    phrasing,
    intensity: Number(intensity.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    provider: {
      elevenlabs: elevenLabs,
      kokoro,
    },
    source: {
      hasTemplate: Boolean(Object.keys(template).length),
      hasVoiceSamples: Boolean(Object.keys(sampleAnalysis).length),
      textLength: String(directedText || "").length,
      speechHint: String(speechHint || "").trim(),
    },
  };
}

export function applyProsodyToKokoroText(text, envelope = {}) {
  let output = String(text || "").trim();
  if (!output) {
    return output;
  }

  const phrasing = String(envelope?.provider?.kokoro?.phrasing || envelope?.phrasing || "balanced");
  const pauseSeconds = asNumber(envelope?.provider?.kokoro?.pauseSeconds, asNumber(envelope?.avgPauseSeconds, 0.28));

  if (phrasing === "bursty") {
    output = output.replace(/,\s+/g, "... ").replace(/;\s+/g, "... ");
  } else if (phrasing === "measured") {
    output = output.replace(/\.\s+(?=[A-Z])/g, "... ");
  }

  if (pauseSeconds >= 0.45) {
    output = output.replace(/([!?])\s+/g, "$1... ");
  }

  return output.replace(/\s{2,}/g, " ").trim();
}
