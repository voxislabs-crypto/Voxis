import {
  createPersonality,
  getAllPersonalities,
  getPersonalityById,
  updatePersonalityVoiceProfile,
} from "../models/personalityModel.js";
import { moodFromLabel } from "../services/moodEngine.js";

function sanitizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function buildBulletBlock(items) {
  if (!items.length) {
    return "- None provided";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function sanitizeSourceUrls(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => String(item || "").trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function sanitizeVoiceProfile(input) {
  const voiceProfile = input && typeof input === "object" ? input : {};
  return {
    enabled: voiceProfile.enabled !== false,
    autoplay: Boolean(voiceProfile.autoplay),
    pitch: Math.min(1.6, Math.max(0.5, Number(voiceProfile.pitch) || 1)),
    rate: Math.min(1.6, Math.max(0.6, Number(voiceProfile.rate) || 1)),
    preferredVoice: String(
      voiceProfile.preferredVoice || voiceProfile.providerVoice || "alloy",
    ).trim(),
    providerVoice: String(
      voiceProfile.providerVoice || voiceProfile.preferredVoice || "alloy",
    ).trim(),
    providerModel: String(voiceProfile.providerModel || "gpt-4o-mini-tts").trim(),
  };
}

function sanitizeResearchSources(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        id: String(item.id || `source-${index + 1}`).trim(),
        title: String(item.title || "Untitled source").trim(),
        url: String(item.url || "").trim(),
        sourceType: String(item.sourceType || "web").trim(),
        text: String(item.text || "").trim(),
        score: Math.max(0, Math.min(100, Number(item.score) || 0)),
        rank: Math.max(1, Number(item.rank) || index + 1),
        transcriptAvailable: Boolean(item.transcriptAvailable),
        reasons: sanitizeItems(item.reasons || []).slice(0, 5),
      };
    })
    .filter((item) => item && item.url && item.text);
}

function normalizeDescription(description) {
  return /[.!?]$/.test(description) ? description : `${description}.`;
}

const VALID_CREATIVE_CONTEXTS = new Set([
  "default",
  "narrative_antagonist",
  "anti_hero",
  "morally_complex",
  "tragic_villain",
]);

function sanitizeCreativeContext(value) {
  const str = String(value || "").trim();
  return VALID_CREATIVE_CONTEXTS.has(str) ? str : "default";
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, n));
}

const VALID_EXPRESSION_PRESETS = new Set([
  "auto",
  "sentinel",
  "wisp",
  "oracle",
  "echo",
  "rogue",
]);

function sanitizeExpressionProfile(input) {
  const profile = input && typeof input === "object" ? input : {};
  const preset = String(profile.preset || "auto").trim().toLowerCase();
  return {
    preset: VALID_EXPRESSION_PRESETS.has(preset) ? preset : "auto",
    calmness: clamp01(profile.calmness, 0.5),
    intensity: clamp01(profile.intensity, 0.5),
    blinkRate: clamp01(profile.blinkRate, 0.5),
    gazeDrift: clamp01(profile.gazeDrift, 0.5),
  };
}

export function generateSystemPrompt({
  name,
  description,
  traits,
  quirks,
  mood,
  speechStyle,
  notablePhrases,
  researchSummary,
}) {
  return `You are ${name}.
Description: ${normalizeDescription(description)}

Traits:

${buildBulletBlock(traits)}

Quirks:

${buildBulletBlock(quirks)}

Speech Style:

${speechStyle || "Stay consistent with the character's established tone and cadence."}

Notable Phrases:

${buildBulletBlock(notablePhrases)}

Research Notes:

${researchSummary || "No external research notes were captured for this profile."}

Current Mood: ${mood}

You must ALWAYS stay in character.`;
}

export function createPersonalityHandler(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const mood = String(req.body.mood || "calm").trim() || "calm";
    const traits = sanitizeItems(req.body.traits);
    const quirks = sanitizeItems(req.body.quirks);
    const sourceQuery = String(req.body.sourceQuery || name).trim();
    const researchSources = sanitizeResearchSources(req.body.researchSources);
    const sourceUrls = researchSources.length
      ? researchSources.map((source) => source.url)
      : sanitizeSourceUrls(req.body.sourceUrls);
    const researchSummary = String(req.body.researchSummary || "").trim();
    const speechStyle = String(req.body.speechStyle || "").trim();
    const notablePhrases = sanitizeItems(req.body.notablePhrases);
    const behaviorRules = sanitizeItems(req.body.behaviorRules);
    const goals = sanitizeItems(req.body.goals);
    const values = sanitizeItems(req.body.values);
    const creativeContext = sanitizeCreativeContext(req.body.creativeContext);
    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile);
    const expressionProfile = sanitizeExpressionProfile(req.body.expressionProfile);
    const moodSensitivity = Math.min(3.0, Math.max(0.1, Number(req.body.moodSensitivity) || 1.0));
    const moodBaseline = moodFromLabel(mood);
    const moodState = { ...moodBaseline };

    if (!name) {
      return res.status(400).json({ error: "Name is required." });
    }

    if (!description) {
      return res.status(400).json({ error: "Description is required." });
    }

    const systemPrompt = generateSystemPrompt({
      name,
      description,
      traits,
      quirks,
      mood,
      speechStyle,
      notablePhrases,
      researchSummary,
    });

    const personality = createPersonality({
      name,
      description,
      traits,
      quirks,
      mood,
      systemPrompt,
      sourceQuery,
      sourceUrls,
      researchSummary,
      speechStyle,
      notablePhrases,
      researchSources,
      voiceProfile,
      behaviorRules,
      goals,
      values,
      creativeContext,
      moodBaseline,
      moodState,
      moodSensitivity,
      expressionProfile,
      ownerId: req.voxisUser?.id ?? null,
    });

    return res.status(201).json(personality);
  } catch (error) {
    return next(error);
  }
}

export function updateVoiceProfileHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const updated = updatePersonalityVoiceProfile(
      personalityId,
      sanitizeVoiceProfile(req.body.voiceProfile),
    );

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export function listPersonalitiesHandler(req, res, next) {
  try {
    const ownerId = req.voxisUser?.id ?? null;
    return res.json(getAllPersonalities(ownerId));
  } catch (error) {
    return next(error);
  }
}

export function getPersonalityHandler(req, res, next) {
  try {
    const ownerId = req.voxisUser?.id ?? null;
    const personality = getPersonalityById(Number(req.params.id), ownerId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    return res.json(personality);
  } catch (error) {
    return next(error);
  }
}
