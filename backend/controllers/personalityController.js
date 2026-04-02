import {
  createPersonality,
  getAllPersonalities,
  getPersonalityById,
  updatePersonalityVoiceProfile,
} from "../models/personalityModel.js";

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
    preferredVoice: String(voiceProfile.preferredVoice || "").trim(),
  };
}

function normalizeDescription(description) {
  return /[.!?]$/.test(description) ? description : `${description}.`;
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
    const sourceUrls = sanitizeSourceUrls(req.body.sourceUrls);
    const researchSummary = String(req.body.researchSummary || "").trim();
    const speechStyle = String(req.body.speechStyle || "").trim();
    const notablePhrases = sanitizeItems(req.body.notablePhrases);
    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile);

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
      voiceProfile,
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

export function listPersonalitiesHandler(_req, res, next) {
  try {
    return res.json(getAllPersonalities());
  } catch (error) {
    return next(error);
  }
}

export function getPersonalityHandler(req, res, next) {
  try {
    const personality = getPersonalityById(Number(req.params.id));

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    return res.json(personality);
  } catch (error) {
    return next(error);
  }
}
