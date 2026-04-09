import { getPersonalityById } from "../models/personalityModel.js";
import {
  generateSpeechAudio,
  isTtsConfigured,
  listPiperVoiceOptions,
  listKokoroVoices,
  listProviderStatus,
  listProviderOptions,
} from "../services/ttsService.js";
import { sanitizeVoiceProfile } from "../services/voiceProfileSanitizer.js";

export async function listPiperVoicesHandler(req, res, next) {
  try {
    const payload = await listPiperVoiceOptions();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export function listKokoroVoicesHandler(req, res) {
  return res.json(listKokoroVoices());
}

export function listProviderStatusHandler(req, res) {
  return res.json(listProviderStatus());
}

export async function listProviderOptionsHandler(req, res, next) {
  try {
    const provider = String(req.query.provider || "").trim().toLowerCase();
    if (!provider) {
      return res.status(400).json({ error: "provider query param is required." });
    }

    const payload = await listProviderOptions(provider);
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
    res.setHeader("X-Voxis-Directed-Text", encodeURIComponent(audio.directedText || text));
    res.setHeader("X-Voxis-Tts-Engine", audio.engine || "unknown");
    res.setHeader(
      "X-Voxis-Adjusted-Voice",
      encodeURIComponent(JSON.stringify(audio.adjustedVoiceProfile || voiceProfile)),
    );
    res.setHeader(
      "X-Voxis-Prosody",
      encodeURIComponent(JSON.stringify(audio.prosodyEnvelope || {})),
    );
    res.setHeader(
      "X-Voxis-Tts-Telemetry",
      encodeURIComponent(JSON.stringify(audio.telemetry || {})),
    );
    return res.send(audio.buffer);
  } catch (error) {
    return next(error);
  }
}