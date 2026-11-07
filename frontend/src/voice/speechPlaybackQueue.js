// Sentence playback ledger for ChatWindow autoplay.
// A sentence is spoken only after playback completes. Submission, a finished
// synthesis request, and a started clip do not count.

export const SPEECH_STATE = {
  SUBMITTED: "submitted",
  GENERATED: "generated",
  PLAYBACK_STARTED: "playback_started",
  PLAYBACK_COMPLETED: "playback_completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

// The processor may retry a failed synthesis once. Final reconciliation may
// queue one more attempt. After that the sentence stays failed and is not removed.
const MAX_SPEECH_ATTEMPTS = 3;
const PROCESSOR_RETRY_CAP = MAX_SPEECH_ATTEMPTS - 1;

const MAX_STREAM_SENTENCE_CHARS = 220;
const DOT_PLACEHOLDER = "__VOXIS_DOT__";
const COMMON_ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "vs.",
  "etc.",
  "i.e.",
  "e.g.",
  "U.S.",
  "U.K.",
  "No.",
];

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeSpeechChunk(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitCompleteSentences(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return { sentences: [], remainder: "" };
  }

  let protectedSource = source;
  for (const abbr of COMMON_ABBREVIATIONS) {
    protectedSource = protectedSource.replace(
      new RegExp(escapeRegex(abbr), "g"),
      abbr.replace(/\./g, DOT_PLACEHOLDER),
    );
  }

  const sentences = [];
  const matcher = /[^.!?\n]+[.!?]+["')\]]*\s*/g;
  const restoreDots = (value) => String(value || "").replace(new RegExp(DOT_PLACEHOLDER, "g"), ".");
  let match = null;
  let cursor = 0;

  while ((match = matcher.exec(protectedSource)) !== null) {
    // A colon line or a sound cue can sit between two finished sentences.
    // The matcher skips that span. Keep it with the next sentence so playback
    // does not drop it.
    const gap = restoreDots(protectedSource.slice(cursor, match.index)).trim();
    const spoken = restoreDots(match[0]).trim();
    const sentence = [gap, spoken].filter(Boolean).join(" ");
    if (sentence) {
      sentences.push(sentence);
    }
    cursor = matcher.lastIndex;
  }

  return {
    sentences,
    remainder: restoreDots(protectedSource.slice(cursor)).trim(),
  };
}

export function splitLongSpeechChunk(text, maxChars = MAX_STREAM_SENTENCE_CHARS) {
  const normalized = normalizeSpeechChunk(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(",", maxChars);
    if (splitAt < Math.floor(maxChars * 0.4)) {
      splitAt = remaining.lastIndexOf(" ", maxChars);
    }
    if (splitAt <= 0) {
      splitAt = maxChars;
    }

    const part = remaining.slice(0, splitAt).trim();
    if (part) {
      chunks.push(part);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

export function collectSpeechChunks(text) {
  const { sentences, remainder } = splitCompleteSentences(text);
  const chunks = [];
  for (const sentence of sentences) {
    chunks.push(...splitLongSpeechChunk(sentence));
  }
  const tail = normalizeSpeechChunk(remainder);
  if (tail) {
    chunks.push(...splitLongSpeechChunk(tail));
  }
  return chunks.filter(Boolean);
}

export function createSpeechSession() {
  return {
    generation: 1,
    nextId: 1,
    records: [],
    pendingIds: [],
    awaitingIds: [],
    readyIds: [],
    currentId: null,
  };
}

function findRecord(session, id) {
  return session.records.find((record) => record.id === id) || null;
}

function isInPipeline(session, id) {
  return session.currentId === id
    || session.pendingIds.includes(id)
    || session.readyIds.includes(id)
    || session.awaitingIds.includes(id);
}

function dropId(list, id) {
  return list.filter((entry) => entry !== id);
}

export function replaceGeneration(session) {
  const closingGeneration = session.generation;
  for (const record of session.records) {
    if (record.generation !== closingGeneration) continue;
    if (record.state === SPEECH_STATE.PLAYBACK_COMPLETED) continue;
    record.state = SPEECH_STATE.CANCELLED;
  }
  session.pendingIds = [];
  session.awaitingIds = [];
  session.readyIds = [];
  session.currentId = null;
  session.generation += 1;
  session.records = session.records.filter((record) => record.generation === closingGeneration);
  return session.generation;
}

export function submitSentence(session, generation, { text, key, segmentIndex = -1 }) {
  if (generation !== session.generation) return null;
  const normalized = normalizeSpeechChunk(text);
  if (!normalized || !key) return null;
  const existing = session.records.find((record) =>
    record.generation === generation
    && record.key === key
    && record.state !== SPEECH_STATE.CANCELLED
  );
  if (existing) return null;
  const record = {
    id: session.nextId,
    generation,
    text: normalized,
    key,
    segmentIndex,
    state: SPEECH_STATE.SUBMITTED,
    attempts: 1,
  };
  session.nextId += 1;
  session.records.push(record);
  session.pendingIds.push(record.id);
  return record;
}

export function takeNextPending(session, generation) {
  if (generation !== session.generation) return null;
  while (session.pendingIds.length > 0) {
    const id = session.pendingIds.shift();
    const record = findRecord(session, id);
    if (!record || record.generation !== generation) continue;
    if (record.state !== SPEECH_STATE.SUBMITTED) continue;
    session.awaitingIds.push(record.id);
    return record;
  }
  return null;
}

function markFailed(session, id, generation) {
  if (generation !== session.generation) return false;
  const record = findRecord(session, id);
  if (!record || record.generation !== generation) return false;
  if (record.state === SPEECH_STATE.PLAYBACK_COMPLETED || record.state === SPEECH_STATE.CANCELLED) {
    return false;
  }
  record.state = SPEECH_STATE.FAILED;
  session.pendingIds = dropId(session.pendingIds, id);
  session.awaitingIds = dropId(session.awaitingIds, id);
  session.readyIds = dropId(session.readyIds, id);
  if (session.currentId === id) session.currentId = null;
  return true;
}

export function requeueUnfinished(session, generation, id, { fromReconcile = false } = {}) {
  if (generation !== session.generation) return null;
  const record = findRecord(session, id);
  if (!record || record.generation !== generation) return null;
  if (record.state === SPEECH_STATE.PLAYBACK_COMPLETED || record.state === SPEECH_STATE.CANCELLED) {
    return null;
  }
  if (isInPipeline(session, record.id)) return null;
  const cap = fromReconcile ? MAX_SPEECH_ATTEMPTS : PROCESSOR_RETRY_CAP;
  if (record.attempts >= cap) return null;
  record.attempts += 1;
  record.state = SPEECH_STATE.SUBMITTED;
  session.pendingIds.push(record.id);
  return record;
}

function acceptGeneratedAudio(session, id, generation) {
  if (generation !== session.generation) return false;
  if (!session.awaitingIds.includes(id)) return false;
  const record = findRecord(session, id);
  if (!record || record.generation !== generation || record.state !== SPEECH_STATE.SUBMITTED) {
    return false;
  }
  session.awaitingIds = dropId(session.awaitingIds, id);
  record.state = SPEECH_STATE.GENERATED;
  session.readyIds.push(record.id);
  return true;
}

// Applies one synthesis result. A stale generation or a second callback is "stale"
// and must not enter the ready queue. Failure stays on the record and may be retried.
export function settleSynthesis(session, generation, id, ok) {
  if (generation !== session.generation) return "stale";
  if (!session.awaitingIds.includes(id)) return "stale";
  const record = findRecord(session, id);
  if (!record || record.generation !== generation || record.state === SPEECH_STATE.CANCELLED) {
    return "stale";
  }
  if (!ok) {
    markFailed(session, id, generation);
    const retried = requeueUnfinished(session, generation, id, { fromReconcile: false });
    return retried ? "retry" : "failed";
  }
  return acceptGeneratedAudio(session, id, generation) ? "generated" : "stale";
}

export function takeNextReady(session, generation) {
  if (generation !== session.generation) return null;
  while (session.readyIds.length > 0) {
    const id = session.readyIds.shift();
    const record = findRecord(session, id);
    if (!record || record.generation !== generation) continue;
    if (record.state !== SPEECH_STATE.GENERATED) continue;
    session.currentId = record.id;
    return record;
  }
  return null;
}

export function settlePlaybackStarted(session, generation, id) {
  if (generation !== session.generation) return false;
  const record = findRecord(session, id);
  if (!record || record.generation !== generation) return false;
  if (session.currentId !== id || record.state !== SPEECH_STATE.GENERATED) return false;
  record.state = SPEECH_STATE.PLAYBACK_STARTED;
  return true;
}

export function settlePlaybackCompleted(session, generation, id) {
  if (generation !== session.generation) return false;
  const record = findRecord(session, id);
  if (!record || record.generation !== generation) return false;
  if (record.state !== SPEECH_STATE.PLAYBACK_STARTED && record.state !== SPEECH_STATE.GENERATED) {
    return false;
  }
  record.state = SPEECH_STATE.PLAYBACK_COMPLETED;
  if (session.currentId === id) session.currentId = null;
  return true;
}

export function reconcileFinalSpeech(session, generation, chunks) {
  const enqueued = [];
  const skippedCompleted = [];
  const stillActive = [];
  if (generation !== session.generation) {
    return { enqueued, skippedCompleted, stillActive };
  }

  const pool = session.records.filter((record) => record.generation === generation);
  const used = new Set();
  const list = Array.isArray(chunks) ? chunks : [];

  list.forEach((text, index) => {
    const normalized = normalizeSpeechChunk(text);
    if (!normalized) return;

    let match = -1;
    for (let cursor = 0; cursor < pool.length; cursor += 1) {
      if (used.has(cursor)) continue;
      if (pool[cursor].text === normalized && pool[cursor].state !== SPEECH_STATE.CANCELLED) {
        match = cursor;
        break;
      }
    }

    if (match === -1) {
      const created = submitSentence(session, generation, {
        text: normalized,
        key: `${generation}:final:${index}:${normalized}`,
        segmentIndex: index,
      });
      if (created) enqueued.push(created);
      return;
    }

    used.add(match);
    const record = pool[match];
    if (record.state === SPEECH_STATE.PLAYBACK_COMPLETED) {
      skippedCompleted.push(record);
      return;
    }

    const open = record.state === SPEECH_STATE.SUBMITTED
      || record.state === SPEECH_STATE.GENERATED
      || record.state === SPEECH_STATE.PLAYBACK_STARTED
      || record.state === SPEECH_STATE.FAILED;
    if (!open) return;

    if (isInPipeline(session, record.id)) {
      stillActive.push(record);
      return;
    }

    const retried = requeueUnfinished(session, generation, record.id, { fromReconcile: true });
    if (retried) {
      enqueued.push(retried);
      return;
    }
    stillActive.push(record);
  });

  return { enqueued, skippedCompleted, stillActive };
}

// Decides what ChatWindow does when streaming text and the saved reply meet.
// Stop holds the turn. A new session key replaces it. Reconciliation never
// treats a merely submitted sentence as spoken; that check lives in the ledger.
export function speechTurnDecision(input) {
  if (!input?.autoplayEnabled) return { action: "idle" };

  const sessionKey = String(input.sessionKey || "");
  const previousMessageKey = String(input.previousMessageKey || "");
  const activeSessionKey = input.activeSessionKey || null;
  const stoppedSessionKey = input.stoppedSessionKey || null;

  if (
    stoppedSessionKey
    && (stoppedSessionKey === sessionKey || stoppedSessionKey === previousMessageKey)
  ) {
    return { action: "hold-stop" };
  }

  if (input.isSending) {
    if (activeSessionKey !== sessionKey) return { action: "replace-turn" };
    return { action: "enqueue-new-sentences" };
  }

  if (
    input.streamUsed
    && (activeSessionKey === sessionKey || activeSessionKey === previousMessageKey)
  ) {
    return { action: "reconcile" };
  }
  if (input.streamUsed) return { action: "ignore-unrelated" };
  if (!input.hasLatestAssistantMessage) return { action: "idle" };
  if (Number(input.assistantMessageCount) <= Number(input.baselineCount)) return { action: "idle" };
  if (input.latestIsLive) return { action: "idle" };
  if (input.alreadyStamped) return { action: "idle" };
  return { action: "speak-full-text" };
}
