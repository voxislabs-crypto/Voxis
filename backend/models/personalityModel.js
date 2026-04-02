import db from "../db/db.js";

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    traits: parseJsonArray(row.traits),
    quirks: parseJsonArray(row.quirks),
    sourceUrls: parseJsonArray(row.sourceUrls),
    notablePhrases: parseJsonArray(row.notablePhrases),
    voiceProfile: parseJsonObject(row.voiceProfile, {
      enabled: true,
      autoplay: false,
      pitch: 1,
      rate: 1,
      preferredVoice: "",
    }),
  };
}

export function createPersonality(personality) {
  const statement = db.prepare(`
    INSERT INTO personalities (
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
      voiceProfile
    )
    VALUES (
      @name,
      @description,
      @traits,
      @quirks,
      @mood,
      @systemPrompt,
      @sourceQuery,
      @sourceUrls,
      @researchSummary,
      @speechStyle,
      @notablePhrases,
      @voiceProfile
    )
  `);

  const result = statement.run({
    ...personality,
    traits: JSON.stringify(personality.traits),
    quirks: JSON.stringify(personality.quirks),
    sourceUrls: JSON.stringify(personality.sourceUrls || []),
    notablePhrases: JSON.stringify(personality.notablePhrases || []),
    voiceProfile: JSON.stringify(personality.voiceProfile || {}),
  });

  return getPersonalityById(result.lastInsertRowid);
}

export function getAllPersonalities() {
  const statement = db.prepare(`
    SELECT
      id,
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
      voiceProfile
    FROM personalities
    ORDER BY id DESC
  `);

  return statement.all().map(normalizeRow);
}

export function getPersonalityById(id) {
  const statement = db.prepare(`
    SELECT
      id,
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
      voiceProfile
    FROM personalities
    WHERE id = ?
  `);

  return normalizeRow(statement.get(id));
}

export function updatePersonalityVoiceProfile(id, voiceProfile) {
  const statement = db.prepare(`
    UPDATE personalities
    SET voiceProfile = ?
    WHERE id = ?
  `);

  statement.run(JSON.stringify(voiceProfile), id);
  return getPersonalityById(id);
}

