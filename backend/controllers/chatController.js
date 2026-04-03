import { getPersonalityById, updateMoodState } from "../models/personalityModel.js";
import { createChatMessage, getChatMessages, getRecentChatMessages, getChatMessageCount } from "../models/chatModel.js";
import {
  backfillMissingMemoryEmbeddings,
  getRelevantPersonalityMemory,
  upsertMemoryFactWithEmbedding,
  pruneMemory,
} from "../models/memoryModel.js";
import {
  generateChatCompletion,
  buildPersonaSystemPrompt,
  buildPersonaAnchor,
  extractMemoryFacts,
} from "../services/llmService.js";
import {
  stepMood,
  moodFromLabel,
  moodToPromptFragment,
  moodToLabel,
} from "../services/moodEngine.js";

// Reconditioning cadence: antagonist/dark contexts drift faster, so we anchor more often.
const RECONDITION_CADENCE = {
  narrative_antagonist: 4,
  anti_hero: 4,
  tragic_villain: 5,
  morally_complex: 6,
  default: 6,
};

function getReconditionEvery(creativeContext) {
  return RECONDITION_CADENCE[creativeContext] ?? RECONDITION_CADENCE.default;
}

// Maximum number of long-term memory facts to retain per personality.
const MEMORY_MAX = 50;
const MEMORY_RETRIEVAL_LIMIT = 5;

export async function chatHandler(req, res, next) {
  try {
    const personalityId = Number(req.body.personalityId);
    const message = String(req.body.message || "").trim();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personalityId is required." });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    // ---------------------------------------------------------------------------
    // Mood engine: advance the VAD state for this turn, persist before LLM call.
    // Baselines fall back to moodFromLabel if the column was added after creation.
    // ---------------------------------------------------------------------------
    const moodBaseline =
      "valence" in personality.moodBaseline
        ? personality.moodBaseline
        : moodFromLabel(personality.mood);

    const currentMood =
      "valence" in personality.moodState
        ? personality.moodState
        : { ...moodBaseline };

    // Fetch recent conversation history before mood stepping so the hybrid
    // adjudicator can use local context on ambiguous or manipulative turns.
    const history = getRecentChatMessages(personalityId, 10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const newMood = await stepMood({
      currentMood,
      baseline: moodBaseline,
      message,
      personality,
      recentMessages: history,
    });

    // Persist synchronously before the LLM call so mood influences this response.
    updateMoodState(personalityId, newMood);

    // Fetch long-term memory facts and build the dynamic, memory-enriched system prompt.
    const memoryFacts = await getRelevantPersonalityMemory(
      personalityId,
      message,
      MEMORY_RETRIEVAL_LIMIT,
    );
    const systemPrompt = buildPersonaSystemPrompt(personality, memoryFacts);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    // Periodic reconditioning: inject a compressed persona anchor every N turns to
    // counter personality drift. Cadence is tighter for antagonist contexts.
    const reconditionEvery = getReconditionEvery(personality.creativeContext);
    const totalMessages = getChatMessageCount(personalityId);
    if (totalMessages > 0 && totalMessages % reconditionEvery === 0) {
      messages.push({ role: "system", content: buildPersonaAnchor(personality) });
    }

    // Mood fragment injected as a late system message for recency-bias advantage.
    // Sits just before the user turn so it's the freshest contextual signal the
    // model sees when generating the response.
    const moodFragment = moodToPromptFragment(newMood, moodBaseline);
    if (moodFragment) {
      messages.push({ role: "system", content: moodFragment });
    }

    messages.push({ role: "user", content: message });

    const reply = await generateChatCompletion(messages);

    setImmediate(() => {
      backfillMissingMemoryEmbeddings(personalityId).catch(() => {
        // Backfill is best-effort and should never impact chat flow.
      });
    });

    createChatMessage({ personalityId, role: "user", content: message });
    createChatMessage({ personalityId, role: "assistant", content: reply });

    // Async memory extraction — fires after the response is returned so it never
    // adds latency to the user-facing request. Failures are silently swallowed.
    setImmediate(async () => {
      try {
        const newFacts = await extractMemoryFacts({
          personality,
          recentMessages: [
            { role: "user", content: message },
            { role: "assistant", content: reply },
          ],
          existingFacts: memoryFacts,
        });

        for (const fact of newFacts) {
          await upsertMemoryFactWithEmbedding(
            personalityId,
            fact.content,
            fact.memoryType,
            fact.importance,
          );
        }

        if (newFacts.length > 0) {
          pruneMemory(personalityId, MEMORY_MAX);
        }
      } catch {
        // Memory extraction failure is non-fatal.
      }
    });

    return res.json({ reply, isAI: true, moodState: newMood, moodLabel: moodToLabel(newMood) });
  } catch (error) {
    return next(error);
  }
}

export function chatHistoryHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    return res.json(getChatMessages(personalityId, 50));
  } catch (error) {
    return next(error);
  }
}
