import {
  claimLegacyPersonalities,
  createPersonality,
  deletePersonality,
  getAllPersonalities,
  getLegacyPersonalityCount,
  getPersonalityById,
  resetPersonalityState,
  updatePersonality,
  updatePersonalityVoiceProfile,
} from "../models/personalityModel.js";
import { generateChatCompletion } from "../services/llmService.js";
import { clearChatMessagesForPersonality } from "../models/chatModel.js";
import { clearPersonalityMemory } from "../models/memoryModel.js";
import { moodFromLabel } from "../services/moodEngine.js";
import {
  deriveDefaultResponseFocusProfile,
  mapToVoxisPersonality,
} from "../services/hybridPersonalityService.js";
import { getAllVoicePresets, recommendVoicePreset } from "../services/voicePresetsService.js";
import { sanitizeVoiceProfile } from "../services/voiceProfileSanitizer.js";
import { normalizeStateFlaws } from "../services/stateFlawService.js";
import { extractPersonaFromConversation, classifyIntent } from "../services/personaExtractionService.js";
import { explainBehavior } from "../services/explanationService.js";
import { extractUserPreferences, storeUserPreferences } from "../services/preferenceLearningService.js";
import {
  fetchAndCacheSfx,
  getCachedSfxPath,
  isFreesoundConfigured,
  isValidSfxTag,
  normalizeSfxTag,
} from "../services/sfxCacheService.js";
import path from "path";
import { rm, unlink } from "fs/promises";

function sanitizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function sanitizeVocalMannerisms(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawFrequency = Number(source.frequency);
  const rawSfxFrequency = Number(source.sfxFrequency);
  const sfxTags = Array.from(new Set(
    sanitizeItems(source.sfxTags)
      .map((tag) => normalizeSfxTag(tag))
      .filter((tag) => isValidSfxTag(tag)),
  )).slice(0, 8);
  const sfxPlacementRaw = String(source.sfxPlacement || "random").trim().toLowerCase();
  const sfxPlacement = ["start", "end", "random", "throughout"].includes(sfxPlacementRaw)
    ? sfxPlacementRaw
    : "random";
  const rawSfxEarlyOffset = Number(source.sfxEarlyOffset);
  const sfxEarlyOffset = Number.isFinite(rawSfxEarlyOffset)
    ? Math.min(1, Math.max(0, rawSfxEarlyOffset))
    : 0.2;

  return {
    items: sanitizeItems(source.items).slice(0, 24),
    frequency: Number.isFinite(rawFrequency)
      ? Math.min(1, Math.max(0, rawFrequency))
      : 0.15,
    sfxTags,
    sfxFrequency: Number.isFinite(rawSfxFrequency)
      ? Math.min(1, Math.max(0, rawSfxFrequency))
      : 0.25,
    sfxPlacement,
    sfxEarlyOffset,
  };
}

async function prefetchPersonaSfx(vocalMannerisms) {
  if (!isFreesoundConfigured()) {
    return;
  }

  const sfxTags = Array.isArray(vocalMannerisms?.sfxTags) ? vocalMannerisms.sfxTags : [];
  if (!sfxTags.length) {
    return;
  }

  for (const tag of sfxTags) {
    const normalizedTag = normalizeSfxTag(tag);
    if (!normalizedTag || !isValidSfxTag(normalizedTag)) {
      continue;
    }

    const cached = await getCachedSfxPath(normalizedTag);
    if (cached) {
      continue;
    }

    try {
      await fetchAndCacheSfx(normalizedTag);
    } catch (error) {
      console.warn(`[SFX Cache] Prefetch failed for \"${normalizedTag}\": ${String(error?.message || error)}`);
    }
  }
}

