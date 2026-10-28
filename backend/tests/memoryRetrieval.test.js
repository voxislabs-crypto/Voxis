import { afterAll, describe, expect, it } from "vitest";
import db from "../db/db.js";
import { pruneMemories, retrieveMemories, upsertMemoryFact } from "../models/memoryModel.js";

const RETRIEVE_ID = 8800011;
const PRUNE_ID = 8800012;
const NOW = Date.parse("2026-10-27T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function sqlTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function ensurePersonality(personalityId) {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt)
     VALUES (?, 'Retrieval Probe', 'temporary retrieval probe', '[]', '[]', 'neutral', 'probe')`,
  ).run(personalityId);
}

function wipe(personalityId) {
  db.prepare(`DELETE FROM memory_keyword_index WHERE personalityId = ?`).run(personalityId);
  db.prepare(`DELETE FROM personality_memory WHERE personalityId = ?`).run(personalityId);
  db.prepare(`DELETE FROM personalities WHERE id = ? AND name = 'Retrieval Probe'`).run(personalityId);
}

function ageMemory(id, createdMs, accessedMs = null) {
  db.prepare(
    `UPDATE personality_memory
     SET createdAt = ?, lastAccessedAt = ?, accessCount = 0
     WHERE id = ?`,
  ).run(sqlTime(createdMs), accessedMs == null ? null : sqlTime(accessedMs), id);
}

describe("temporal memory retrieval", () => {
  afterAll(() => {
    wipe(RETRIEVE_ID);
    wipe(PRUNE_ID);
  });

  it("has creation, last access, and access count columns", () => {
    const columns = db.prepare(`PRAGMA table_info(personality_memory)`).all().map((column) => column.name);
    expect(columns).toContain("createdAt");
    expect(columns).toContain("lastAccessedAt");
    expect(columns).toContain("accessCount");
  });

  it("keeps an old anchor ahead of an equally matching normal memory", async () => {
    wipe(RETRIEVE_ID);
    ensurePersonality(RETRIEVE_ID);
    const text = "harbor ledger budget plan";
    const normalId = upsertMemoryFact(RETRIEVE_ID, text, "note", 8);
    const anchorId = upsertMemoryFact(RETRIEVE_ID, "harbor ledger only", "note", 9);
    ageMemory(normalId, NOW - (90 * DAY));
    ageMemory(anchorId, NOW - (90 * DAY));

    const [first] = await retrieveMemories(RETRIEVE_ID, text, 1, { nowMs: NOW, queryEmbedding: null });
    expect(first.id).toBe(anchorId);
    expect(first.accessCount).toBe(1);
    expect(first.lastAccessedAt).toBeTruthy();
  });

  it("lifts a memory that was touched in the last week", async () => {
    wipe(RETRIEVE_ID);
    ensurePersonality(RETRIEVE_ID);
    const text = "alpha harbor ledger";
    const staleId = upsertMemoryFact(RETRIEVE_ID, `${text} stale`, "note", 6);
    const freshTouchId = upsertMemoryFact(RETRIEVE_ID, `${text} touched`, "note", 6);
    ageMemory(staleId, NOW - (40 * DAY));
    ageMemory(freshTouchId, NOW - (40 * DAY), NOW - (2 * DAY));

    const [first] = await retrieveMemories(RETRIEVE_ID, text, 1, { nowMs: NOW, queryEmbedding: null });
    expect(first.id).toBe(freshTouchId);
  });

  it("uses the semantic blend when a query embedding is present", async () => {
    wipe(RETRIEVE_ID);
    ensurePersonality(RETRIEVE_ID);
    const alignedId = upsertMemoryFact(RETRIEVE_ID, "unrelated granite pebble", "note", 5);
    const crossedId = upsertMemoryFact(RETRIEVE_ID, "unrelated granite pebble twin", "note", 5);
    db.prepare(`UPDATE personality_memory SET embedding = ?, embeddingModel = 'test' WHERE id = ?`)
      .run(JSON.stringify([1, 0]), alignedId);
    db.prepare(`UPDATE personality_memory SET embedding = ?, embeddingModel = 'test' WHERE id = ?`)
      .run(JSON.stringify([0, 1]), crossedId);

    const [first] = await retrieveMemories(RETRIEVE_ID, "marble statue", 1, {
      nowMs: NOW,
      queryEmbedding: [1, 0],
    });
    expect(first.id).toBe(alignedId);
  });

  it("fills the next slot with a different memory instead of a near duplicate", async () => {
    wipe(RETRIEVE_ID);
    ensurePersonality(RETRIEVE_ID);
    upsertMemoryFact(RETRIEVE_ID, "harbor ledger", "note", 5);
    upsertMemoryFact(RETRIEVE_ID, "harbor ledger copy", "note", 5);
    const otherId = upsertMemoryFact(RETRIEVE_ID, "quartz beacon", "note", 5);

    const picked = await retrieveMemories(RETRIEVE_ID, "harbor ledger quartz", 2, {
      nowMs: NOW,
      queryEmbedding: null,
    });
    expect(picked).toHaveLength(2);
    expect(picked.some((memory) => memory.id === otherId)).toBe(true);
    const harborHits = picked.filter((memory) => String(memory.content).includes("harbor ledger"));
    expect(harborHits).toHaveLength(1);
  });

  it("prunes past fifty by importance times decay and drops the index rows", () => {
    wipe(PRUNE_ID);
    ensurePersonality(PRUNE_ID);
    const ancientIds = [];
    for (let index = 0; index < 5; index += 1) {
      ancientIds.push(upsertMemoryFact(PRUNE_ID, `ancient normal ledger ${index}`, "note", 5));
    }
    const anchorId = upsertMemoryFact(PRUNE_ID, "ancient anchor ledger", "note", 10);
    for (let index = 0; index < 50; index += 1) {
      upsertMemoryFact(PRUNE_ID, `recent ledger ${index}`, "note", 5);
    }
    for (const id of ancientIds) ageMemory(id, NOW - (200 * DAY));
    ageMemory(anchorId, NOW - (200 * DAY));

    const removed = pruneMemories(PRUNE_ID, 50, { nowMs: NOW });
    const remaining = db
      .prepare(`SELECT id, content FROM personality_memory WHERE personalityId = ?`)
      .all(PRUNE_ID);

    expect(removed).toBe(6);
    expect(remaining).toHaveLength(50);
    expect(remaining.some((row) => row.id === anchorId)).toBe(true);
    expect(remaining.some((row) => String(row.content).startsWith("ancient normal"))).toBe(false);
    for (const id of ancientIds) {
      expect(
        db.prepare(`SELECT COUNT(*) AS count FROM memory_keyword_index WHERE memoryId = ?`).get(id).count,
      ).toBe(0);
    }
  });
});
