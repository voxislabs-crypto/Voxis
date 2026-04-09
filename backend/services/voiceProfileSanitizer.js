function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, safe));
}

export function sanitizeVoiceProfile(input, fallbackProfile = {}) {
  const source = input && typeof input === "object" ? input : fallbackProfile;
  const fallback = fallbackProfile && typeof fallbackProfile === "object" ? fallbackProfile : {};
  const engine = String(source.engine || fallback.engine || "auto").trim().toLowerCase();
  const piperSpeaker = Number(source.piperSpeaker ?? fallback.piperSpeaker);

  return {
    enabled: source.enabled !== false,
    autoplay: Boolean(source.autoplay),
    engine: ["auto", "cloud", "openai", "piper", "kokoro", "elevenlabs", "cartesia"].includes(engine)
      ? engine === "openai"
        ? "cloud"
        : engine
      : "auto",
    pitch: clampNumber(source.pitch, 0.5, 1.6, Number(fallback.pitch) || 1),
    rate: clampNumber(source.rate, 0.6, 1.6, Number(fallback.rate) || 1),
    preferredVoice: String(source.preferredVoice || source.providerVoice || fallback.preferredVoice || fallback.providerVoice || "alloy").trim(),
    providerVoice: String(source.providerVoice || source.preferredVoice || fallback.providerVoice || fallback.preferredVoice || "alloy").trim(),
    providerModel: String(source.providerModel || fallback.providerModel || "gpt-4o-mini-tts").trim(),
    piperModelPath: String(source.piperModelPath || fallback.piperModelPath || "").trim(),
    piperSpeaker: Number.isFinite(piperSpeaker) && piperSpeaker >= 0 ? Math.floor(piperSpeaker) : null,
    kokoroVoice: String(source.kokoroVoice || fallback.kokoroVoice || "af_heart").trim(),
    elevenLabsVoiceId: String(source.elevenLabsVoiceId || fallback.elevenLabsVoiceId || "").trim(),
    elevenLabsModel: String(source.elevenLabsModel || fallback.elevenLabsModel || "eleven_multilingual_v2").trim(),
    stability: clampNumber(source.stability ?? fallback.stability, 0, 1, 0.5),
    similarityBoost: clampNumber(source.similarityBoost ?? fallback.similarityBoost, 0, 1, 0.75),
    style: clampNumber(source.style ?? fallback.style, 0, 1, 0.5),
    cartesiaVoiceId: String(source.cartesiaVoiceId || fallback.cartesiaVoiceId || "").trim(),
    cartesiaModel: String(source.cartesiaModel || fallback.cartesiaModel || "sonic-2").trim(),
  };
}
