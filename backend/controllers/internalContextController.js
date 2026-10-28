import { getPersonalityById } from "../models/personalityModel.js";
import { loadContextCandidateMemories } from "../models/memoryModel.js";
import { moodFromLabel, moodToLabel } from "../services/moodEngine.js";
import { resolveSeat } from "../services/seatMap.js";
import { enqueueRoundJob } from "../services/roundWriteQueue.js";
import {
  applyMoodDelta,
  buildContextBlock,
  clampContextChars,
  moodDeltaIsZero,
  rankContextMemories,
} from "../services/contextBlockService.js";

const MAX_TOPIC_CHARS = 500;
const MAX_OUTCOME_CHARS = 600;
const MAX_SEATS = 6;

function hasVad(value) {
  return Boolean(value) && typeof value === "object" && Number.isFinite(Number(value.valence));
}

function resolveMood(personality) {
  const mood = hasVad(personality.moodState)
    ? personality.moodState
    : moodFromLabel(personality.mood);
  return {
    mood,
    moodLabel: moodToLabel(mood),
  };
}

function readTopic(value) {
  const topic = String(value || "").replace(/\s+/g, " ").trim();
  if (!topic) return { error: "topic is required." };
  if (topic.length > 4000) return { error: "topic must be 4000 characters or fewer." };
  return { topic };
}

export async function internalContextHandler(req, res, next) {
  try {
    const topicResult = readTopic(req.body?.topic ?? req.body?.query);
    if (topicResult.error) {
      return res.status(400).json({ error: topicResult.error });
    }

    const seat = resolveSeat({
      seatId: req.body?.seatId ?? req.body?.seat,
      personalityId: req.body?.personalityId,
    });

    if (!seat.personalityId) {
      return res.json({
        seatId: seat.seatId,
        personalityId: null,
        context: "",
        bound: false,
      });
    }

    const personality = getPersonalityById(seat.personalityId);
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const { memories, retrieval } = loadContextCandidateMemories(
      seat.personalityId,
      topicResult.topic,
    );
    const ranked = rankContextMemories(memories, topicResult.topic);
    const { mood, moodLabel } = resolveMood(personality);
    const maxChars = clampContextChars(req.body?.maxChars);
    const context = buildContextBlock({
      moodLabel,
      mood,
      memories: ranked,
      maxChars,
    });

    return res.json({
      seatId: seat.seatId,
      personalityId: personality.id,
      personalityName: personality.name,
      context,
      chars: context.length,
      bound: true,
      retrieval,
    });
  } catch (error) {
    return next(error);
  }
}

function normalizeSeatWrites(body) {
  const rawSeats = Array.isArray(body?.seats) && body.seats.length
    ? body.seats
    : ["gpt", "claude", "grok"];

  if (rawSeats.length > MAX_SEATS) {
    return { error: `seats must contain at most ${MAX_SEATS} items.` };
  }

  return {
    seats: rawSeats.map((entry) => {
      if (typeof entry === "string" || typeof entry === "number") {
        return { seatId: entry, moodDelta: body?.moodDelta, memories: body?.memories };
      }
      return {
        seatId: entry?.seatId ?? entry?.seat,
        personalityId: entry?.personalityId,
        moodDelta: entry?.moodDelta ?? body?.moodDelta,
        memories: entry?.memories ?? body?.memories,
      };
    }),
  };
}

export async function internalRoundHandler(req, res, next) {
  try {
    const topicResult = readTopic(req.body?.topic);
    if (topicResult.error) {
      return res.status(400).json({ error: topicResult.error });
    }

    const outcome = String(req.body?.outcome || "").replace(/\s+/g, " ").trim();
    if (!outcome) {
      return res.status(400).json({ error: "outcome is required." });
    }

    const seatsResult = normalizeSeatWrites(req.body);
    if (seatsResult.error) {
      return res.status(400).json({ error: seatsResult.error });
    }

    const topic = topicResult.topic.slice(0, MAX_TOPIC_CHARS);
    const councilText = `Council on "${topic}": ${outcome.slice(0, MAX_OUTCOME_CHARS)}`;
    const written = [];

    for (const entry of seatsResult.seats) {
      const seat = resolveSeat(entry);
      if (!seat.personalityId) continue;

      const personality = getPersonalityById(seat.personalityId);
      if (!personality) continue;

      const notes = [];
      const extraMemories = Array.isArray(entry.memories) ? entry.memories : [];
      for (const memory of extraMemories.slice(0, 3)) {
        const content = String(memory || "").replace(/\s+/g, " ").trim();
        if (!content) continue;
        notes.push(content.slice(0, MAX_OUTCOME_CHARS));
      }

      const nextMood = moodDeltaIsZero(entry.moodDelta)
        ? null
        : applyMoodDelta(resolveMood(personality).mood, entry.moodDelta);

      enqueueRoundJob({
        personalityId: personality.id,
        seatId: seat.seatId,
        councilText,
        notes,
        nextMood,
      });

      written.push({
        seatId: seat.seatId,
        personalityId: personality.id,
      });
    }

    return res.json({ ok: true, queued: true, written });
  } catch (error) {
    return next(error);
  }
}