function sanitizeStateFlaws(input) {
  return normalizeStateFlaws(input);
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

function hasMatchingConfirmation(existingName, confirmName) {
  return String(confirmName || "").trim() === String(existingName || "").trim();
}

const CHARACTER_CONFIRMATION_CONFIG = {
  suggestMinConfidence: 0.66,
  autoProceedConfidence: 0.9,
};

const CHARACTER_CONFIRMATION_LIBRARY = [
  {
    canonicalName: "Rick Sanchez",
    franchise: "Rick and Morty",
    aliases: ["rick sanchez", "rick c-137", "rick from rick and morty", "rick morty"],
  },
  {
    canonicalName: "Morty Smith",
    franchise: "Rick and Morty",
    aliases: ["morty", "morty smith", "morty from rick and morty"],
  },
  {
    canonicalName: "Dora the Explorer",
    franchise: "Dora the Explorer",
    aliases: ["dora the explorer", "dora explorer", "dora", "dora cartoon"],
  },
  {
    canonicalName: "Boots",
    franchise: "Dora the Explorer",
    aliases: ["boots", "boots monkey", "boots from dora"],
  },
  {
    canonicalName: "SpongeBob SquarePants",
    franchise: "SpongeBob SquarePants",
    aliases: ["spongebob", "spongebob squarepants", "sponge bob", "bob esponja"],
  },
  {
    canonicalName: "Patrick Star",
    franchise: "SpongeBob SquarePants",
    aliases: ["patrick", "patrick star", "patrick from spongebob"],
  },
  {
    canonicalName: "Bugs Bunny",
    franchise: "Looney Tunes",
    aliases: ["bugs bunny", "bugs", "bugs from looney tunes"],
  },
  {
    canonicalName: "Scooby-Doo",
    franchise: "Scooby-Doo",
    aliases: ["scooby", "scooby doo", "scooby-doo"],
  },
  {
    canonicalName: "Shaggy Rogers",
    franchise: "Scooby-Doo",
    aliases: ["shaggy", "shaggy rogers", "norville rogers"],
  },
  {
    canonicalName: "Mickey Mouse",
    franchise: "Disney",
    aliases: ["mickey", "mickey mouse"],
  },
  {
    canonicalName: "Donald Duck",
    franchise: "Disney",
    aliases: ["donald", "donald duck"],
  },
  {
    canonicalName: "Elsa",
    franchise: "Frozen",
    aliases: ["elsa", "queen elsa", "elsa frozen"],
  },
  {
    canonicalName: "Anna",
    franchise: "Frozen",
    aliases: ["anna frozen", "princess anna"],
  },
  {
    canonicalName: "Goku",
    franchise: "Dragon Ball",
    aliases: ["goku", "son goku", "kakarot"],
  },
  {
    canonicalName: "Vegeta",
    franchise: "Dragon Ball",
    aliases: ["vegeta", "prince vegeta"],
  },
  {
    canonicalName: "Naruto Uzumaki",
    franchise: "Naruto",
    aliases: ["naruto", "naruto uzumaki", "hokage naruto"],
  },
  {
    canonicalName: "Sasuke Uchiha",
    franchise: "Naruto",
    aliases: ["sasuke", "sasuke uchiha"],
  },
  {
    canonicalName: "Monkey D. Luffy",
    franchise: "One Piece",
    aliases: ["luffy", "monkey d luffy", "straw hat luffy"],
  },
  {
    canonicalName: "Roronoa Zoro",
    franchise: "One Piece",
    aliases: ["zoro", "roronoa zoro"],
  },
  {
    canonicalName: "Tony Stark",
    franchise: "Marvel",
    aliases: ["tony stark", "iron man", "ironman"],
  },
  {
    canonicalName: "Peter Parker",
    franchise: "Marvel",
    aliases: ["peter parker", "spider man", "spiderman", "spider-man"],
  },
  {
    canonicalName: "Bruce Wayne",
    franchise: "DC",
    aliases: ["bruce wayne", "batman", "the batman"],
  },
  {
    canonicalName: "Clark Kent",
    franchise: "DC",
    aliases: ["clark kent", "superman", "kal-el"],
  },
  {
    canonicalName: "Harry Potter",
    franchise: "Harry Potter",
    aliases: ["harry potter", "harry"],
  },
  {
    canonicalName: "Hermione Granger",
    franchise: "Harry Potter",
    aliases: ["hermione", "hermione granger"],
  },
  {
    canonicalName: "Darth Vader",
    franchise: "Star Wars",
    aliases: ["darth vader", "vader", "anakin skywalker"],
  },
  {
    canonicalName: "Luke Skywalker",
    franchise: "Star Wars",
    aliases: ["luke skywalker", "luke"],
  },
];

function normalizeCharacterName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const source = String(a || "");
  const target = String(b || "");
  if (!source) return target.length;
  if (!target) return source.length;

  const dp = Array.from({ length: source.length + 1 }, () => new Array(target.length + 1).fill(0));
  for (let i = 0; i <= source.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= target.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= source.length; i += 1) {
    for (let j = 1; j <= target.length; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[source.length][target.length];
}

function scoreAliasConfidence(normalizedInput, normalizedAlias) {
  if (!normalizedInput || !normalizedAlias) {
    return 0;
  }
  if (normalizedInput === normalizedAlias) {
    return 1;
  }

  const inputTokens = new Set(normalizedInput.split(" ").filter(Boolean));
  const aliasTokens = new Set(normalizedAlias.split(" ").filter(Boolean));
  const union = new Set([...inputTokens, ...aliasTokens]);
  let overlapCount = 0;
  for (const token of inputTokens) {
    if (aliasTokens.has(token)) {
      overlapCount += 1;
    }
  }
  const jaccard = union.size ? overlapCount / union.size : 0;

  const maxLen = Math.max(normalizedInput.length, normalizedAlias.length, 1);
  const distance = levenshteinDistance(normalizedInput, normalizedAlias);
  const editScore = Math.max(0, 1 - distance / maxLen);

  const containsBonus =
    normalizedAlias.includes(normalizedInput) || normalizedInput.includes(normalizedAlias)
      ? 0.08
      : 0;

  const ambiguousSingleTokenPenalty =
    inputTokens.size === 1 && aliasTokens.size === 1
      ? 0.22
      : 0;

  const shortTokenPenalty =
    Math.min(normalizedInput.length, normalizedAlias.length) <= 5
      ? 0.07
      : 0;

  const blended = editScore * 0.62 + jaccard * 0.38 + containsBonus - ambiguousSingleTokenPenalty - shortTokenPenalty;
  return Math.min(1, Math.max(0, blended));
}

function resolveCharacterConfirmation(name) {
  const normalizedInput = normalizeCharacterName(name);
  if (!normalizedInput) {
    return null;
  }

  let bestMatch = null;

  for (const entry of CHARACTER_CONFIRMATION_LIBRARY) {
    const aliases = [entry.canonicalName, ...(entry.aliases || [])].map(normalizeCharacterName).filter(Boolean);
    for (const alias of aliases) {
      const confidence = scoreAliasConfidence(normalizedInput, alias);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { entry, alias, confidence };
      }
    }
  }

  if (!bestMatch || bestMatch.confidence < CHARACTER_CONFIRMATION_CONFIG.suggestMinConfidence) {
    return null;
  }

  return {
    ...bestMatch,
    normalizedInput,
    canonicalName: bestMatch.entry.canonicalName,
    franchise: bestMatch.entry.franchise,
    requiresConfirmation: bestMatch.confidence < CHARACTER_CONFIRMATION_CONFIG.autoProceedConfidence,
  };
}

function buildCharacterConfirmationPrompt(match) {
  if (!match?.canonicalName) return "Please confirm the character identity.";
  return `Did you mean ${match.canonicalName} from ${match.franchise}? Confirm and I will proceed to build the persona.`;
}

async function removePersonaArtifacts(personality) {
  const personalityId = Number(personality?.id);
  if (Number.isInteger(personalityId)) {
    const voiceSampleDir = path.resolve(process.cwd(), "voice-samples", `persona-${personalityId}`);
    await rm(voiceSampleDir, { recursive: true, force: true }).catch(() => {});
  }

  const prosodyTemplatePath = String(personality?.prosodyTemplatePath || "").trim();
  if (prosodyTemplatePath) {
    const safePath = path.isAbsolute(prosodyTemplatePath)
      ? prosodyTemplatePath
      : path.resolve(process.cwd(), prosodyTemplatePath);
    await unlink(safePath).catch(() => {});
  }
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

function sanitizeCadenceRegulator(input) {
  const cadence = input && typeof input === "object" ? input : {};
  const mode = String(cadence.mode || "adaptive").trim().toLowerCase();
  const variability = String(cadence.variability || "high").trim().toLowerCase();
  const repetitionPenalty = String(cadence.repetitionPenalty || "strong").trim().toLowerCase();

  return {
    mode: ["manual", "adaptive"].includes(mode) ? mode : "adaptive",
    teasingFrequency: clamp01(cadence.teasingFrequency, 0.2),
    variability: ["low", "medium", "high"].includes(variability) ? variability : "high",
    repetitionPenalty: ["light", "medium", "strong"].includes(repetitionPenalty)
      ? repetitionPenalty
      : "strong",
    cooldownTurns: Math.max(0, Math.min(8, Number(cadence.cooldownTurns) || 2)),
    windowTurns: Math.max(3, Math.min(12, Number(cadence.windowTurns) || 6)),
  };
}

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
    cadenceRegulator: sanitizeCadenceRegulator(style.cadenceRegulator),
  };
}

