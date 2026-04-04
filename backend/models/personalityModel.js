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
    moodSensitivity: typeof row.moodSensitivity === "number" ? row.moodSensitivity : 1.0,
    expressionProfile: parseJsonObject(row.expressionProfile, {
      preset: "auto",
      calmness: 0.5,
      intensity: 0.5,
      blinkRate: 0.5,
      gazeDrift: 0.5,
    }),
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
      moodState,
      moodSensitivity,
      expressionProfile,
      ownerId
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
      @moodState,
      @moodSensitivity,
      @expressionProfile,
      @ownerId
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
    moodSensitivity: typeof personality.moodSensitivity === "number" ? personality.moodSensitivity : 1.0,
    expressionProfile: JSON.stringify(personality.expressionProfile || {}),
    ownerId: personality.ownerId || null,
  });

  return getPersonalityById(result.lastInsertRowid);
}

export function getAllPersonalities(ownerId = null) {
  const statement = ownerId
    ? db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, ownerId
        FROM personalities
        WHERE ownerId = ?
        ORDER BY id DESC
      `)
    : db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, ownerId
        FROM personalities
        ORDER BY id DESC
      `);

  const rows = ownerId ? statement.all(ownerId) : statement.all();
  return rows.map(normalizeRow);
}

export function getPersonalityById(id, ownerId = null) {
  const statement = ownerId
    ? db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, ownerId
        FROM personalities
        WHERE id = ? AND ownerId = ?
      `)
    : db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, ownerId
        FROM personalities
        WHERE id = ?
      `);

  const row = ownerId ? statement.get(id, ownerId) : statement.get(id);
  return normalizeRow(row);
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

