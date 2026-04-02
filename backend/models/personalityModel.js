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

function parseResearchSources(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === "object")
      : [];
  } catch {
    return [];
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
    researchSources: parseResearchSources(row.researchSources),
    behaviorRules: parseJsonArray(row.behaviorRules),
    goals: parseJsonArray(row.goals),
    values: parseJsonArray(row.coreValues),
    creativeContext: row.creativeContext || "default",
    moodBaseline: parseJsonObject(row.moodBaseline, {}),
    moodState: parseJsonObject(row.moodState, {}),
    voiceProfile: parseJsonObject(row.voiceProfile, {
      enabled: true,
      autoplay: false,
      pitch: 1,
      rate: 1,
      preferredVoice: "alloy",
      providerVoice: "alloy",
      providerModel: "gpt-4o-mini-tts",
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
      researchSources,
      voiceProfile,
      behaviorRules,
      goals,
      coreValues,
      creativeContext,
      moodBaseline,
      moodState
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
      @researchSources,
      @voiceProfile,
      @behaviorRules,
      @goals,
      @coreValues,
      @creativeContext,
      @moodBaseline,
      @moodState
    )
  `);

  const result = statement.run({
    ...personality,
    traits: JSON.stringify(personality.traits),
    quirks: JSON.stringify(personality.quirks),
    sourceUrls: JSON.stringify(personality.sourceUrls || []),
    notablePhrases: JSON.stringify(personality.notablePhrases || []),
    researchSources: JSON.stringify(personality.researchSources || []),
    voiceProfile: JSON.stringify(personality.voiceProfile || {}),
    behaviorRules: JSON.stringify(personality.behaviorRules || []),
    goals: JSON.stringify(personality.goals || []),
    coreValues: JSON.stringify(personality.values || []),
    creativeContext: personality.creativeContext || "default",
    moodBaseline: JSON.stringify(personality.moodBaseline || {}),
    moodState: JSON.stringify(personality.moodState || {}),
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
      researchSources,
      voiceProfile,
      behaviorRules,
      goals,
      coreValues,
      creativeContext,
      moodBaseline,
      moodState
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
      researchSources,
      voiceProfile,
      behaviorRules,
      goals,
      coreValues,
      creativeContext,
      moodBaseline,
      moodState
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

export function updateMoodState(id, moodState) {
  db.prepare(`UPDATE personalities SET moodState = ? WHERE id = ?`).run(
    JSON.stringify(moodState),
    id,
  );
}