function sanitizeResponseFocusProfile(input) {
  const profile = input && typeof input === "object" ? input : {};
  const lenses = Array.isArray(profile.lenses) ? profile.lenses : [];
  const sanitizedLenses = [];

  for (const rawLens of lenses.slice(0, 8)) {
    if (!rawLens || typeof rawLens !== "object") {
      continue;
    }

    const id = String(rawLens.id || rawLens.label || "").trim().toLowerCase();
    if (!id) {
      continue;
    }

    const triggers = rawLens.triggers && typeof rawLens.triggers === "object"
      ? rawLens.triggers
      : {};

    sanitizedLenses.push({
      id,
      label: String(rawLens.label || id).trim() || id,
      weight: clamp01(rawLens.weight, 0.5),
      priority: sanitizeItems(rawLens.priority).slice(0, 6),
      triggers: {
        emotions: sanitizeItems(triggers.emotions).slice(0, 5),
        intents: sanitizeItems(triggers.intents).slice(0, 5),
        topics: sanitizeItems(triggers.topics).slice(0, 5),
      },
      styleHints: sanitizeItems(rawLens.styleHints).slice(0, 4),
      antiPatterns: sanitizeItems(rawLens.antiPatterns).slice(0, 4),
      cooldown: clamp01(rawLens.cooldown, 0.15),
    });
  }

  const defaultLens = String(profile.defaultLens || "balanced").trim().toLowerCase() || "balanced";
  return {
    defaultLens,
    lenses: sanitizedLenses,
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
    cadenceRegulator: sanitizeCadenceRegulator(
      overrideStyle?.cadenceRegulator || baseStyle?.cadenceRegulator,
    ),
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
  stateFlaws,
  vocalMannerisms,
  researchSummary,
}) {
  const mannerismItems = Array.isArray(vocalMannerisms?.items) ? vocalMannerisms.items : [];
  const mannerismFrequency = Number(vocalMannerisms?.frequency);
  const mannerismFrequencyPct = Number.isFinite(mannerismFrequency)
    ? Math.round(Math.min(1, Math.max(0, mannerismFrequency)) * 100)
    : 0;

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

Vocal Mannerisms:

${mannerismItems.length ? buildBulletBlock(mannerismItems) : "- None specified"}
${mannerismItems.length ? `\nUse these naturally in about ${mannerismFrequencyPct}% of replies without overdoing them.` : ""}

State Flaws:

${stateFlaws?.intoxication?.enabled
  ? `- Intoxication active at ${Math.round((Number(stateFlaws.intoxication.level) || 0) * 100)}% intensity.`
  : "- None active"}

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
    const stateFlaws = sanitizeStateFlaws(req.body.stateFlaws);
    const vocalMannerisms = sanitizeVocalMannerisms(req.body.vocalMannerisms);
    const autoTuneHybrid = Boolean(req.body.autoTuneHybrid);
    const hybridTuning = autoTuneHybrid
      ? mapToVoxisPersonality({ bigFiveProfile, alignmentProfile })
      : null;
    const responseFocusProfileInput =
      req.body.responseFocusProfile !== undefined
        ? sanitizeResponseFocusProfile(req.body.responseFocusProfile)
        : null;
    const derivedResponseFocusProfile = deriveDefaultResponseFocusProfile({
      traits,
      values,
      goals,
      bigFiveProfile,
      alignmentProfile,
    });

    const creativeContext = hasDefinedValue(req.body.creativeContext)
      ? sanitizeCreativeContext(req.body.creativeContext)
      : hybridTuning?.creativeContext || "default";

    const expressionStyle = mergeExpressionStyle(hybridTuning?.expressionStyle, expressionStyleInput);

    const moodSensitivity = hasDefinedValue(req.body.moodSensitivity)
      ? Math.min(3.0, Math.max(0.1, Number(req.body.moodSensitivity) || 1.0))
      : hybridTuning?.moodSensitivity || 1.0;

    const moodBaseline = hybridTuning?.moodBaseline || moodFromLabel(mood);
    const moodState = { ...moodBaseline };
    const responseFocusProfile =
      responseFocusProfileInput && responseFocusProfileInput.lenses.length > 0
        ? responseFocusProfileInput
        : derivedResponseFocusProfile;

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
      stateFlaws,
      vocalMannerisms,
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
      responseFocusProfile,
      expressionStyle,
      stateFlaws,
      vocalMannerisms,
      ownerId: req.voxisUser?.id ?? null,
    });

    void prefetchPersonaSfx(vocalMannerisms);

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
    const stateFlaws =
      req.body.stateFlaws !== undefined
        ? sanitizeStateFlaws(req.body.stateFlaws)
        : sanitizeStateFlaws(existing.stateFlaws);
    const vocalMannerisms =
      req.body.vocalMannerisms !== undefined
        ? sanitizeVocalMannerisms(req.body.vocalMannerisms)
        : sanitizeVocalMannerisms(existing.vocalMannerisms);

    const autoTuneHybrid = Boolean(req.body.autoTuneHybrid);
    const hybridTuning = autoTuneHybrid
      ? mapToVoxisPersonality({ bigFiveProfile, alignmentProfile })
      : null;
    const responseFocusProfileInput =
      req.body.responseFocusProfile !== undefined
        ? sanitizeResponseFocusProfile(req.body.responseFocusProfile)
        : null;
    const derivedResponseFocusProfile = deriveDefaultResponseFocusProfile({
      traits,
      values,
      goals,
      bigFiveProfile,
      alignmentProfile,
    });

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
    const responseFocusProfile =
      responseFocusProfileInput !== null
        ? responseFocusProfileInput.lenses.length > 0
          ? responseFocusProfileInput
          : derivedResponseFocusProfile
        : existing?.responseFocusProfile && Array.isArray(existing.responseFocusProfile.lenses) && existing.responseFocusProfile.lenses.length > 0
          ? existing.responseFocusProfile
          : derivedResponseFocusProfile;

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
      stateFlaws,
      vocalMannerisms,
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
      responseFocusProfile,
      expressionStyle,
      stateFlaws,
      vocalMannerisms,
    });

    void prefetchPersonaSfx(vocalMannerisms);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export function listPersonalitiesHandler(req, res, next) {
  try {
    const ownerId = req.voxisUser?.id ?? null;
    return res.json({
      personalities: getAllPersonalities(ownerId),
      legacyPersonaCount: getLegacyPersonalityCount(),
    });
  } catch (error) {
    return next(error);
  }
}

