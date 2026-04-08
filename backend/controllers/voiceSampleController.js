import path from "node:path";
import { promises as fs } from "node:fs";

import {
  getPersonalityById,
  updatePersonalityVoiceSampleAnalysis,
  confirmPersonalityVoiceSampleSelection,
} from "../models/personalityModel.js";
import { analyzeAudioSegments } from "../services/voiceSegmentationService.js";

function getOwnerId(req) {
  return req.voxisUser?.id ?? null;
}

function toPublicSample(personalityId, sample = {}) {
  return {
    clipIndex: sample.clipIndex,
    startTime: sample.startTime,
    endTime: sample.endTime,
    duration: sample.duration,
    averagePitch: sample.averagePitch,
    spectralCentroid: sample.spectralCentroid,
    speechDensity: sample.speechDensity,
    voiceBand: sample.voiceBand,
    voiceLabel: sample.voiceLabel,
    voiceQuality: sample.voiceQuality,
    confidence: sample.confidence,
    clipFile: sample.clipFile,
    audioUrl: sample.clipFile
      ? `/personality/${personalityId}/voice-samples/audio/${encodeURIComponent(sample.clipFile)}`
      : "",
  };
}

export async function extractVoiceSamplesHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const ownerId = getOwnerId(req);
    const audioFilePath = String(req.body?.audioFilePath || "").trim();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    if (!audioFilePath) {
      return res.status(400).json({ error: "audioFilePath is required." });
    }

    const personality = getPersonalityById(personalityId, ownerId);
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const analysis = await analyzeAudioSegments({
      personalityId,
      audioPath: audioFilePath,
    });

    const persistedAnalysis = {
      ...analysis,
      extractedAt: new Date().toISOString(),
      representatives: (analysis.representatives || []).map((sample) => toPublicSample(personalityId, sample)),
    };

    const updated = updatePersonalityVoiceSampleAnalysis(personalityId, {
      analysis: persistedAnalysis,
    });

    return res.json({
      personality: updated,
      voiceSamples: persistedAnalysis,
    });
  } catch (error) {
    return next(error);
  }
}

export function getVoiceSamplesHandler(req, res) {
  const personalityId = Number(req.params.id);
  const ownerId = getOwnerId(req);

  if (!Number.isInteger(personalityId)) {
    return res.status(400).json({ error: "A valid personality id is required." });
  }

  const personality = getPersonalityById(personalityId, ownerId);
  if (!personality) {
    return res.status(404).json({ error: "Personality not found." });
  }

  return res.json({
    personality,
    voiceSamples: personality.voiceSampleAnalysis || {},
  });
}

export function confirmVoiceSampleHandler(req, res) {
  const personalityId = Number(req.params.id);
  const ownerId = getOwnerId(req);
  const selectedSampleIndex = Number(req.body?.selectedSampleIndex);

  if (!Number.isInteger(personalityId)) {
    return res.status(400).json({ error: "A valid personality id is required." });
  }

  if (!Number.isInteger(selectedSampleIndex)) {
    return res.status(400).json({ error: "selectedSampleIndex is required." });
  }

  const personality = getPersonalityById(personalityId, ownerId);
  if (!personality) {
    return res.status(404).json({ error: "Personality not found." });
  }

  const representatives = Array.isArray(personality.voiceSampleAnalysis?.representatives)
    ? personality.voiceSampleAnalysis.representatives
    : [];

  const selectedSample = representatives.find((sample) => Number(sample.clipIndex) === selectedSampleIndex);
  if (!selectedSample) {
    return res.status(400).json({ error: "Selected sample is not available." });
  }

  const existingVoiceProfile = personality.voiceProfile || {};
  const selectedAt = new Date().toISOString();

  const updated = confirmPersonalityVoiceSampleSelection(personalityId, {
    selectedAt,
    selectedSample,
    nextVoiceProfile: {
      ...existingVoiceProfile,
      voiceSourceType: "audio-sampling",
      selectedSampleIndex,
      selectedVoiceLabel: selectedSample.voiceLabel,
      selectedVoiceConfidence: selectedSample.confidence,
    },
  });

  return res.json({
    personality: updated,
    selectedVoice: selectedSample,
  });
}

export async function streamVoiceSampleAudioHandler(req, res) {
  const personalityId = Number(req.params.id);
  const ownerId = getOwnerId(req);
  const clipFile = String(req.params.clipFile || "").trim();

  if (!Number.isInteger(personalityId) || !clipFile) {
    return res.status(400).json({ error: "Invalid voice sample request." });
  }

  const personality = getPersonalityById(personalityId, ownerId);
  if (!personality) {
    return res.status(404).json({ error: "Personality not found." });
  }

  const safeFile = path.basename(clipFile);
  const samplePath = path.resolve(process.cwd(), "voice-samples", `persona-${personalityId}`, safeFile);

  try {
    await fs.access(samplePath);
  } catch {
    return res.status(404).json({ error: "Voice sample audio not found." });
  }

  res.setHeader("Content-Type", "audio/wav");
  return res.sendFile(samplePath);
}
