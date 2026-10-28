import db from "../db/db.js";
import { upsertMemoryFact } from "../models/memoryModel.js";
import { updateMoodState } from "../models/personalityModel.js";

export const ROUND_QUEUE_FLUSH_MS = 2000;
export const ROUND_QUEUE_FLUSH_AT = 10;

// Pending round outcomes live in memory. If the process dies before the flush,
// the queue is lost. That is acceptable for fire-and-forget round logs.
// A future version could persist the queue to disk for crash safety.
let queue = [];
let timer = null;
let flushing = false;
let lastFlush = null;

function applyRoundJob(job) {
  upsertMemoryFact(job.personalityId, job.councilText, "council", 6);
  for (const note of job.notes || []) {
    if (!note) continue;
    upsertMemoryFact(job.personalityId, note, "note", 5);
  }
  if (job.nextMood) updateMoodState(job.personalityId, job.nextMood);
}

function writeRoundBatch(batch) {
  const run = db.transaction((jobs) => {
    for (const job of jobs) applyRoundJob(job);
  });
  run(batch);
}

let writeBatch = writeRoundBatch;

function clearTimer() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      flushRoundQueue();
    } catch (error) {
      console.error("[round-queue] flush failed", error);
    }
  }, ROUND_QUEUE_FLUSH_MS);
}

export function enqueueRoundJob(job) {
  queue.push(job);
  if (queue.length >= ROUND_QUEUE_FLUSH_AT) {
    clearTimer();
    flushRoundQueue();
    return;
  }
  scheduleFlush();
}

export function flushRoundQueue() {
  clearTimer();
  if (!queue.length || flushing) return lastFlush;
  const batch = queue.splice(0, queue.length);
  flushing = true;
  try {
    writeBatch(batch);
    lastFlush = { count: batch.length, transaction: true };
    console.info("[round-queue] flushed", lastFlush);
    return lastFlush;
  } finally {
    flushing = false;
  }
}

export function getLastRoundFlush() {
  return lastFlush ? { ...lastFlush } : null;
}

export function setRoundBatchWriter(writer) {
  writeBatch = writer;
}

export function resetRoundWriteQueue() {
  clearTimer();
  queue = [];
  flushing = false;
  lastFlush = null;
  writeBatch = writeRoundBatch;
}

export function pendingRoundCount() {
  return queue.length;
}