export function claimLegacyPersonalitiesHandler(req, res, next) {
  try {
    const ownerId = Number(req.voxisUser?.id);

    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({ error: "A valid authenticated user is required to claim legacy personas." });
    }

    const claimedCount = claimLegacyPersonalities(ownerId);

    return res.json({
      claimedCount,
      personalities: getAllPersonalities(ownerId),
      legacyPersonaCount: getLegacyPersonalityCount(),
    });
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

export function getVoicePresetsHandler(req, res, next) {
  try {
    const presets = getAllVoicePresets();
    return res.json(presets);
  } catch (error) {
    return next(error);
  }
}

export function getRecommendedVoicePresetHandler(req, res, next) {
  try {
    const ownerId = req.voxisUser?.id ?? null;
    const personality = getPersonalityById(Number(req.params.id), ownerId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const preset = recommendVoicePreset(personality);
    return res.json(preset);
  } catch (error) {
    return next(error);
  }
}

export async function resetPersonalityHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const ownerId = req.voxisUser?.id ?? null;

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const personality = getPersonalityById(personalityId, ownerId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    if (!hasMatchingConfirmation(personality.name, req.body?.confirmName)) {
      return res.status(400).json({ error: "Type the persona name exactly to proceed." });
    }

    clearChatMessagesForPersonality(personalityId);
    clearPersonalityMemory(personalityId);

    const moodBaseline =
      personality?.moodBaseline && typeof personality.moodBaseline === "object"
        ? personality.moodBaseline
        : moodFromLabel(personality?.mood || "neutral");

    const updated = resetPersonalityState(personalityId, { ...moodBaseline });

    return res.json({
      ok: true,
      personality: updated,
      cleared: {
        chatMessages: true,
        memoryFacts: true,
        moodState: true,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function deletePersonalityHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const ownerId = req.voxisUser?.id ?? null;

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const personality = getPersonalityById(personalityId, ownerId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    if (!hasMatchingConfirmation(personality.name, req.body?.confirmName)) {
      return res.status(400).json({ error: "Type the persona name exactly to proceed." });
    }

    clearChatMessagesForPersonality(personalityId);
    clearPersonalityMemory(personalityId);
    await removePersonaArtifacts(personality);
    deletePersonality(personalityId);

    return res.json({ success: true, deletedName: personality.name, message: "Personality deleted successfully." });
  } catch (error) {
    return next(error);
  }
}

export async function analyzeCharacterHandler(req, res, next) {
  try {
    const { name, description, sourceUrls, confirmCharacterName } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Character name is required." });
    }

    const matchedCharacter = resolveCharacterConfirmation(name);
    const isConfirmed = hasMatchingConfirmation(matchedCharacter?.canonicalName, confirmCharacterName);
    if (matchedCharacter?.requiresConfirmation && !isConfirmed) {
      return res.json({
        needsConfirmation: true,
        canonicalName: matchedCharacter.canonicalName,
        franchise: matchedCharacter.franchise,
        confidence: Number(matchedCharacter.confidence.toFixed(3)),
        confirmationPrompt: buildCharacterConfirmationPrompt(matchedCharacter),
      });
    }

    const canonicalName = matchedCharacter?.canonicalName || name.trim();

    const analysisPrompt = `You are a character analysis expert. Analyze the following character and extract their key personality traits and quirks.

Character Name: ${canonicalName}
${description ? `Description: ${description}` : ""}
${sourceUrls && sourceUrls.length > 0 ? `Source URLs: ${sourceUrls.join(", ")}` : ""}

Return a JSON object with this exact structure:
{
  "traits": ["trait1", "trait2", "trait3"],
  "quirks": ["quirk1", "quirk2", "quirk3"],
  "sampleDialogue": ["sample line 1", "sample line 2", "sample line 3"],
  "speechStyle": "brief description of speech style",
  "mood": "primary mood",
  "avatarLikenessHint": "5-12 words describing a generic non-copyright visual vibe (e.g. spiky-haired scientist with portal-tech aura)"
}

Keep traits and quirks to 3-5 items each. Make sample dialogue authentic to the character's voice.
Do not mention trademarked logos, exact costume replicas, or protected artwork in avatarLikenessHint.`;

    const messages = [
      { role: "system", content: "You are a character analysis expert. Always return valid JSON." },
      { role: "user", content: analysisPrompt },
    ];

    const response = await generateChatCompletion(messages);

    let analysis;
    try {
      analysis = JSON.parse(response);
    } catch (parseError) {
      // Try to extract JSON from response if it's wrapped in markdown
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse analysis response");
      }
    }

    return res.json({
      name: canonicalName,
      description: description?.trim() || "",
      traits: Array.isArray(analysis.traits) ? analysis.traits : [],
      quirks: Array.isArray(analysis.quirks) ? analysis.quirks : [],
      sampleDialogue: Array.isArray(analysis.sampleDialogue) ? analysis.sampleDialogue : [],
      speechStyle: analysis.speechStyle || "",
      mood: analysis.mood || "neutral",
      avatarLikenessHint: String(
        analysis.avatarLikenessHint || `${canonicalName} inspired portrait silhouette`,
      ).trim(),
    });
  } catch (error) {
    console.error("Character analysis error:", error);
    return next(error);
  }
}

export async function extractPersonaHandler(req, res, next) {
  try {
    const { conversation, mode = "create", currentPersona } = req.body;

    if (!Array.isArray(conversation)) {
      return res.status(400).json({ error: "conversation must be an array of messages" });
    }

    const result = await extractPersonaFromConversation(conversation, mode, currentPersona);
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    // Learn user preferences from this interaction (async, don't block response)
    if (req.voxisUser?.id && result.success && result.data) {
      extractUserPreferences(conversation, result.data)
        .then(prefResult => {
          if (prefResult.success && prefResult.preferences.length > 0) {
            storeUserPreferences(req.voxisUser.id, prefResult.preferences);
          }
        })
        .catch(err => {
          console.error("[PreferenceLearning] Background learning error:", err);
        });
    }
    
    return res.json(result);
  } catch (error) {
    console.error("Persona extraction handler error:", error);
    return next(error);
  }
}

export async function explainBehaviorHandler(req, res, next) {
  try {
    const { personality, memories, mood, observerTrace, sessionId } = req.body;

    const result = await explainBehavior({ personality, memories, mood, observerTrace, sessionId });
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    return res.json({
      success: true,
      explanation: result.explanation,
      traceSummary: result.traceSummary,
    });
  } catch (error) {
    console.error("Behavior explanation handler error:", error);
    return next(error);
  }
}

export async function classifyIntentHandler(req, res, next) {
  try {
    const { message, hasSelectedPersona } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const result = await classifyIntent(message, hasSelectedPersona);
    
    return res.json(result);
  } catch (error) {
    console.error("Intent classification handler error:", error);
    return next(error);
  }
}
