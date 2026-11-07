import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTtsCacheKey,
  cachedClipMatchesEngine,
  clearTtsCache,
  readReusableTtsClip,
  rememberTtsClip,
} from "../../frontend/src/utils/ttsCache.js";

function clip(chosenEngine, extra = {}) {
  return {
    blob: new Blob(["audio"]),
    telemetry: {
      chosenEngine,
      chosenVoiceId: extra.chosenVoiceId || "",
      fallbackUsed: Boolean(extra.fallbackUsed),
    },
  };
}

describe("tts session cache", () => {
  beforeEach(() => {
    clearTtsCache();
  });

  it("includes the provider voice and model in the cache key", () => {
    const base = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    const first = buildTtsCacheKey(7, "Hello there", base);
    const otherVoice = buildTtsCacheKey(7, "Hello there", { ...base, cartesiaVoiceId: "voice-b" });
    const otherModel = buildTtsCacheKey(7, "Hello there", { ...base, cartesiaModel: "sonic-2" });
    expect(first).not.toBe(otherVoice);
    expect(first).not.toBe(otherModel);
  });

  it("replays a matching clip", () => {
    const profile = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    rememberTtsClip(7, "Hello there", profile, clip("cartesia", { chosenVoiceId: "voice-a" }));
    const hit = readReusableTtsClip(7, "Hello there", profile);
    expect(hit?.blob).toBeInstanceOf(Blob);
    expect(hit?.fromCache).toBe(true);
  });

  it("does not replay Cartesia audio for an explicit Piper request", () => {
    const profile = {
      engine: "piper",
      piperModelPath: "X:\\voices\\en_US-lessac-medium.onnx",
      piperSpeaker: 0,
    };
    rememberTtsClip(7, "Hello there", profile, clip("cartesia", { fallbackUsed: true }));
    expect(cachedClipMatchesEngine(clip("cartesia", { fallbackUsed: true }), "piper")).toBe(false);
    expect(readReusableTtsClip(7, "Hello there", profile)).toBeNull();
  });

  it("does not replay ElevenLabs audio for an explicit Cartesia request", () => {
    const profile = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    rememberTtsClip(7, "Hello there", profile, clip("elevenlabs", { fallbackUsed: true }));
    expect(cachedClipMatchesEngine(clip("elevenlabs", { fallbackUsed: true }), "cartesia")).toBe(false);
    expect(readReusableTtsClip(7, "Hello there", profile)).toBeNull();
  });

  it("reuses Cartesia audio that was produced while ElevenLabs was out of quota", () => {
    const elevenLabs = {
      engine: "elevenlabs",
      elevenLabsVoiceId: "el-1",
      elevenLabsModel: "eleven_multilingual_v2",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    rememberTtsClip(7, "Hello there", elevenLabs, clip("cartesia", {
      chosenVoiceId: "voice-a",
      fallbackUsed: true,
    }));

    expect(readReusableTtsClip(7, "Hello there", elevenLabs)?.blob).toBeInstanceOf(Blob);

    const cartesia = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    expect(readReusableTtsClip(7, "Hello there", cartesia)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(7, "Hello there", { ...cartesia, cartesiaVoiceId: "voice-b" })).toBeNull();
    expect(readReusableTtsClip(7, "Hello there", { ...cartesia, cartesiaModel: "sonic-2" })).toBeNull();
  });

  it("keeps the last 3 playbacks for each provider and persona", () => {
    const cartesia = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    const piper = {
      engine: "piper",
      piperModelPath: "X:\\voices\\en_US-lessac-medium.onnx",
      piperSpeaker: null,
    };
    for (const text of ["one", "two", "three", "four"]) {
      rememberTtsClip(25, text, cartesia, clip("cartesia"), { retain: true });
    }
    rememberTtsClip(25, "piper line", piper, clip("piper"), { retain: true });
    rememberTtsClip(26, "other persona", cartesia, clip("cartesia"), { retain: true });

    expect(readReusableTtsClip(25, "one", cartesia)).toBeNull();
    expect(readReusableTtsClip(25, "two", cartesia)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(25, "three", cartesia)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(25, "four", cartesia)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(25, "piper line", piper)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(26, "other persona", cartesia)?.blob).toBeInstanceOf(Blob);

    rememberTtsClip(25, "four", cartesia, clip("cartesia"), { retain: true });
    expect(readReusableTtsClip(25, "two", cartesia)?.blob).toBeInstanceOf(Blob);
  });

  it("counts every sentence of one reply as a single saved response", () => {
    const cartesia = {
      engine: "cartesia",
      cartesiaVoiceId: "voice-a",
      cartesiaModel: "sonic-3",
    };
    rememberTtsClip(25, "a1", cartesia, clip("cartesia"), { retain: true, responseKey: "turn-a" });
    rememberTtsClip(25, "a2", cartesia, clip("cartesia"), { retain: true, responseKey: "turn-a" });
    for (const turn of ["b", "c", "d"]) {
      rememberTtsClip(25, turn, cartesia, clip("cartesia"), { retain: true, responseKey: `turn-${turn}` });
    }

    expect(readReusableTtsClip(25, "a1", cartesia)).toBeNull();
    expect(readReusableTtsClip(25, "a2", cartesia)).toBeNull();
    expect(readReusableTtsClip(25, "b", cartesia)?.blob).toBeInstanceOf(Blob);
    expect(readReusableTtsClip(25, "d", cartesia)?.blob).toBeInstanceOf(Blob);
  });
});
