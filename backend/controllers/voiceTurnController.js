import { getPersonalityById } from "../models/personalityModel.js";
import { generateSpeechAudio } from "../services/ttsService.js";
import { sanitizeVoiceProfile } from "../services/voiceProfileSanitizer.js";
import { internalChatHandler } from "./internalChatController.js";
import { readVoiceAudio, storeVoiceAudio } from "../services/voiceAudioStore.js";

const MAX_TRANSCRIPT_CHARS = 16000;

function normalizeTranscript(value) {
  if (value != null && typeof value !== "string") {
    return { error: "transcript must be a string." };
  }
  const transcript = String(value || "").trim();
  if (!transcript) {
    return { error: "transcript is required." };
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return { error: `transcript must be ${MAX_TRANSCRIPT_CHARS} characters or fewer.` };
  }
  return { transcript };
}

function messagesForTurn(body, transcript) {
  const prior = Array.isArray(body?.messages) ? body.messages : [];
  const last = prior[prior.length - 1];
  const alreadyThere = String(last?.role || "").toLowerCase() === "user"
    && String(last?.content || "").trim() === transcript;
  if (alreadyThere) {
    return prior;
  }
  return [...prior, { role: "user", content: transcript }];
}

// The phone voice layer's only door into the brain.
// Reads persona, memory, and mood the same way internal chat does, then
// speaks the reply with the existing synthesizer. Does not write chat history
// or step mood. Does not accept a voice-profile override from the caller.
export async function voiceTurnHandler(req, res, next) {
  try {
    const normalized = normalizeTranscript(req.body?.transcript);
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const chatBody = {
      personalityId: req.body?.personalityId,
      messages: messagesForTurn(req.body, normalized.transcript),
    };
    if (req.body?.temperature !== undefined) {
      chatBody.temperature = req.body.temperature;
    }
    if (typeof req.body?.extraContext === "string") {
      chatBody.extraContext = req.body.extraContext;
    }

    let chatStatus = 200;
    let chatPayload = null;
    let forwarded = null;
    const chatRes = {
      status(code) {
        chatStatus = code;
        return chatRes;
      },
      json(payload) {
        chatPayload = payload;
        return chatRes;
      },
    };

    await internalChatHandler({ body: chatBody }, chatRes, (error) => {
      forwarded = error;
    });
    if (forwarded) {
      return next(forwarded);
    }
    if (chatStatus !== 200) {
      return res.status(chatStatus).json(chatPayload || { error: "Voice turn failed." });
    }

    const text = String(chatPayload?.text || "").trim();
    if (!text) {
      return res.status(502).json({ error: "The model returned an empty reply." });
    }

    const personality = getPersonalityById(Number(chatPayload.personalityId));
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const voiceProfile = sanitizeVoiceProfile(personality.voiceProfile, personality.voiceProfile);
    let audio;
    try {
      audio = await generateSpeechAudio({
        personality,
        text,
        voiceProfile,
      });
    } catch (error) {
      const status = Number(error?.statusCode || error?.status);
      if (Number.isInteger(status) && status >= 400 && status < 600) {
        return res.status(status).json({
          error: error.message || "Speech generation failed.",
        });
      }
      throw error;
    }

    if (!audio?.buffer || audio.buffer.length === 0) {
      return res.status(502).json({ error: "Speech generation returned no audio." });
    }

    const id = storeVoiceAudio({
      buffer: audio.buffer,
      contentType: audio.contentType,
    });

    return res.json({
      text,
      audioUrl: `/api/internal/voice-audio/${id}`,
      contentType: audio.contentType || "application/octet-stream",
      personalityId: chatPayload.personalityId,
      personalityName: chatPayload.personalityName,
      model: chatPayload.model || null,
    });
  } catch (error) {
    return next(error);
  }
}

export function voiceAudioHandler(req, res) {
  const clip = readVoiceAudio(req.params?.id);
  if (!clip) {
    return res.status(404).json({ error: "Voice audio not found." });
  }

  res.setHeader("Content-Type", clip.contentType);
  res.setHeader("Content-Length", String(clip.buffer.length));
  res.setHeader("Cache-Control", "no-store");
  return res.send(clip.buffer);
}
