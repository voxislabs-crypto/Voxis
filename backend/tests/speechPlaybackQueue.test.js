import { describe, expect, it } from "vitest";

import {
  SPEECH_STATE,
  collectSpeechChunks,
  createSpeechSession,
  reconcileFinalSpeech,
  replaceGeneration,
  requeueUnfinished,
  settlePlaybackCompleted,
  settlePlaybackStarted,
  settleSynthesis,
  speechTurnDecision,
  submitSentence,
  takeNextPending,
  takeNextReady,
} from "../../frontend/src/voice/speechPlaybackQueue.js";

function queueSentence(session, text, key = text) {
  const generation = session.generation;
  const record = submitSentence(session, generation, { text, key, segmentIndex: 0 });
  expect(record).not.toBeNull();
  return record;
}

function generate(session, record) {
  const taken = takeNextPending(session, record.generation);
  expect(taken?.id).toBe(record.id);
  expect(settleSynthesis(session, record.generation, record.id, true)).toBe("generated");
  expect(record.state).toBe(SPEECH_STATE.GENERATED);
  return record;
}

function playThrough(session, record) {
  generate(session, record);
  const ready = takeNextReady(session, record.generation);
  expect(ready?.id).toBe(record.id);
  expect(settlePlaybackStarted(session, record.generation, record.id)).toBe(true);
  expect(record.state).toBe(SPEECH_STATE.PLAYBACK_STARTED);
  expect(settlePlaybackCompleted(session, record.generation, record.id)).toBe(true);
  expect(record.state).toBe(SPEECH_STATE.PLAYBACK_COMPLETED);
}

