import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, upsertMemoryFact, updateMoodState } = vi.hoisted(() => ({
  transaction: vi.fn((fn) => (jobs) => fn(jobs)),
  upsertMemoryFact: vi.fn(),
  updateMoodState: vi.fn(),
}));

vi.mock("../db/db.js", () => ({
  default: { transaction },
}));

vi.mock("../models/memoryModel.js", () => ({
  upsertMemoryFact,
}));

vi.mock("../models/personalityModel.js", () => ({
  updateMoodState,
}));

const {
  ROUND_QUEUE_FLUSH_AT,
  enqueueRoundJob,
  flushRoundQueue,
  getLastRoundFlush,
  resetRoundWriteQueue,
  setRoundBatchWriter,
} = await import("../services/roundWriteQueue.js");

function job(id) {
  return {
    personalityId: id,
    seatId: "gpt",
    councilText: `Council on "batch": outcome ${id}`,
    notes: id === 1 ? ["extra note"] : [],
    nextMood: id === 1 ? { valence: 0.2, arousal: 0, dominance: 0 } : null,
  };
}

describe("round write queue", () => {
  const writer = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    resetRoundWriteQueue();
    writer.mockReset();
    transaction.mockClear();
    upsertMemoryFact.mockClear();
    updateMoodState.mockClear();
    setRoundBatchWriter(writer);
  });

  afterEach(() => {
    resetRoundWriteQueue();
    vi.useRealTimers();
  });

  it("flushes three jobs in one batch when the two second timer fires", () => {
    enqueueRoundJob(job(1));
    enqueueRoundJob(job(2));
    enqueueRoundJob(job(3));

    expect(writer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1999);
    expect(writer).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0][0]).toHaveLength(3);
    expect(getLastRoundFlush()).toEqual({ count: 3, transaction: true });
  });

  it("flushes immediately when the queue reaches ten items", () => {
    for (let index = 0; index < ROUND_QUEUE_FLUSH_AT; index += 1) {
      enqueueRoundJob(job(index));
    }

    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0][0]).toHaveLength(ROUND_QUEUE_FLUSH_AT);

    vi.advanceTimersByTime(2000);
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it("writes a batch through one sqlite transaction", () => {
    resetRoundWriteQueue();
    enqueueRoundJob(job(1));
    enqueueRoundJob(job(2));
    enqueueRoundJob(job(3));

    expect(transaction).not.toHaveBeenCalled();
    flushRoundQueue();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(upsertMemoryFact).toHaveBeenCalledTimes(4);
    expect(updateMoodState).toHaveBeenCalledTimes(1);
    expect(getLastRoundFlush()).toEqual({ count: 3, transaction: true });
  });
});
