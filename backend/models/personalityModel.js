import db from "../db/db.js";

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

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
    bigFiveProfile: parseJsonObject(row.bigFiveProfile, {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    }),
    alignmentProfile: parseJsonObject(row.alignmentProfile, {
      enabled: false,
      alignment: "true_neutral",
    }),
    responseFocusProfile: parseJsonObject(row.responseFocusProfile, {
      defaultLens: "balanced",
      lenses: [],
    }),
    expressionStyle: (() => {
      const style = parseJsonObject(row.expressionStyle, {});
      return {
        sentenceStyle: String(style.sentenceStyle || "").trim(),
        interruptionRate: Number(style.interruptionRate) || 0.3,
        energy: String(style.energy || "medium").trim() || "medium",
        rules: parseJsonArray(style.rules),
      };
    })(),
    voiceProfile: parseJsonObject(row.voiceProfile, {
      enabled: true,
      autoplay: false,
      engine: "auto",
      pitch: 1,
      rate: 1,
      preferredVoice: "alloy",
      providerVoice: "alloy",
      providerModel: "gpt-4o-mini-tts",
      piperModelPath: "",
      piperSpeaker: null,
    }),
    prosodyTemplate: parseJsonObject(row.prosodyTemplate, {}),
    prosodyTemplatePath: String(row.prosodyTemplatePath || "").trim(),
    prosodySourceUrl: String(row.prosodySourceUrl || "").trim(),
    prosodyUpdatedAt: String(row.prosodyUpdatedAt || "").trim(),
    voiceSampleAnalysis: parseJsonObject(row.voiceSampleAnalysis, {}),
    voiceSampleSelectedAt: String(row.voiceSampleSelectedAt || "").trim(),
    gender: String(row.gender || "").trim(),
    avatarImageUrl: String(row.avatarImageUrl || "").trim(),
    singingProfile: parseJsonObject(row.singingProfile, {}),
    emotionDrift: parseJsonObject(row.emotionDrift, {}),
    llmConfig: parseJsonObject(row.llmConfig, {}),
    stateFlaws: parseJsonObject(row.stateFlaws, {
      intoxication: {
        enabled: false,
        level: 0,
        decayPerTurn: 0.02,
        triggerGain: 0.12,
        triggerKeywords: ["drink", "drunk", "alcohol", "whiskey", "vodka", "beer", "wine", "buzzed"],
      },
    }),
    vocalMannerisms: (() => {
      const raw = parseJsonObject(row.vocalMannerisms, {});
      return {
        frequency: Number(raw.frequency ?? 0.15),
        items: Array.isArray(raw.items) ? raw.items : [],
        sfxTags: Array.isArray(raw.sfxTags) ? raw.sfxTags : [],
        sfxFrequency: Number.isFinite(Number(raw.sfxFrequency)) ? Number(raw.sfxFrequency) : 0.25,
        sfxPlacement: raw.sfxPlacement || "random",
        sfxEarlyOffset: Number.isFinite(Number(raw.sfxEarlyOffset)) ? Number(raw.sfxEarlyOffset) : 0.2,
      };
    })(),
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
      bigFiveProfile,
      alignmentProfile,
      responseFocusProfile,
      expressionStyle,
      stateFlaws,
      vocalMannerisms,
      gender,
      avatarImageUrl,
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
      @bigFiveProfile,
      @alignmentProfile,
      @responseFocusProfile,
      @expressionStyle,
      @stateFlaws,
      @vocalMannerisms,
      @gender,
      @avatarImageUrl,
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
    bigFiveProfile: JSON.stringify(personality.bigFiveProfile || {}),
    alignmentProfile: JSON.stringify(personality.alignmentProfile || {}),
    responseFocusProfile: JSON.stringify(personality.responseFocusProfile || {}),
    expressionStyle: JSON.stringify(personality.expressionStyle || {}),
    stateFlaws: JSON.stringify(personality.stateFlaws || {}),
    vocalMannerisms: JSON.stringify(personality.vocalMannerisms || {}),
    gender: String(personality.gender || "").trim(),
    avatarImageUrl: String(personality.avatarImageUrl || "").trim(),
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
          moodSensitivity, expressionProfile, bigFiveProfile, alignmentProfile, responseFocusProfile, expressionStyle, stateFlaws, vocalMannerisms,
          prosodyTemplate, prosodyTemplatePath, prosodySourceUrl, prosodyUpdatedAt,
          voiceSampleAnalysis, voiceSampleSelectedAt, gender, avatarImageUrl, ownerId
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
          moodSensitivity, expressionProfile, bigFiveProfile, alignmentProfile, responseFocusProfile, expressionStyle, stateFlaws, vocalMannerisms,
          prosodyTemplate, prosodyTemplatePath, prosodySourceUrl, prosodyUpdatedAt,
          voiceSampleAnalysis, voiceSampleSelectedAt, gender, avatarImageUrl, ownerId
        FROM personalities
        ORDER BY id DESC
      `);
  const rows = ownerId ? statement.all(ownerId) : statement.all();
  return rows.map(normalizeRow);
}

export function getLegacyPersonalityCount() {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM personalities WHERE ownerId IS NULL`).get();
  return Number(row?.count || 0);
}

