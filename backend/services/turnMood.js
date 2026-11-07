// One turn of VAD for text chat and the live call.
// Signed-in turns read and write personality_user_mood.
// With no user id, the personality row stays the fallback.
// Mood Engine math is unchanged.

import { updateEmotionDrift, updateMoodState } from "../models/personalityModel.js";
import {
  appendMoodHistory,
  getOrCreateUserMood,
  getUserMood,
  upsertUserMood,
} from "../models/moodModel.js";
import { reinforcePersonaPreferences, getPersonaPreferences } from "../models/preferencesModel.js";
import { getMoodRuntimeConfig } from "../models/settingsModel.js";
import {
  applyDecay,
  applyEmotionDrift,
  applyEmotionResidue,
  normalizeDriftState,
} from "./emotionMemoryDrift.js";
import { moodFromLabel, moodToLabel, stepMoodDetailed } from "./moodEngine.js";
import { computePreferenceMoodDelta, matchPreferencesInMessage } from "./preferencesService.js";

function hasVad(value) {
  return Boolean(value) && typeof value === "object" && "valence" in value;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function loadTurnMood(personality, userId) {
  const moodBaseline = hasVad(personality?.moodBaseline)
    ? personality.moodBaseline
    : moodFromLabel(personality?.mood);
  const fallbackMood = hasVad(personality?.moodState)
    ? personality.moodState
    : { ...moodBaseline };
  const userScopedId = positiveId(userId);
  const perUserMood = userScopedId
    ? getOrCreateUserMood(personality?.id, userScopedId, fallbackMood)
    : null;
  const currentMood = hasVad(perUserMood?.moodState) ? perUserMood.moodState : fallbackMood;
  return { moodBaseline, fallbackMood, userScopedId, perUserMood, currentMood };
}

// Speech and EmotionFrame use the signed-in mood when that row exists.
export function withSpeechMood(personality, userId) {
  const personalityId = positiveId(personality?.id);
  const userScopedId = positiveId(userId);
  if (!personality || !personalityId || !userScopedId) {
    return personality;
  }
  const stored = getUserMood(personalityId, userScopedId);
  if (!hasVad(stored?.moodState)) {
    return personality;
  }
  return {
    ...personality,
    moodState: stored.moodState,
    emotionDrift: stored.emotionDrift || personality.emotionDrift,
  };
}

export async function stepAndPersistTurnMood({
  personality,
  personalityId,
  userId = null,
  message,
  recentMessages = [],
  currentMood,
  moodBaseline,
  perUserMood = null,
  preferenceDelta = null,
}) {
  const moodStep = await stepMoodDetailed({
    currentMood,
    baseline: moodBaseline,
    message,
    personality,
    recentMessages,
    preferenceDelta,
    runtimeConfig: getMoodRuntimeConfig(),
  });
  const newMood = moodStep.mood;
  const moodLabel = moodToLabel(newMood);
  personality.mood = moodLabel;

  const previousMoodLabel = moodToLabel(currentMood);
  const moodIntensity = Math.min(
    1,
    Math.sqrt(
      Math.pow(newMood.valence || 0, 2) +
      Math.pow(newMood.arousal || 0, 2) +
      Math.pow(newMood.dominance || 0, 2),
    ) / Math.sqrt(3),
  );
  const driftSource = perUserMood ? perUserMood.emotionDrift : personality.emotionDrift;
  let driftState = normalizeDriftState(driftSource || {});
  driftState = applyDecay(driftState, 120, personality.singingProfile?.archetype || "none");
  driftState = applyEmotionResidue(driftState, previousMoodLabel);
  driftState = applyEmotionDrift(driftState, moodLabel.toLowerCase(), moodIntensity);

  const loadedMoodHistory = perUserMood && Array.isArray(perUserMood.moodHistory)
    ? perUserMood.moodHistory
    : [];
  const userScopedId = positiveId(userId);
  if (perUserMood && userScopedId) {
    const moodHistory = appendMoodHistory(loadedMoodHistory, newMood);
    upsertUserMood(personalityId, userScopedId, {
      moodState: newMood,
      moodHistory,
      emotionDrift: driftState,
    });
  } else {
    updateMoodState(personalityId, newMood);
    setImmediate(() => {
      updateEmotionDrift(personalityId, driftState);
    });
  }
  personality.moodState = newMood;
  personality.emotionDrift = driftState;

  return {
    moodStep,
    newMood,
    moodLabel,
    driftState,
    loadedMoodHistory,
  };
}

// Text chat steps through stepAndPersistTurnMood directly.
// Council, the live call, and the persona opener use this wrapper.
export async function advanceTurnMood({ personality, userId = null, message, recentMessages = [] }) {
  const personalityId = positiveId(personality?.id);
  const loaded = loadTurnMood(personality, userId);
  const personaPreferences = personalityId ? getPersonaPreferences(personalityId) : [];
  const preferenceMatches = matchPreferencesInMessage(personaPreferences, message);
  const preferenceDelta = preferenceMatches.allMatches.length > 0
    ? computePreferenceMoodDelta(preferenceMatches, personality)
    : null;
  const matchedPreferenceIds = preferenceMatches.allMatches
    .map((pref) => Number(pref.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (matchedPreferenceIds.length > 0) {
    reinforcePersonaPreferences(matchedPreferenceIds, 1);
  }

  const stepped = await stepAndPersistTurnMood({
    personality,
    personalityId,
    userId: loaded.userScopedId,
    message,
    recentMessages,
    currentMood: loaded.currentMood,
    moodBaseline: loaded.moodBaseline,
    perUserMood: loaded.perUserMood,
    preferenceDelta,
  });

  return {
    ...stepped,
    currentMood: loaded.currentMood,
    moodBaseline: loaded.moodBaseline,
    perUserMood: loaded.perUserMood,
    preferenceDelta,
  };
}