describe("speech playback queue", () => {
  it("keeps an unfinished tail, including text with no closing punctuation", () => {
    expect(collectSpeechChunks("One. Two. tail without stop")).toEqual([
      "One.",
      "Two.",
      "tail without stop",
    ]);
    expect(collectSpeechChunks("Dr. Smith is here. Next")).toEqual([
      "Dr. Smith is here.",
      "Next",
    ]);
    expect(collectSpeechChunks(
      "You want a joke? Either way, here's one:\n\nWhy did the photon check into a hotel?\n\nBecause it had no mass.\n\n*BRAAAP*\n\nDid you get it? tail",
    )).toEqual([
      "You want a joke?",
      "Either way, here's one: Why did the photon check into a hotel?",
      "Because it had no mass.",
      "*BRAAAP* Did you get it?",
      "tail",
    ]);
  });

  it("does not treat a submitted sentence as spoken", () => {
    const session = createSpeechSession();
    const record = queueSentence(session, "Hello there.");
    expect(record.state).toBe(SPEECH_STATE.SUBMITTED);

    const whileQueued = reconcileFinalSpeech(session, session.generation, ["Hello there."]);
    expect(whileQueued.skippedCompleted).toEqual([]);
    expect(whileQueued.enqueued).toEqual([]);
    expect(whileQueued.stillActive.map((item) => item.id)).toEqual([record.id]);
    expect(session.records).toHaveLength(1);

    takeNextPending(session, record.generation);
    session.awaitingIds = [];
    const lost = reconcileFinalSpeech(session, session.generation, ["Hello there."]);
    expect(lost.skippedCompleted).toEqual([]);
    expect(lost.enqueued.map((item) => item.id)).toEqual([record.id]);
    expect(record.state).toBe(SPEECH_STATE.SUBMITTED);
    expect(session.pendingIds).toEqual([record.id]);
  });

  it("keeps a failed synthesis on the ledger and queues it again at reconciliation", () => {
    const session = createSpeechSession();
    const failed = queueSentence(session, "First line.");
    takeNextPending(session, failed.generation);
    expect(settleSynthesis(session, failed.generation, failed.id, false)).toBe("retry");
    takeNextPending(session, failed.generation);
    expect(settleSynthesis(session, failed.generation, failed.id, false)).toBe("failed");
    expect(failed.state).toBe(SPEECH_STATE.FAILED);
    const later = queueSentence(session, "Second line.");
    expect(session.records.find((item) => item.id === failed.id)).toBe(failed);
    expect(session.pendingIds).not.toContain(failed.id);

    playThrough(session, later);
    const plan = reconcileFinalSpeech(session, session.generation, [
      "First line.",
      "Second line.",
      "Unspoken tail",
    ]);

    expect(plan.skippedCompleted.map((item) => item.text)).toEqual(["Second line."]);
    expect(plan.enqueued.map((item) => item.text)).toEqual(["First line.", "Unspoken tail"]);
    expect(failed.state).toBe(SPEECH_STATE.SUBMITTED);
    expect(session.records.some((item) => item.text === "First line.")).toBe(true);

    const again = reconcileFinalSpeech(session, session.generation, [
      "First line.",
      "Second line.",
      "Unspoken tail",
    ]);
    expect(again.enqueued).toEqual([]);
    expect(again.skippedCompleted.map((item) => item.text)).toEqual(["Second line."]);
    expect(session.pendingIds.filter((id) => id === failed.id)).toHaveLength(1);

    takeNextPending(session, failed.generation);
    expect(settleSynthesis(session, failed.generation, failed.id, false)).toBe("failed");
    expect(failed.state).toBe(SPEECH_STATE.FAILED);
    expect(requeueUnfinished(session, session.generation, failed.id, { fromReconcile: true })).toBeNull();
    expect(session.records.find((item) => item.id === failed.id)?.state).toBe(SPEECH_STATE.FAILED);
  });

  it("does not replay a sentence whose playback already completed", () => {
    const session = createSpeechSession();
    const done = queueSentence(session, "Finished.");
    const sameAgain = queueSentence(session, "Finished.", "second");
    playThrough(session, done);
    takeNextPending(session, sameAgain.generation);
    settleSynthesis(session, sameAgain.generation, sameAgain.id, false);
    takeNextPending(session, sameAgain.generation);
    settleSynthesis(session, sameAgain.generation, sameAgain.id, false);

    const plan = reconcileFinalSpeech(session, session.generation, ["Finished.", "Finished."]);
    expect(plan.skippedCompleted.map((item) => item.id)).toEqual([done.id]);
    expect(plan.enqueued.map((item) => item.id)).toEqual([sameAgain.id]);
    expect(done.state).toBe(SPEECH_STATE.PLAYBACK_COMPLETED);
  });

  it("cancels playback on stop and ignores a late completion", () => {
    const session = createSpeechSession();
    const generation = session.generation;
    const record = queueSentence(session, "Still playing.");
    generate(session, record);
    expect(takeNextReady(session, generation)?.id).toBe(record.id);
    expect(settlePlaybackStarted(session, generation, record.id)).toBe(true);

    const nextGeneration = replaceGeneration(session);
    expect(nextGeneration).not.toBe(generation);
    expect(record.state).toBe(SPEECH_STATE.CANCELLED);
    expect(session.pendingIds).toEqual([]);
    expect(session.readyIds).toEqual([]);
    expect(session.currentId).toBeNull();
    expect(settlePlaybackCompleted(session, generation, record.id)).toBe(false);
    expect(record.state).toBe(SPEECH_STATE.CANCELLED);
    expect(reconcileFinalSpeech(session, generation, ["Still playing."]).enqueued).toEqual([]);
  });

  it("cancels synthesis on stop and drops a late audio result", () => {
    const session = createSpeechSession();
    const generation = session.generation;
    const record = queueSentence(session, "Still synthesizing.");
    expect(takeNextPending(session, generation)?.id).toBe(record.id);
    replaceGeneration(session);

    expect(settleSynthesis(session, generation, record.id, true)).toBe("stale");
    expect(record.state).toBe(SPEECH_STATE.CANCELLED);
    expect(session.readyIds).toEqual([]);
    expect(record.state).not.toBe(SPEECH_STATE.PLAYBACK_COMPLETED);
  });

  it("replaces the previous queue when a new turn starts", () => {
    const session = createSpeechSession();
    const oldGeneration = session.generation;
    const oldRecord = queueSentence(session, "Old sentence.");
    takeNextPending(session, oldGeneration);
    const nextGeneration = replaceGeneration(session);
    const fresh = submitSentence(session, nextGeneration, {
      text: "New sentence.",
      key: "new",
    });

    expect(settleSynthesis(session, oldGeneration, oldRecord.id, true)).toBe("stale");
    expect(session.readyIds).toEqual([]);
    expect(fresh?.state).toBe(SPEECH_STATE.SUBMITTED);
    expect(session.pendingIds).toEqual([fresh.id]);
    expect(submitSentence(session, oldGeneration, { text: "Old sentence.", key: "old" })).toBeNull();
  });

  it("refuses an old synthesis result after the new queue has started", () => {
    const session = createSpeechSession();
    const oldGeneration = session.generation;
    const oldRecord = queueSentence(session, "Delayed.");
    takeNextPending(session, oldGeneration);
    replaceGeneration(session);
    const current = queueSentence(session, "Current.");
    generate(session, current);

    expect(settleSynthesis(session, oldGeneration, oldRecord.id, true)).toBe("stale");
    expect(session.readyIds).toEqual([current.id]);
    expect(session.records.filter((item) => item.state === SPEECH_STATE.GENERATED).map((item) => item.id)).toEqual([
      current.id,
    ]);
  });

  it("reconciles a finished stream without replaying completed lines", () => {
    const session = createSpeechSession();
    const spoken = queueSentence(session, "I'm doing just fine.");
    const failed = queueSentence(session, "The park line.");
    playThrough(session, spoken);
    takeNextPending(session, failed.generation);
    settleSynthesis(session, failed.generation, failed.id, false);
    takeNextPending(session, failed.generation);
    settleSynthesis(session, failed.generation, failed.id, false);
    const inFlight = queueSentence(session, "Still working.");
    takeNextPending(session, inFlight.generation);

    const chunks = collectSpeechChunks(
      "I'm doing just fine. The park line. Still working. your call.",
    );
    const plan = reconcileFinalSpeech(session, session.generation, chunks);

    expect(plan.skippedCompleted.map((item) => item.text)).toEqual(["I'm doing just fine."]);
    expect(plan.stillActive.map((item) => item.text)).toEqual(["Still working."]);
    expect(plan.enqueued.map((item) => item.text)).toEqual(["The park line.", "your call."]);
    expect(spoken.state).toBe(SPEECH_STATE.PLAYBACK_COMPLETED);
    expect(session.records.filter((item) => item.text === "I'm doing just fine.")).toHaveLength(1);

    const second = reconcileFinalSpeech(session, session.generation, chunks);
    expect(second.enqueued).toEqual([]);
    expect(second.skippedCompleted.map((item) => item.id)).toEqual([spoken.id]);
  });
});

