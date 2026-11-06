import { describe, expect, it } from "vitest";

import db from "../db/db.js";
import { getUserContextModel } from "../models/userContextModel.js";
import {
  applyUserTurn,
  emptyUserContext,
  queryUserContext,
  recordUserTurn,
} from "../services/userContextStore.js";

const personalityId = 910410;
const userA = 910511;
const userB = 910512;

function ensureRows() {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(personalityId, "User Context Persona", "test", "[]", "[]", "calm", "test prompt");
  for (const userId of [userA, userB]) {
    db.prepare("INSERT OR IGNORE INTO users (id, displayName) VALUES (?, ?)").run(userId, `Context User ${userId}`);
  }
}

function clearModels() {
  db.prepare("DELETE FROM user_context_models WHERE personalityId = ?").run(personalityId);
}

describe("user context store", () => {
  it("keeps two users of the same persona on separate models", () => {
    ensureRows();
    clearModels();

    recordUserTurn({
      personalityId,
      userId: userA,
      message: "I am frustrated about the deploy",
      affect: { valence: -0.7, arousal: 0.8, intent: "vent", confidence: 0.8, focus: "the deploy" },
      now: new Date("2026-11-04T15:00:00.000Z"),
    });
    recordUserTurn({
      personalityId,
      userId: userB,
      message: "I prefer short answers",
      affect: { valence: 0.1, arousal: 0.3, intent: "share", confidence: 0.5, focus: null },
      now: new Date("2026-11-04T15:05:00.000Z"),
    });

    const first = queryUserContext({ personalityId, userId: userA, topic: "deploy", minTopicCount: 1 });
    const second = queryUserContext({ personalityId, userId: userB, preferenceKind: "likes" });

    expect(first.topics.map((topic) => topic.label)).toEqual(["the deploy"]);
    expect(first.patterns.turnCount).toBe(1);
    expect(first.patterns.lastIntent).toBe("vent");
    expect(first.timeSignals.hourCounts["15"]).toBe(1);
    expect(second.preferences.map((item) => item.text)).toContain("short answers");
    expect(second.topics).toEqual([]);

    clearModels();
  });

  it("records a gap and a repeated topic on the same scope", () => {
    ensureRows();
    clearModels();

    recordUserTurn({
      personalityId,
      userId: userA,
      sessionKey: "ignored-when-user-is-set",
      message: "frustrated about the deploy",
      affect: { valence: -0.6, arousal: 0.7, intent: "vent", confidence: 0.7, focus: "the deploy" },
      now: new Date("2026-11-04T15:00:00.000Z"),
    });
    const saved = recordUserTurn({
      personalityId,
      userId: userA,
      message: "the deploy is still broken",
      affect: { valence: -0.8, arousal: 0.8, intent: "vent", confidence: 0.8, focus: "the deploy" },
      now: new Date("2026-11-04T15:00:05.000Z"),
    });

    expect(saved.topics[0]).toMatchObject({ label: "the deploy", count: 2, lastValence: -0.8 });
    expect(saved.timeSignals.gapMs).toBe(5000);
    expect(saved.patterns.rapidTurns).toBe(1);
    expect(getUserContextModel(personalityId, `user:${userA}`).patterns.turnCount).toBe(2);

    clearModels();
  });

  it("stores anonymous sessions apart from each other", () => {
    ensureRows();
    clearModels();

    recordUserTurn({
      personalityId,
      sessionKey: `${personalityId}:anon-a`,
      message: "I like quiet mornings",
      affect: { valence: 0.4, arousal: 0.3, intent: "share", confidence: 0.6, focus: "quiet mornings" },
      now: new Date("2026-11-04T08:00:00.000Z"),
    });
    recordUserTurn({
      personalityId,
      sessionKey: `${personalityId}:anon-b`,
      message: "How do I export this?",
      affect: { valence: 0, arousal: 0.4, intent: "ask_help", confidence: 0.6, focus: null },
      now: new Date("2026-11-04T08:10:00.000Z"),
    });

    const first = queryUserContext({ personalityId, sessionKey: `${personalityId}:anon-a` });
    const second = queryUserContext({ personalityId, sessionKey: `${personalityId}:anon-b` });
    expect(first.topics[0].label).toBe("quiet mornings");
    expect(first.preferences[0]).toMatchObject({ kind: "likes", text: "quiet mornings" });
    expect(second.patterns.lastIntent).toBe("ask_help");
    expect(second.topics).toEqual([]);

    clearModels();
  });

  it("does not mutate the context object it was given", () => {
    const current = emptyUserContext();
    applyUserTurn(current, {
      message: "I hate long recaps",
      affect: { valence: -0.2, arousal: 0.4, intent: "share", focus: "long recaps" },
      now: new Date("2026-11-04T12:00:00.000Z"),
    });

    expect(current.patterns.turnCount).toBe(0);
    expect(current.preferences).toEqual([]);
  });
});
