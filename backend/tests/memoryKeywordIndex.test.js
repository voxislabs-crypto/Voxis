import { afterAll, describe, expect, it } from "vitest";
import db from "../db/db.js";
import {
  clearPersonalityMemory,
  deleteMemoryFact,
  loadContextCandidateMemories,
  pruneMemory,
  updateMemoryFact,
  upsertMemoryFact,
} from "../models/memoryModel.js";

const BULK_ID = 8800001;
const WRITE_ID = 8800002;
const PRUNE_ID = 8800003;

function ensurePersonality(personalityId) {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt)
     VALUES (?, 'Index Probe', 'temporary index probe', '[]', '[]', 'neutral', 'probe')`,
  ).run(personalityId);
}

function wipe(personalityId) {
  db.prepare(`DELETE FROM memory_keyword_index WHERE personalityId = ?`).run(personalityId);
  db.prepare(`DELETE FROM personality_memory WHERE personalityId = ?`).run(personalityId);
  db.prepare(`DELETE FROM personalities WHERE id = ? AND name = 'Index Probe'`).run(personalityId);
}

function indexCount(personalityId) {
  return db
    .prepare(`SELECT COUNT(*) AS count FROM memory_keyword_index WHERE personalityId = ?`)
    .get(personalityId).count;
}

describe("memory keyword index", () => {
  afterAll(() => {
    wipe(BULK_ID);
    wipe(WRITE_ID);
    wipe(PRUNE_ID);
  });

  it("backfills old rows on the first context call and answers the second from the index", () => {
    wipe(BULK_ID);
    ensurePersonality(BULK_ID);
    const insert = db.prepare(
      `INSERT INTO personality_memory (personalityId, memoryType, content, importance, enabled)
       VALUES (?, 'note', ?, ?, 1)`,
    );
    const seed = db.transaction(() => {
      for (let index = 0; index < 3000; index += 1) {
        insert.run(BULK_ID, `noise ledger alpha bravo charlie item ${index}`, 3);
      }
      for (let index = 0; index < 25; index += 1) {
        insert.run(BULK_ID, `zephyrquartz signal ledger ${index}`, 6);
      }
      insert.run(BULK_ID, "quiet anchor beacon for the persona", 9);
    });
    seed();

    expect(indexCount(BULK_ID)).toBe(0);

    const firstStarted = performance.now();
    const first = loadContextCandidateMemories(BULK_ID, "zephyrquartz signal");
    const firstMs = performance.now() - firstStarted;

    expect(first.retrieval).toBe("scan");
    expect(indexCount(BULK_ID)).toBeGreaterThan(0);

    const secondStarted = performance.now();
    const second = loadContextCandidateMemories(BULK_ID, "zephyrquartz signal");
    const secondMs = performance.now() - secondStarted;

    expect(second.retrieval).toBe("index");
    expect(secondMs).toBeLessThan(50);
    expect(secondMs).toBeLessThan(firstMs);
    expect(second.memories.some((memory) => String(memory.content).includes("zephyrquartz"))).toBe(true);
    expect(second.memories.some((memory) => Number(memory.importance) >= 8)).toBe(true);

    const missed = loadContextCandidateMemories(BULK_ID, "xylophonequartz");
    expect(missed.retrieval).toBe("scan");
    expect(missed.memories.length).toBeLessThanOrEqual(40);
  }, 30000);

  it("indexes writes and drops keywords when a memory is deleted or edited", () => {
    wipe(WRITE_ID);
    ensurePersonality(WRITE_ID);
    const memoryId = Number(upsertMemoryFact(WRITE_ID, "zephyrquartz arrived by upsert", "note", 5));
    const loaded = loadContextCandidateMemories(WRITE_ID, "zephyrquartz arrived");

    expect(loaded.retrieval).toBe("index");
    expect(loaded.memories.some((memory) => Number(memory.id) === memoryId)).toBe(true);

    updateMemoryFact(memoryId, {
      content: "bramblewick replaced the old phrase",
      memoryType: "note",
      importance: 5,
      enabled: 1,
    });

    const edited = loadContextCandidateMemories(WRITE_ID, "bramblewick replaced");
    expect(edited.retrieval).toBe("index");
    expect(edited.memories.some((memory) => String(memory.content).includes("bramblewick"))).toBe(true);

    const stale = loadContextCandidateMemories(WRITE_ID, "zephyrquartz arrived");
    expect(stale.retrieval).toBe("scan");

    deleteMemoryFact(memoryId);
    expect(
      db.prepare(`SELECT COUNT(*) AS count FROM memory_keyword_index WHERE memoryId = ?`).get(memoryId).count,
    ).toBe(0);
  });

  it("removes index rows for pruned and cleared memories", () => {
    wipe(PRUNE_ID);
    ensurePersonality(PRUNE_ID);
    for (let index = 0; index < 55; index += 1) {
      const token = index < 5 ? "prunegone" : "prunekeep";
      upsertMemoryFact(PRUNE_ID, `${token} ledger row ${index} alpha`, "note", 4);
    }

    pruneMemory(PRUNE_ID, 50);
    const kept = loadContextCandidateMemories(PRUNE_ID, "prunekeep ledger");
    expect(kept.retrieval).toBe("index");
    expect(kept.memories.some((memory) => String(memory.content).includes("prunegone"))).toBe(false);

    const gone = loadContextCandidateMemories(PRUNE_ID, "prunegone");
    expect(gone.retrieval).toBe("scan");
    expect(gone.memories.some((memory) => String(memory.content).includes("prunegone"))).toBe(false);

    clearPersonalityMemory(PRUNE_ID);
    expect(indexCount(PRUNE_ID)).toBe(0);
  });
});
