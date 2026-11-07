import { afterEach, describe, expect, it } from "vitest";

import db from "../db/db.js";
import { getUserMood } from "../models/moodModel.js";
import { advanceTurnMood, withSpeechMood } from "../services/turnMood.js";

const personalityId = 910431;
const userId = 910432;
const rowMood = { valence: -0.5, arousal: 0.1, dominance: 0 };
const userMood = { valence: 0.35, arousal: -0.2, dominance: 0.4 };

function ensureFixture() {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt, moodState, moodBaseline, emotionDrift)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    personalityId,
    "Mood Source Persona",
    "test persona",
    "[]",
    "[]",
    "calm",
    "test prompt",
    JSON.stringify(rowMood),
    JSON.stringify({ valence: 0, arousal: 0, dominance: 0 }),
    JSON.stringify({}),
  );
  db.prepare("INSERT OR IGNORE INTO users (id, displayName) VALUES (?, ?)").run(userId, "Mood Source User");
  db.prepare("UPDATE personalities SET moodState = ?, moodBaseline = ? WHERE id = ?").run(
    JSON.stringify(rowMood),
    JSON.stringify({ valence: 0, arousal: 0, dominance: 0 }),
    personalityId,
  );
  db.prepare("DELETE FROM personality_user_mood WHERE personalityId = ?").run(personalityId);
}

function personality() {
  return {
    id: personalityId,
    name: "Mood Source Persona",
    mood: "calm",
    moodState: { ...rowMood },
    moodBaseline: { valence: 0, arousal: 0, dominance: 0 },
    emotionDrift: {},
    singingProfile: { archetype: "none" },
  };
}

function storedRowMood() {
  const raw = db.prepare("SELECT moodState FROM personalities WHERE id = ?").get(personalityId).moodState;
  return JSON.parse(raw);
}

describe("turn mood source", () => {
  afterEach(() => {
    db.prepare("DELETE FROM personality_user_mood WHERE personalityId = ?").run(personalityId);
    db.prepare("UPDATE personalities SET moodState = ? WHERE id = ?").run(JSON.stringify(rowMood), personalityId);
  });

  it("uses the signed-in mood for speech and leaves the personality row for anonymous speech", () => {
    ensureFixture();
    db.prepare(
      `INSERT INTO personality_user_mood (personalityId, userId, moodState, moodHistory, emotionDrift, updatedAt)
       VALUES (?, ?, ?, '[]', '{}', ?)`,
    ).run(personalityId, userId, JSON.stringify(userMood), new Date().toISOString());

    const source = personality();
    const signedIn = withSpeechMood(source, userId);
    const anonymous = withSpeechMood(source, null);

    expect(signedIn.moodState).toEqual(userMood);
    expect(anonymous.moodState).toEqual(rowMood);
    expect(anonymous).toBe(source);
  });

  it("advances the signed-in mood without writing the personality row", async () => {
    ensureFixture();
    const before = storedRowMood();
    const stepped = await advanceTurnMood({
      personality: personality(),
      userId,
      message: "hello",
      recentMessages: [],
    });

    const saved = getUserMood(personalityId, userId);
    expect(saved.moodState.valence).toBeCloseTo(stepped.newMood.valence);
    expect(saved.moodHistory).toHaveLength(1);
    expect(storedRowMood()).toEqual(before);
    expect(withSpeechMood(personality(), userId).moodState.valence).toBeCloseTo(stepped.newMood.valence);
  });

  it("advances the personality row when no user id is present", async () => {
    ensureFixture();
    const stepped = await advanceTurnMood({
      personality: personality(),
      userId: null,
      message: "hello",
      recentMessages: [],
    });

    expect(getUserMood(personalityId, userId)).toBeNull();
    expect(storedRowMood().valence).toBeCloseTo(stepped.newMood.valence);
  });
});
