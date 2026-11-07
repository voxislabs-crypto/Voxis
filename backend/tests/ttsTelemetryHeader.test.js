import { describe, expect, it } from "vitest";

import { encodeTtsTelemetryHeader } from "../controllers/ttsController.js";

const frame = {
  zone: { key: "green", label: "Green Zone", accent: "#34d399" },
  primaryEmotion: "Calm",
  nuance: "Grounded",
  displayLabel: "Calm - Grounded",
  intensity: 0.2,
  normalized: { valence: 0.1, arousal: 0, dominance: 0 },
};

describe("encodeTtsTelemetryHeader", () => {
  it("keeps a small telemetry payload intact", () => {
    const payload = { chosenEngine: "cartesia", emotionFrame: frame };
    const parsed = JSON.parse(decodeURIComponent(encodeTtsTelemetryHeader(payload)));
    expect(parsed).toEqual(payload);
  });

  it("keeps emotionFrame when the full header would be dropped for size", () => {
    const payload = {
      requested: "cartesia",
      chosenEngine: "cartesia",
      chosenVoiceId: "voice-1",
      fallbackUsed: false,
      emotionFrame: frame,
      personalityEvents: [{ text: "x".repeat(4000) }],
      expressiveText: "y".repeat(2000),
    };

    const parsed = JSON.parse(decodeURIComponent(encodeTtsTelemetryHeader(payload, 1400)));
    expect(parsed.emotionFrame).toEqual(frame);
    expect(parsed.chosenEngine).toBe("cartesia");
    expect(parsed.personalityEvents).toBeUndefined();
    expect(Buffer.byteLength(encodeTtsTelemetryHeader(payload, 1400), "utf8")).toBeLessThanOrEqual(1400);
  });

  it("still emits the frame when every other field has to go", () => {
    const payload = {
      emotionFrame: frame,
      expressiveText: "z".repeat(5000),
    };
    const parsed = JSON.parse(decodeURIComponent(encodeTtsTelemetryHeader(payload, 80)));
    expect(parsed).toEqual({ emotionFrame: frame });
  });
});
