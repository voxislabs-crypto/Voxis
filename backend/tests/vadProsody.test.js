import { describe, expect, it } from "vitest";

import { compileProsodyEnvelope } from "../services/prosodyCompiler.js";
import { mapVadToProsodyHints } from "../services/vadProsody.js";

function envelopeFor(mood) {
  return compileProsodyEnvelope({
    personality: {},
    mood,
    voiceProfile: { rate: 1, stability: 0.5, style: 0.5 },
    directedText: "We can take the next step.",
  });
}

describe("VAD prosody hints", () => {
  it("keeps a neutral mood at unity rate and pause with no style line", () => {
    const hints = mapVadToProsodyHints({ valence: 0, arousal: 0, dominance: 0 });
    expect(hints.rateMultiplier).toBe(1);
    expect(hints.pauseMultiplier).toBe(1);
    expect(hints.styleInstruction).toBe("");
  });

  it("raises rate and tightens pauses when arousal rises", () => {
    const calm = mapVadToProsodyHints({ valence: 0, arousal: 0, dominance: 0 });
    const charged = mapVadToProsodyHints({ valence: 0, arousal: 0.8, dominance: 0 });
    expect(charged.rateMultiplier).toBeGreaterThan(calm.rateMultiplier);
    expect(charged.pauseMultiplier).toBeLessThan(calm.pauseMultiplier);

    const calmEnvelope = envelopeFor({ valence: 0, arousal: 0, dominance: 0 });
    const chargedEnvelope = envelopeFor({ valence: 0, arousal: 0.8, dominance: 0 });
    expect(chargedEnvelope.targetRate).toBeGreaterThan(calmEnvelope.targetRate);
    expect(chargedEnvelope.avgPauseSeconds).toBeLessThan(calmEnvelope.avgPauseSeconds);
    expect(chargedEnvelope.provider.kokoro.pauseSeconds).toBeLessThan(calmEnvelope.provider.kokoro.pauseSeconds);
    expect(chargedEnvelope.provider.piper.lengthScale).toBeLessThan(calmEnvelope.provider.piper.lengthScale);
    expect(chargedEnvelope.provider.cloud.instructions).toContain("tighter pauses");
  });

  it("slows and flattens delivery when valence drops", () => {
    const bright = mapVadToProsodyHints({ valence: 0.4, arousal: 0, dominance: 0 });
    const low = mapVadToProsodyHints({ valence: -0.7, arousal: 0, dominance: 0 });
    expect(low.rateMultiplier).toBeLessThan(bright.rateMultiplier);
    expect(low.pauseMultiplier).toBeGreaterThan(bright.pauseMultiplier);
    expect(low.styleInstruction).toContain("flatter");

    const brightEnvelope = envelopeFor({ valence: 0.4, arousal: 0, dominance: 0 });
    const lowEnvelope = envelopeFor({ valence: -0.7, arousal: 0, dominance: 0 });
    expect(lowEnvelope.targetRate).toBeLessThan(brightEnvelope.targetRate);
    expect(lowEnvelope.provider.cloud.speed).toBeLessThan(brightEnvelope.provider.cloud.speed);
    expect(lowEnvelope.provider.cloud.instructions).toContain("flatter");
    expect(brightEnvelope.provider.cloud.instructions).not.toContain("Prosody hint");
  });

  it("adds assertive pacing when dominance rises", () => {
    const yielding = mapVadToProsodyHints({ valence: 0, arousal: 0, dominance: -0.2 });
    const assertive = mapVadToProsodyHints({ valence: 0, arousal: 0, dominance: 0.8 });
    expect(assertive.rateMultiplier).toBeGreaterThan(yielding.rateMultiplier);
    expect(assertive.pauseMultiplier).toBeLessThan(yielding.pauseMultiplier);
    expect(assertive.styleInstruction).toContain("assertive");

    const yieldingEnvelope = envelopeFor({ valence: 0, arousal: 0, dominance: 0 });
    const assertiveEnvelope = envelopeFor({ valence: 0, arousal: 0, dominance: 0.8 });
    expect(assertiveEnvelope.targetRate).toBeGreaterThan(yieldingEnvelope.targetRate);
    expect(assertiveEnvelope.provider.cloud.instructions).toContain("assertive pacing");
  });
});
