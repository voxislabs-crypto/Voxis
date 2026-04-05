import {
  createPersonality,
  getAllPersonalities,
  getPersonalityById,
  updatePersonality,
  updatePersonalityVoiceProfile,
} from "../models/personalityModel.js";
import { moodFromLabel } from "../services/moodEngine.js";
import { mapToVoxisPersonality } from "../services/hybridPersonalityService.js";

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
  const engine = String(voiceProfile.engine || "auto").trim().toLowerCase();
  const piperSpeaker = Number(voiceProfile.piperSpeaker);
  return {
    enabled: voiceProfile.enabled !== false,
    autoplay: Boolean(voiceProfile.autoplay),
    engine: ["auto", "cloud", "openai", "piper"].includes(engine)
      ? engine === "openai"
        ? "cloud"
        : engine
      : "auto",
    pitch: Math.min(1.6, Math.max(0.5, Number(voiceProfile.pitch) || 1)),
    rate: Math.min(1.6, Math.max(0.6, Number(voiceProfile.rate) || 1)),
    preferredVoice: String(
      voiceProfile.preferredVoice || voiceProfile.providerVoice || "alloy",
    ).trim(),
    providerVoice: String(
      voiceProfile.providerVoice || voiceProfile.preferredVoice || "alloy",
    ).trim(),
    providerModel: String(voiceProfile.providerModel || "gpt-4o-mini-tts").trim(),
    piperModelPath: String(voiceProfile.piperModelPath || "").trim(),
    piperSpeaker: Number.isFinite(piperSpeaker) && piperSpeaker >= 0 ? Math.floor(piperSpeaker) : null,
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

const VALID_ALIGNMENTS = new Set([
  "lawful_good",
  "neutral_good",
  "chaotic_good",
  "lawful_neutral",
  "true_neutral",
  "chaotic_neutral",
  "lawful_evil",
  "neutral_evil",
  "chaotic_evil",
]);

const VALID_EXPRESSION_ENERGY = new Set(["low", "medium", "high", "very_high"]);

function sanitizeBigFiveProfile(input) {
  const profile = input && typeof input === "object" ? input : {};
  return {
    openness: clamp01(profile.openness, 0.5),
    conscientiousness: clamp01(profile.conscientiousness, 0.5),
    extraversion: clamp01(profile.extraversion, 0.5),
    agreeableness: clamp01(profile.agreeableness, 0.5),
    neuroticism: clamp01(profile.neuroticism, 0.5),
  };
}

function sanitizeAlignmentProfile(input) {
  const profile = input && typeof input === "object" ? input : {};
  const alignment = String(profile.alignment || "true_neutral").trim().toLowerCase();
  return {
    enabled: Boolean(profile.enabled),
    alignment: VALID_ALIGNMENTS.has(alignment) ? alignment : "true_neutral",
  };
}

function sanitizeExpressionStyle(input) {
  const style = input && typeof input === "object" ? input : {};
  const energy = String(style.energy || "medium").trim().toLowerCase();
  return {
    sentenceStyle: String(style.sentenceStyle || "").trim(),
    interruptionRate: clamp01(style.interruptionRate, 0.3),
    energy: VALID_EXPRESSION_ENERGY.has(energy) ? energy : "medium",
    rules: sanitizeItems(style.rules).slice(0, 12),
  };
}

function hasDefinedValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function mergeExpressionStyle(baseStyle, overrideStyle) {
  const baseRules = Array.isArray(baseStyle?.rules) ? baseStyle.rules : [];
  const overrideRules = Array.isArray(overrideStyle?.rules) ? overrideStyle.rules : [];

  return {
    sentenceStyle: overrideStyle?.sentenceStyle || baseStyle?.sentenceStyle || "",
    interruptionRate:
      typeof overrideStyle?.interruptionRate === "number"
        ? overrideStyle.interruptionRate
        : typeof baseStyle?.interruptionRate === "number"
          ? baseStyle.interruptionRate
          : 0.3,
    energy: overrideStyle?.energy || baseStyle?.energy || "medium",
    rules: overrideRules.length ? overrideRules : baseRules,
  };
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
    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile);
    const expressionProfile = sanitizeExpressionProfile(req.body.expressionProfile);
    const bigFiveProfile = sanitizeBigFiveProfile(req.body.bigFiveProfile);
    const alignmentProfile = sanitizeAlignmentProfile(req.body.alignmentProfile);
    const expressionStyleInput = sanitizeExpressionStyle(req.body.expressionStyle);
    const autoTuneHybrid = Boolean(req.body.autoTuneHybrid);
    const hybridTuning = autoTuneHybrid
      ? mapToVoxisPersonality({ bigFiveProfile, alignmentProfile })
      : null;

    const creativeContext = hasDefinedValue(req.body.creativeContext)
      ? sanitizeCreativeContext(req.body.creativeContext)
      : hybridTuning?.creativeContext || "default";

    const expressionStyle = mergeExpressionStyle(hybridTuning?.expressionStyle, expressionStyleInput);

    const moodSensitivity = hasDefinedValue(req.body.moodSensitivity)
      ? Math.min(3.0, Math.max(0.1, Number(req.body.moodSensitivity) || 1.0))
      : hybridTuning?.moodSensitivity || 1.0;

    const moodBaseline = hybridTuning?.moodBaseline || moodFromLabel(mood);
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
      bigFiveProfile,
      alignmentProfile,
      expressionStyle,
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

export function updatePersonalityHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const ownerId = req.voxisUser?.id ?? null;

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const existing = getPersonalityById(personalityId, ownerId);

    if (!existing) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const name = String(req.body.name ?? existing.name ?? "").trim();
    const description = String(req.body.description ?? existing.description ?? "").trim();
    const mood = String(req.body.mood ?? existing.mood ?? "calm").trim() || "calm";
    const traits = req.body.traits !== undefined ? sanitizeItems(req.body.traits) : existing.traits;
    const quirks = req.body.quirks !== undefined ? sanitizeItems(req.body.quirks) : existing.quirks;
    const sourceQuery = String(req.body.sourceQuery ?? existing.sourceQuery ?? name).trim();
    const researchSources =
      req.body.researchSources !== undefined
        ? sanitizeResearchSources(req.body.researchSources)
        : sanitizeResearchSources(existing.researchSources);
    const sourceUrls = researchSources.length
      ? researchSources.map((source) => source.url)
      : req.body.sourceUrls !== undefined
        ? sanitizeSourceUrls(req.body.sourceUrls)
        : sanitizeSourceUrls(existing.sourceUrls);
    const researchSummary = String(req.body.researchSummary ?? existing.researchSummary ?? "").trim();
    const speechStyle = String(req.body.speechStyle ?? existing.speechStyle ?? "").trim();
    const notablePhrases =
      req.body.notablePhrases !== undefined
        ? sanitizeItems(req.body.notablePhrases)
        : sanitizeItems(existing.notablePhrases);
    const behaviorRules =
      req.body.behaviorRules !== undefined
        ? sanitizeItems(req.body.behaviorRules)
        : sanitizeItems(existing.behaviorRules);
    const goals = req.body.goals !== undefined ? sanitizeItems(req.body.goals) : sanitizeItems(existing.goals);
    const values =
      req.body.values !== undefined ? sanitizeItems(req.body.values) : sanitizeItems(existing.values);
    const voiceProfile =
      req.body.voiceProfile !== undefined
        ? sanitizeVoiceProfile(req.body.voiceProfile)
        : sanitizeVoiceProfile(existing.voiceProfile);
    const expressionProfile =
      req.body.expressionProfile !== undefined
        ? sanitizeExpressionProfile(req.body.expressionProfile)
        : sanitizeExpressionProfile(existing.expressionProfile);
    const bigFiveProfile =
      req.body.bigFiveProfile !== undefined
        ? sanitizeBigFiveProfile(req.body.bigFiveProfile)
        : sanitizeBigFiveProfile(existing.bigFiveProfile);
    const alignmentProfile =
      req.body.alignmentProfile !== undefined
        ? sanitizeAlignmentProfile(req.body.alignmentProfile)
        : sanitizeAlignmentProfile(existing.alignmentProfile);
    const expressionStyleInput =
      req.body.expressionStyle !== undefined
        ? sanitizeExpressionStyle(req.body.expressionStyle)
        : sanitizeExpressionStyle(existing.expressionStyle);

    const autoTuneHybrid = Boolean(req.body.autoTuneHybrid);
    const hybridTuning = autoTuneHybrid
      ? mapToVoxisPersonality({ bigFiveProfile, alignmentProfile })
      : null;

    const creativeContext =
      req.body.creativeContext !== undefined
        ? sanitizeCreativeContext(req.body.creativeContext)
        : hybridTuning?.creativeContext || sanitizeCreativeContext(existing.creativeContext);

    const expressionStyle = mergeExpressionStyle(hybridTuning?.expressionStyle, expressionStyleInput);

    const moodSensitivity =
      req.body.moodSensitivity !== undefined
        ? Math.min(3.0, Math.max(0.1, Number(req.body.moodSensitivity) || 1.0))
        : hybridTuning?.moodSensitivity || Math.min(3.0, Math.max(0.1, Number(existing.moodSensitivity) || 1.0));

    const moodBaseline = hybridTuning?.moodBaseline || moodFromLabel(mood);
    const shouldResetMoodState = Boolean(req.body.resetMoodState || autoTuneHybrid);
    const moodState = shouldResetMoodState
      ? { ...moodBaseline }
      : existing?.moodState && typeof existing.moodState === "object"
        ? existing.moodState
        : { ...moodBaseline };

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

    const updated = updatePersonality(personalityId, {
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
      bigFiveProfile,
      alignmentProfile,
      expressionStyle,
    });

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
