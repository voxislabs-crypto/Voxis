import { getPersonalityById } from "../models/personalityModel.js";
import { generateSpeechAudio, isTtsConfigured } from "../services/ttsService.js";

function sanitizeVoiceProfile(input, fallbackProfile = {}) {
  const source = input && typeof input === "object" ? input : fallbackProfile;
  return {
    enabled: source.enabled !== false,
    autoplay: Boolean(source.autoplay),
    pitch: Math.min(1.6, Math.max(0.5, Number(source.pitch) || 1)),
    rate: Math.min(1.6, Math.max(0.6, Number(source.rate) || 1)),
    preferredVoice: String(source.preferredVoice || source.providerVoice || "alloy").trim(),
    providerVoice: String(source.providerVoice || source.preferredVoice || "alloy").trim(),
    providerModel: String(source.providerModel || "gpt-4o-mini-tts").trim(),
  };
}

export async function generateSpeechHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const text = String(req.body.text || "").trim();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    if (!text) {
      return res.status(400).json({ error: "Text is required for speech generation." });
    }

    if (!isTtsConfigured()) {
      return res.status(500).json({
        error:
          "TTS is not configured. Set TTS_API_KEY or a compatible TTS_BASE_URL in backend/.env.",
      });
    }

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile, personality.voiceProfile);
    const audio = await generateSpeechAudio({
      personality,
      text,
      voiceProfile,
    });

    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audio.buffer);
  } catch (error) {
    return next(error);
  }
}