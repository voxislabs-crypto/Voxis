import { describe, expect, it } from "vitest";

import db from "../db/db.js";
import {
  appendMoodHistory,
  getOrCreateUserMood,
  getUserMood,
  MOOD_HISTORY_LIMIT,
  upsertUserMood,
} from "../models/moodModel.js";
import { applyEmotionDrift, normalizeDriftState } from "../services/emotionMemoryDrift.js";

const personalityId = 910210;
const userA = 910311;
const userB = 910312;

function ensurePersonality() {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt, moodState, emotionDrift)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    personalityId,
    "Mood Isolation Persona",
    "test persona",
    "[]",
    "[]",
    "calm",
    "test prompt",
    JSON.stringify({ valence: 0.2, arousal: -0.1, dominance: 0.4 }),
    JSON.stringify({ angry: { driftWeight: 1.4, exposureCount: 3 } }),
  );
  for (const userId of [userA, userB]) {
    db.prepare("INSERT OR IGNORE INTO users (id, displayName) VALUES (?, ?)").run(userId, `Mood User ${userId}`);
  }
}

function clearUserMood() {
  db.prepare("DELETE FROM personality_user_mood WHERE personalityId = ?").run(personalityId);
}

describe("per-user mood persistence", () => {
  it("creates a per-user row from the personality fallback on the first message", () => {
    ensurePersonality();
    clearUserMood();

    expect(getUserMood(personalityId, userA)).toBeNull();

    const created = getOrCreateUserMood(personalityId, userA, {
      valence: 0.2,
      arousal: -0.1,
      dominance: 0.4,
    });

    expect(created.moodState).toMatchObject({ valence: 0.2, arousal: -0.1, dominance: 0.4 });
    expect(created.moodHistory).toEqual([]);
    expect(created.emotionDrift).toEqual({});

    const personality = db.prepare("SELECT moodState, emotionDrift FROM personalities WHERE id = ?").get(personalityId);
    expect(JSON.parse(personality.moodState).valence).toBe(0.2);
    expect(JSON.parse(personality.emotionDrift).angry.driftWeight).toBe(1.4);

    clearUserMood();
  });

  it("keeps two users of the same personality on independent moods", () => {
    ensurePersonality();
    clearUserMood();

    getOrCreateUserMood(personalityId, userA, { valence: 0.1, arousal: 0, dominance: 0 });
    getOrCreateUserMood(personalityId, userB, { valence: -0.2, arousal: 0.3, dominance: 0.1 });

    upsertUserMood(personalityId, userA, {
      moodState: { valence: 0.9, arousal: 0.4, dominance: 0.2 },
      moodHistory: appendMoodHistory([], { valence: 0.9, arousal: 0.4, dominance: 0.2 }),
      emotionDrift: { angry: { driftWeight: 1.8 } },
    });

    const first = getUserMood(personalityId, userA);
    const second = getUserMood(personalityId, userB);

    expect(first.moodState.valence).toBe(0.9);
    expect(first.moodHistory).toHaveLength(1);
    expect(second.moodState).toMatchObject({ valence: -0.2, arousal: 0.3, dominance: 0.1 });
    expect(second.moodHistory).toEqual([]);
    expect(second.emotionDrift).toEqual({});

    clearUserMood();
  });

  it("appends VAD history and drops the oldest past the cap", () => {
    ensurePersonality();
    clearUserMood();

    let record = getOrCreateUserMood(personalityId, userA, { valence: 0, arousal: 0, dominance: 0 });
    for (let i = 0; i < MOOD_HISTORY_LIMIT + 3; i += 1) {
      const nextMood = { valence: i / 10, arousal: 0.2, dominance: -0.1 };
      record = upsertUserMood(personalityId, userA, {
        moodState: nextMood,
        moodHistory: appendMoodHistory(record.moodHistory, nextMood),
        emotionDrift: {},
      });
    }

    expect(record.moodHistory).toHaveLength(MOOD_HISTORY_LIMIT);
    expect(record.moodHistory[0].valence).toBeCloseTo(0.3);
    expect(record.moodHistory[MOOD_HISTORY_LIMIT - 1].valence).toBeCloseTo(1.4);
    expect(record.moodHistory[0]).toEqual(expect.objectContaining({
      arousal: 0.2,
      dominance: -0.1,
    }));

    const reloaded = getUserMood(personalityId, userA);
    expect(reloaded.moodHistory).toHaveLength(MOOD_HISTORY_LIMIT);
    expect(reloaded.moodState.valence).toBeCloseTo(1.4);

    clearUserMood();
  });

  it("reloads emotion drift weights after a save", () => {
    ensurePersonality();
    clearUserMood();

    const drift = applyEmotionDrift(normalizeDriftState({}), "angry", 1);
    upsertUserMood(personalityId, userA, {
      moodState: { valence: -0.4, arousal: 0.6, dominance: 0.5 },
      moodHistory: appendMoodHistory([], { valence: -0.4, arousal: 0.6, dominance: 0.5 }),
      emotionDrift: drift,
    });

    const loaded = getUserMood(personalityId, userA);
    expect(loaded.emotionDrift.angry.exposureCount).toBe(drift.angry.exposureCount);
    expect(loaded.emotionDrift.angry.driftWeight).toBe(drift.angry.driftWeight);
    expect(loaded.emotionDrift.angry.driftWeight).toBeGreaterThan(1);
    expect(loaded.emotionDrift.calm.driftWeight).toBe(drift.calm.driftWeight);

    clearUserMood();
  });
});