export function getPersonalityCountByOwner(ownerId) {
  const numericOwnerId = Number(ownerId);
  if (!Number.isInteger(numericOwnerId) || numericOwnerId <= 0) {
    return 0;
  }

  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM personalities WHERE ownerId = ?`)
    .get(numericOwnerId);

  return Number(row?.count || 0);
}

export function transferPersonalitiesToOwner({ fromOwnerId, toOwnerId, includeLegacy = false } = {}) {
  const sourceOwnerId = Number(fromOwnerId);
  const targetOwnerId = Number(toOwnerId);

  if (!Number.isInteger(sourceOwnerId) || sourceOwnerId <= 0) {
    return 0;
  }
  if (!Number.isInteger(targetOwnerId) || targetOwnerId <= 0) {
    return 0;
  }
  if (sourceOwnerId === targetOwnerId) {
    return 0;
  }

  let changes = 0;

  const transferOwned = db.prepare(`
    UPDATE personalities
    SET ownerId = ?
    WHERE ownerId = ?
  `).run(targetOwnerId, sourceOwnerId);
  changes += Number(transferOwned?.changes || 0);

  if (includeLegacy) {
    const transferLegacy = db.prepare(`
      UPDATE personalities
      SET ownerId = ?
      WHERE ownerId IS NULL
    `).run(targetOwnerId);
    changes += Number(transferLegacy?.changes || 0);
  }

  return changes;
}

export function claimLegacyPersonalities(ownerId) {
  const numericOwnerId = Number(ownerId);
  if (!Number.isInteger(numericOwnerId) || numericOwnerId <= 0) {
    return 0;
  }

  const result = db.prepare(`
    UPDATE personalities
    SET ownerId = ?
    WHERE ownerId IS NULL
  `).run(numericOwnerId);

  return Number(result?.changes || 0);
}

export function getPersonalityById(id, ownerId = null) {
  const statement = ownerId
    ? db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, bigFiveProfile, alignmentProfile, responseFocusProfile, expressionStyle, stateFlaws, vocalMannerisms,
          prosodyTemplate, prosodyTemplatePath, prosodySourceUrl, prosodyUpdatedAt,
          voiceSampleAnalysis, voiceSampleSelectedAt, gender, avatarImageUrl, ownerId
        FROM personalities
        WHERE id = ? AND ownerId = ?
      `)
    : db.prepare(`
        SELECT
          id, name, description, traits, quirks, mood, systemPrompt,
          sourceQuery, sourceUrls, researchSummary, speechStyle,
          notablePhrases, researchSources, voiceProfile, behaviorRules,
          goals, coreValues, creativeContext, moodBaseline, moodState,
          moodSensitivity, expressionProfile, bigFiveProfile, alignmentProfile, responseFocusProfile, expressionStyle, stateFlaws, vocalMannerisms,
          prosodyTemplate, prosodyTemplatePath, prosodySourceUrl, prosodyUpdatedAt,
          voiceSampleAnalysis, voiceSampleSelectedAt, gender, avatarImageUrl, ownerId
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

export function updatePersonalityProsodyTemplate(id, { template, templatePath, sourceUrl, updatedAt }) {
  const statement = db.prepare(`
    UPDATE personalities
    SET prosodyTemplate = ?, prosodyTemplatePath = ?, prosodySourceUrl = ?, prosodyUpdatedAt = ?
    WHERE id = ?
  `);

  statement.run(
    JSON.stringify(template || {}),
    String(templatePath || "").trim(),
    String(sourceUrl || "").trim(),
    String(updatedAt || "").trim(),
    id,
  );

  return getPersonalityById(id);
}

export function updatePersonalityVoiceSampleAnalysis(id, { analysis }) {
  const statement = db.prepare(`
    UPDATE personalities
    SET voiceSampleAnalysis = ?
    WHERE id = ?
  `);

  statement.run(JSON.stringify(analysis || {}), id);
  return getPersonalityById(id);
}

export function confirmPersonalityVoiceSampleSelection(id, { selectedSample, selectedAt, nextVoiceProfile }) {
  const statement = db.prepare(`
    UPDATE personalities
    SET voiceProfile = ?, voiceSampleSelectedAt = ?
    WHERE id = ?
  `);

  statement.run(
    JSON.stringify({
      ...(nextVoiceProfile || {}),
      selectedVoiceSample: selectedSample || null,
    }),
    String(selectedAt || "").trim(),
    id,
  );

  return getPersonalityById(id);
}

export function updatePersonality(id, personality) {
  const statement = db.prepare(`
    UPDATE personalities
    SET
      name = @name,
      description = @description,
      traits = @traits,
      quirks = @quirks,
      mood = @mood,
      systemPrompt = @systemPrompt,
      sourceQuery = @sourceQuery,
      sourceUrls = @sourceUrls,
      researchSummary = @researchSummary,
      speechStyle = @speechStyle,
      notablePhrases = @notablePhrases,
      researchSources = @researchSources,
      voiceProfile = @voiceProfile,
      behaviorRules = @behaviorRules,
      goals = @goals,
      coreValues = @coreValues,
      creativeContext = @creativeContext,
      moodBaseline = @moodBaseline,
      moodState = @moodState,
      moodSensitivity = @moodSensitivity,
      expressionProfile = @expressionProfile,
      bigFiveProfile = @bigFiveProfile,
      alignmentProfile = @alignmentProfile,
      responseFocusProfile = @responseFocusProfile,
      expressionStyle = @expressionStyle,
      stateFlaws = @stateFlaws,
      vocalMannerisms = @vocalMannerisms,
      gender = @gender,
      avatarImageUrl = @avatarImageUrl,
      singingProfile = @singingProfile,
      emotionDrift = @emotionDrift,
      llmConfig = @llmConfig
    WHERE id = @id
  `);

  statement.run({
    id,
    ...personality,
    traits: JSON.stringify(personality.traits || []),
    quirks: JSON.stringify(personality.quirks || []),
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
    moodSensitivity:
      typeof personality.moodSensitivity === "number" ? personality.moodSensitivity : 1.0,
    expressionProfile: JSON.stringify(personality.expressionProfile || {}),
    bigFiveProfile: JSON.stringify(personality.bigFiveProfile || {}),
    alignmentProfile: JSON.stringify(personality.alignmentProfile || {}),
    responseFocusProfile: JSON.stringify(personality.responseFocusProfile || {}),
    expressionStyle: JSON.stringify(personality.expressionStyle || {}),
    stateFlaws: JSON.stringify(personality.stateFlaws || {}),
    vocalMannerisms: JSON.stringify(personality.vocalMannerisms || {}),
    gender: String(personality.gender || "").trim(),
    avatarImageUrl: String(personality.avatarImageUrl || "").trim(),
    singingProfile: JSON.stringify(personality.singingProfile || {}),
    emotionDrift: JSON.stringify(personality.emotionDrift || {}),
    llmConfig: JSON.stringify(personality.llmConfig || {}),
  });

  return getPersonalityById(id);
}

export function updateEmotionDrift(id, driftState) {
  db.prepare(`UPDATE personalities SET emotionDrift = ? WHERE id = ?`).run(
    JSON.stringify(driftState || {}),
    id,
  );
}

export function updateMoodState(id, moodState) {
  db.prepare(`UPDATE personalities SET moodState = ? WHERE id = ?`).run(
    JSON.stringify(moodState),
    id,
  );
}

export function updateStateFlaws(id, stateFlaws) {
  db.prepare(`UPDATE personalities SET stateFlaws = ? WHERE id = ?`).run(
    JSON.stringify(stateFlaws || {}),
    id,
  );
}

export function resetPersonalityState(id, moodState) {
  db.prepare(`UPDATE personalities SET moodState = ? WHERE id = ?`).run(
    JSON.stringify(moodState || {}),
    id,
  );

  return getPersonalityById(id);
}

export function deletePersonality(id) {
  db.prepare(`DELETE FROM personalities WHERE id = ?`).run(id);
}