describe("speech turn decision", () => {
  const base = {
    autoplayEnabled: true,
    hasLatestAssistantMessage: true,
    assistantMessageCount: 2,
    baselineCount: 1,
    latestIsLive: false,
    alreadyStamped: false,
    streamUsed: false,
    activeSessionKey: null,
    stoppedSessionKey: null,
  };

  it("holds the turn when stop happens during playback or synthesis", () => {
    expect(speechTurnDecision({
      ...base,
      isSending: true,
      sessionKey: "23:1",
      previousMessageKey: "23:0",
      activeSessionKey: "23:1",
      stoppedSessionKey: "23:1",
      streamUsed: true,
    }).action).toBe("hold-stop");
  });

  it("holds the finished turn so the unsaved tail is not restarted after stop", () => {
    expect(speechTurnDecision({
      ...base,
      isSending: false,
      sessionKey: "23:2",
      previousMessageKey: "23:1",
      activeSessionKey: null,
      stoppedSessionKey: "23:1",
      streamUsed: false,
      alreadyStamped: true,
    }).action).toBe("hold-stop");
  });

  it("replaces the queue when a new message starts while an older sentence is synthesizing", () => {
    expect(speechTurnDecision({
      ...base,
      isSending: true,
      sessionKey: "23:3",
      previousMessageKey: "23:2",
      activeSessionKey: "23:1",
      stoppedSessionKey: "23:1",
      streamUsed: true,
    }).action).toBe("replace-turn");
  });

  it("reconciles after streaming completes and does not fall through to a second full reading", () => {
    expect(speechTurnDecision({
      ...base,
      isSending: false,
      sessionKey: "23:2",
      previousMessageKey: "23:1",
      activeSessionKey: "23:1",
      streamUsed: true,
      alreadyStamped: true,
    }).action).toBe("reconcile");

    expect(speechTurnDecision({
      ...base,
      isSending: false,
      sessionKey: "23:4",
      previousMessageKey: "23:3",
      activeSessionKey: "23:1",
      streamUsed: true,
    }).action).toBe("ignore-unrelated");
  });

  it("uses one full clip only when this turn never streamed", () => {
    expect(speechTurnDecision({
      ...base,
      isSending: false,
      sessionKey: "23:2",
      previousMessageKey: "23:1",
    }).action).toBe("speak-full-text");

    expect(speechTurnDecision({
      ...base,
      autoplayEnabled: false,
      isSending: false,
      sessionKey: "23:2",
      previousMessageKey: "23:1",
    }).action).toBe("idle");
  });
});
