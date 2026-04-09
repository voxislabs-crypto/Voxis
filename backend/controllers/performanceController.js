import { getPersonalityById } from "../models/personalityModel.js";
import { generateSpeechAudio, isTtsConfigured } from "../services/ttsService.js";
import { parseEPF, isPerformanceOutput, extractPlainText } from "../services/epfParser.js";

// ---------------------------------------------------------------------------
// Voice profile sanitizer — mirrors the one in ttsController.js
// ---------------------------------------------------------------------------
function sanitizeVoiceProfile(input, fallbackProfile = {}) {
  const source = input && typeof input === "object" ? input : fallbackProfile;
  const engine = String(source.engine || fallbackProfile.engine || "auto").trim().toLowerCase();
  const piperSpeaker = Number(source.piperSpeaker ?? fallbackProfile.piperSpeaker);
  return {
    enabled: source.enabled !== false,
    autoplay: Boolean(source.autoplay),
    engine: ["auto", "cloud", "openai", "piper"].includes(engine)
      ? engine === "openai" ? "cloud" : engine
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

// ---------------------------------------------------------------------------
// POST /personality/:id/performance
//
// Body: { text: string, voiceProfile?: object }
//
// Returns newline-delimited JSON (NDJSON) stream.  Each line is one of:
//
//   { type: "script",    script: EPFScript }
//   { type: "segment",   segmentId, startTime, moodLoop, type, lineIndex, totalLines }
//   { type: "audio",     segmentId, lineIndex, audioBase64, contentType, engine }
//   { type: "done",      totalSegments, totalLines }
//   { type: "error",     error: string }
//
// The client receives the full parsed script first, then audio chunks arrive
// segment-by-segment as they are synthesised.  The client can start playing
// audio for segment N while segment N+1 is being generated.
//
// Falls back to plain-text TTS if the input is not EPF-formatted.
// ---------------------------------------------------------------------------
export async function performanceHandler(req, res, next) {
  const personalityId = Number(req.params.id);
  const rawText = String(req.body.text || "").trim();

  if (!Number.isInteger(personalityId)) {
    return res.status(400).json({ error: "A valid personality id is required." });
  }
  if (!rawText) {
    return res.status(400).json({ error: "text is required." });
  }

  const personality = getPersonalityById(personalityId);
  if (!personality) {
    return res.status(404).json({ error: "Personality not found." });
  }

  const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile, personality.voiceProfile);

  if (!isTtsConfigured(voiceProfile)) {
    return res.status(500).json({
      error: "TTS is not configured. Set up Cloud TTS (TTS_API_KEY) or Piper (PIPER_MODEL_PATH).",
    });
  }

  // Set up NDJSON stream
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (obj) => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(obj) + "\n");
    }
  };

  try {
    // Detect format
    const isEPF = isPerformanceOutput(rawText);

    if (!isEPF) {
      // Plain-text fallback: wrap in a single synthetic segment
      send({ type: "script", script: { version: "0.2", totalDuration: 0, segments: [{ id: "A0", segmentLetter: "A", segmentIndex: 0, type: "intro", startTime: 0, dialogueLines: [rawText], moodLoop: "ambient", audioDirection: "" }] } });
      send({ type: "segment", segmentId: "A0", startTime: 0, moodLoop: "ambient", segmentType: "intro", lineIndex: 0, totalLines: 1 });

      try {
        const audio = await generateSpeechAudio({ personality, text: rawText, voiceProfile });
        send({
          type: "audio",
          segmentId: "A0",
          lineIndex: 0,
          audioBase64: audio.buffer.toString("base64"),
          contentType: audio.contentType,
          engine: audio.engine,
        });
      } catch (audioErr) {
        send({ type: "error", error: `TTS failed: ${audioErr.message}` });
      }

      send({ type: "done", totalSegments: 1, totalLines: 1 });
      res.end();
      return;
    }

    // Parse EPF
    const script = parseEPF(rawText);
    send({ type: "script", script });

    let totalLines = 0;
    let totalSegments = 0;

    for (const segment of script.segments) {
      if (segment.dialogueLines.length === 0) continue;

      totalSegments++;
      send({
        type: "segment",
        segmentId: segment.id,
        startTime: segment.startTime,
        moodLoop: segment.moodLoop,
        segmentType: segment.type,
        lineIndex: 0,
        totalLines: segment.dialogueLines.length,
      });

      for (let lineIndex = 0; lineIndex < segment.dialogueLines.length; lineIndex++) {
        const line = segment.dialogueLines[lineIndex];
        totalLines++;

        try {
          const audio = await generateSpeechAudio({ personality, text: line, voiceProfile });
          send({
            type: "audio",
            segmentId: segment.id,
            lineIndex,
            text: line,
            audioBase64: audio.buffer.toString("base64"),
            contentType: audio.contentType,
            engine: audio.engine,
          });
        } catch (audioErr) {
          // Non-fatal: send error chunk but continue with remaining lines
          send({
            type: "audio_error",
            segmentId: segment.id,
            lineIndex,
            text: line,
            error: audioErr.message,
          });
        }
      }
    }

    send({ type: "done", totalSegments, totalLines });
  } catch (err) {
    send({ type: "error", error: err.message || "Performance generation failed." });
  }

  res.end();
}

// ---------------------------------------------------------------------------
// POST /personality/:id/performance/parse
//
// Body: { text: string }
//
// Returns the parsed EPF script as JSON without generating any audio.
// Useful for the client to preview the script structure or for testing.
// ---------------------------------------------------------------------------
export async function parsePerformanceHandler(req, res, next) {
  const personalityId = Number(req.params.id);
  const rawText = String(req.body.text || "").trim();

  if (!Number.isInteger(personalityId)) {
    return res.status(400).json({ error: "A valid personality id is required." });
  }
  if (!rawText) {
    return res.status(400).json({ error: "text is required." });
  }

  const personality = getPersonalityById(personalityId);
  if (!personality) {
    return res.status(404).json({ error: "Personality not found." });
  }

  const isEPF = isPerformanceOutput(rawText);
  if (!isEPF) {
    return res.json({ isEPF: false, plainText: rawText, script: null });
  }

  const script = parseEPF(rawText);
  const plainText = extractPlainText(script);

  return res.json({ isEPF: true, plainText, script });
}
