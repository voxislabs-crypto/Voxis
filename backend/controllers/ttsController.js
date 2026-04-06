import { getPersonalityById } from "../models/personalityModel.js";
import { generateSpeechAudio, isTtsConfigured, listPiperVoiceOptions } from "../services/ttsService.js";

function sanitizeVoiceProfile(input, fallbackProfile = {}) {
  const source = input && typeof input === "object" ? input : fallbackProfile;
  const engine = String(source.engine || fallbackProfile.engine || "auto").trim().toLowerCase();
  const piperSpeaker = Number(source.piperSpeaker ?? fallbackProfile.piperSpeaker);
  return {
    enabled: source.enabled !== false,
    autoplay: Boolean(source.autoplay),
    engine: ["auto", "cloud", "openai", "piper"].includes(engine)
      ? engine === "openai"
        ? "cloud"
        : engine
      : "auto",
    pitch: Math.min(1.6, Math.max(0.5, Number(source.pitch) || 1)),
    rate: Math.min(1.6, Math.max(0.6, Number(source.rate) || 1)),
    preferredVoice: String(source.preferredVoice || source.providerVoice || "alloy").trim(),
    providerVoice: String(source.providerVoice || source.preferredVoice || "alloy").trim(),
    providerModel: String(source.providerModel || "gpt-4o-mini-tts").trim(),
    piperModelPath: String(source.piperModelPath || "").trim(),
    piperSpeaker: Number.isFinite(piperSpeaker) && piperSpeaker >= 0 ? Math.floor(piperSpeaker) : null,
  };
}

export async function listPiperVoicesHandler(req, res, next) {
  try {
    const payload = await listPiperVoiceOptions();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
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

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile, personality.voiceProfile);

    if (!isTtsConfigured(voiceProfile)) {
      return res.status(500).json({
        error:
          "TTS is not configured. Configure cloud TTS (TTS_API_KEY/TTS_BASE_URL) or Piper (PIPER_MODEL_PATH) in backend/.env.",
      });
    }
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