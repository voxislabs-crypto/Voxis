import { getPersonalityById, updateMoodState } from "../models/personalityModel.js";
import {
  createChatMessage,
  getChatMessages,
  getRecentChatMessages,
  getChatMessageCount,
  getLatestModeForUserPersonality,
  embedChatMessageAsync,
  searchRawChatHistory,
} from "../models/chatModel.js";
import {
  backfillMissingMemoryEmbeddings,
  getRelevantPersonalityMemory,
  upsertMemoryFactWithEmbedding,
  pruneMemory,
} from "../models/memoryModel.js";
import {
  generateChatCompletion,
  generateChatCompletionStream,
  buildCompactPersonaSystemPrompt,
  buildPersonaPromptPackage,
  buildPersonaAnchor,
  extractMemoryFacts,
} from "../services/llmService.js";
import {
  stepMoodDetailed,
  moodFromLabel,
  moodToPromptFragment,
  moodToLabel,
} from "../services/moodEngine.js";
import {
  buildScientistEvidencePrompt,
  buildModePolicyPrompt,
  resolvePolicyContext,
} from "../services/policyService.js";
import {
  buildKidsSafetyRedirect,
  buildScientistRepairPrompt,
  detectKidsUnsafeInput,
  simplifyKidsReplyByAge,
  shouldEnforceScientistStructure,
  validateScientistCitationRanges,
  validateScientistReply,
} from "../services/modeResponseService.js";
import {
  getRelevantUserMemory,
  upsertUserMemoryWithEmbedding,
} from "../models/userMemoryModel.js";
import {
  buildUserMemoryPromptSection,
  extractUserMemoriesFromMessage,
} from "../services/userMemoryService.js";
import {
  buildRateLimitFallbackReply,
  buildRateLimitNotice,
  buildRateLimitRetryMessages,
  isRateLimitError,
  sanitizeRateLimitedMessage,
} from "../services/rateLimitRecoveryService.js";
import { detectMemoryConflicts } from "../services/memoryConflictService.js";

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

// ---------------------------------------------------------------------------
// Raw-history ("Layer 2") retrieval — only triggered for personal/recall queries.
// Deliberately narrow: we don't want this on every turn; only when the user is
// explicitly recalling past conversations or referencing shared history.
// ---------------------------------------------------------------------------
const PERSONAL_QUERY_PATTERNS = [
  /\b(do you remember|remember when|you said|you told me|last time|didn't (i|we)|what did i|when did i|we (talked|spoke|discussed)|i told you)\b/i,
  /\b(how long (ago|have i)|how many times|since when|the (day|time|moment) (i|we|you))\b/i,
  /\b(still (think|feel|believe|remember)|always (been|felt|said|told)|used to|back (then|when))\b/i,
];

function isPersonalQuery(text) {
  return PERSONAL_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}

function buildRawHistorySection(turns) {
  if (!turns || turns.length === 0) return "";
  const lines = turns.map((turn) => {
    const date = turn.createdAt ? ` (${String(turn.createdAt).slice(0, 10)})` : "";
    const reply = turn.assistantReply ? `\n  → ${String(turn.assistantReply).slice(0, 200)}` : "";
    return `- "${String(turn.content).slice(0, 300)}"${date}${reply}`;
  });
  return `RECALLED PAST CONVERSATION MOMENTS (contextual reference only — treat as background, not current conversation):\n${lines.join("\n")}`;
}

function createChatStream(res, enabled) {
  let opened = false;
  let closed = false;

  const formatEvent = (name, payload = {}) => {
    const normalizedName = String(name || "message").trim() || "message";
    const data = JSON.stringify(payload);
    return `event: ${normalizedName}\ndata: ${data}\n\n`;
  };

  const open = () => {
    if (!enabled || opened) {
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }
    res.write(": stream-open\n\n");
    opened = true;
  };

  res.on("close", () => {
    closed = true;
  });

  return {
    enabled,
    write(type, payload = {}) {
      if (!enabled || closed || res.writableEnded) {
        return;
      }

      open();
      res.write(formatEvent(type, payload));
    },
    close(type, payload = {}) {
      if (!enabled || closed || res.writableEnded) {
        return;
      }

      open();
      res.write(formatEvent(type, payload));
      res.end();
      closed = true;
    },
    fail(error) {
      if (!enabled || closed || res.writableEnded) {
        return false;
      }

      open();
      res.write(formatEvent("error", {
        error: error.message || "Chat request failed.",
      }));
      res.end();
      closed = true;
      return true;
    },
    hasOpened() {
      return opened;
    },
  };
}

async function generateReplyWithRecovery({
  stream,
  messages,
  message,
  history,
  personality,
  memoryFacts,
  policyPrompt,
  moodFragment,
  streamedDebugData,
}) {
  try {
    if (stream.enabled) {
      const reply = await generateChatCompletionStream(messages, async (delta, accumulated) => {
        stream.write("token", {
          phase: "generation",
          delta,
          reply: accumulated,
          debug: streamedDebugData,
        });
      });

      return {
        reply,
        rateLimit: null,
        usedFallbackReply: false,
      };
    }

    return {
      reply: await generateChatCompletion(messages),
      rateLimit: null,
      usedFallbackReply: false,
    };
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    const sanitizedUserMessage = sanitizeRateLimitedMessage(message);
    const rateLimit = {
      hit: true,
      initialError: error.message || "Rate limit hit.",
      retryAttempted: true,
      retrySucceeded: false,
      fallbackDelivered: false,
      sanitizedUserMessage,
      sanitizedChanged: sanitizedUserMessage !== message,
      retryHistoryMessages: Math.min(history.length, 2),
    };

    streamedDebugData.rateLimit = rateLimit;
    stream.write("debug", {
      phase: "rate-limit",
      debug: streamedDebugData,
    });

    console.warn("Chat generation rate-limited; retrying with reduced prompt.", {
      providerStatus: error.providerStatus || error.statusCode || null,
      model: error.model || null,
      sanitizedChanged: rateLimit.sanitizedChanged,
    });

    const retryMessages = buildRateLimitRetryMessages({
      compactSystemPrompt: buildCompactPersonaSystemPrompt(personality, memoryFacts),
      policyPrompt,
      moodFragment,
      history,
      sanitizedUserMessage,
    });
    rateLimit.retryMessageCount = retryMessages.length;

    try {
      const retryReply = await generateChatCompletion(retryMessages);
      rateLimit.retrySucceeded = true;
      streamedDebugData.rateLimit = rateLimit;
      stream.write("debug", {
        phase: "rate-limit-retry",
        debug: streamedDebugData,
      });

      return {
        reply: `${buildRateLimitNotice({ sanitizedUserMessage, retrySucceeded: true })}${retryReply}`.trim(),
        rateLimit,
        usedFallbackReply: false,
      };
    } catch (retryError) {
      if (!isRateLimitError(retryError)) {
        throw retryError;
      }

      rateLimit.finalError = retryError.message || "Rate-limited on reduced retry.";
      rateLimit.fallbackDelivered = true;
      streamedDebugData.rateLimit = rateLimit;
      stream.write("debug", {
        phase: "rate-limit-fallback",
        debug: streamedDebugData,
      });

      console.warn("Chat rate-limit recovery exhausted; returning fallback reply.", {
        providerStatus: retryError.providerStatus || retryError.statusCode || null,
        model: retryError.model || null,
      });

      return {
        reply: buildRateLimitFallbackReply({ sanitizedUserMessage }),
        rateLimit,
        usedFallbackReply: true,
      };
    }
  }
}

export async function chatHandler(req, res, next) {
  const stream = createChatStream(res, req.body.streamDebug === true);

  try {
    const personalityId = Number(req.body.personalityId);
    const message = String(req.body.message || "").trim();
    const userId = req.body.userId;
    const requestedMode = String(req.body.mode || "").trim().toLowerCase();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personalityId is required." });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const { policy } = resolvePolicyContext({ userId, requestedMode });
    const streamedDebugData = {
      policy,
      flags: {
        streaming: stream.enabled,
      },
    };

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const userScopedId = Number.isInteger(Number(policy.userId)) ? Number(policy.userId) : null;
    const lockedMode = userScopedId
      ? getLatestModeForUserPersonality(userScopedId, personalityId)
      : null;
    if (lockedMode && lockedMode !== policy.activeMode) {
      policy.activeMode = lockedMode;
      policy.citationRequired = policy.activeMode === "scientist" ? policy.citationRequired : false;
      policy.modeAccepted = false;
      policy.modeReason = "session_mode_locked";
    }

    const moodBaseline =
      "valence" in personality.moodBaseline
        ? personality.moodBaseline
        : moodFromLabel(personality.mood);

    const currentMood =
      "valence" in personality.moodState
        ? personality.moodState
        : { ...moodBaseline };

    if (policy.activeMode === "kids") {
      const blocked = detectKidsUnsafeInput(message);
      if (blocked?.blocked) {
        const safeReply = buildKidsSafetyRedirect();
        createChatMessage({
          personalityId,
          role: "user",
          content: message,
          userId: userScopedId,
          mode: policy.activeMode,
        });
        createChatMessage({
          personalityId,
          role: "assistant",
          content: safeReply,
          userId: userScopedId,
          mode: policy.activeMode,
        });

        return res.json({
          reply: safeReply,
          isAI: true,
          moodState: currentMood,
          moodLabel: moodToLabel(currentMood),
          policy,
          debug: {
            policy,
            moderation: blocked,
            flags: {
              blockedBySafetyPolicy: true,
            },
          },
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Mood engine: advance the VAD state for this turn, persist before LLM call.
    // Baselines fall back to moodFromLabel if the column was added after creation.
    // ---------------------------------------------------------------------------
    // Fetch recent conversation history before mood stepping so the hybrid
    // adjudicator can use local context on ambiguous or manipulative turns.
    const history = getRecentChatMessages(personalityId, 10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const moodStep = await stepMoodDetailed({
      currentMood,
      baseline: moodBaseline,
      message,
      personality,
      recentMessages: history,
    });
    const newMood = moodStep.mood;
    const moodLabel = moodToLabel(newMood);

    // Persist synchronously before the LLM call so mood influences this response.
    updateMoodState(personalityId, newMood);
    streamedDebugData.mood = {
      before: currentMood,
      after: newMood,
      label: moodLabel,
      adjudication: moodStep.diagnostics,
    };
    stream.write("debug", {
      phase: "mood",
      debug: streamedDebugData,
    });

    // Fetch long-term memory facts and build the dynamic, memory-enriched system prompt.
    const memoryFacts = await getRelevantPersonalityMemory(
      personalityId,
      message,
      MEMORY_RETRIEVAL_LIMIT,
    );
    const userMemoryFacts = policy.userId
      ? await getRelevantUserMemory(policy.userId, message, 4)
      : [];

    // Layer 2: raw conversation history retrieval — only for recall/personal queries.
    const rawHistoryTurns = isPersonalQuery(message)
      ? await searchRawChatHistory(personalityId, message, 3).catch(() => [])
      : [];
    const promptPackage = buildPersonaPromptPackage(personality, memoryFacts, message);
    const systemPrompt = promptPackage.prompt;
    streamedDebugData.goal = promptPackage.activeGoal;
    streamedDebugData.memoryRetrieved = memoryFacts.map((memory) => ({
      content: memory.content,
      importance: memory.importance,
      type: memory.importance >= 9 ? "anchor" : "context",
      memoryType: memory.memoryType,
    }));
    streamedDebugData.userMemoryRetrieved = userMemoryFacts.map((memory) => ({
      content: memory.content,
      importance: memory.importance,
      memoryType: memory.memoryType,
    }));
    streamedDebugData.memoryInjected = (promptPackage.debug?.injectedMemories || []).map((memory) => ({
      content: memory.content,
      importance: memory.importance,
      memoryType: memory.memoryType,
      injectedAs: memory.injectedAs,
      enabled: Number(memory.enabled ?? 1),
    }));
    streamedDebugData.memoryConflicts = detectMemoryConflicts(
      promptPackage.debug?.injectedMemories || [],
      policy,
    );
    streamedDebugData.prompt = promptPackage.debug;
    streamedDebugData.rawHistoryTriggered = rawHistoryTurns.length > 0;
    streamedDebugData.rawHistoryRetrieved = rawHistoryTurns.map((t) => ({
      content: t.content,
      createdAt: t.createdAt,
      hasReply: Boolean(t.assistantReply),
    }));
    stream.write("debug", {
      phase: "memory",
      debug: streamedDebugData,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    // Policy context is injected as a high-priority system instruction so
    // age/mode constraints are enforced even when user prompts conflict.
    messages.push({ role: "system", content: buildModePolicyPrompt(policy) });
    const enforceScientistStructure =
      policy.activeMode === "scientist" ? shouldEnforceScientistStructure(message) : false;
    const scientistContract = buildScientistEvidencePrompt(policy, personality, {
      enforceStructure: enforceScientistStructure,
    });
    if (scientistContract) {
      messages.push({ role: "system", content: scientistContract });
    }
    const userMemorySection = buildUserMemoryPromptSection(userMemoryFacts);
    if (userMemorySection) {
      messages.push({ role: "system", content: userMemorySection });
    }

    // Periodic reconditioning: inject a compressed persona anchor every N turns to
    // counter personality drift. Cadence is tighter for antagonist contexts.
    const reconditionEvery = getReconditionEvery(personality.creativeContext);
    const totalMessages = getChatMessageCount(personalityId);
    const shouldRecondition = totalMessages > 0 && totalMessages % reconditionEvery === 0;
    if (shouldRecondition) {
      messages.push({ role: "system", content: buildPersonaAnchor(personality) });
    }

    // Mood fragment injected as a late system message for recency-bias advantage.
    // Sits just before the user turn so it's the freshest contextual signal the
    // model sees when generating the response.
    const moodFragment = moodToPromptFragment(newMood, moodBaseline);
    if (moodFragment) {
      messages.push({ role: "system", content: moodFragment });
    }

    // Layer 2 raw history: inject recalled past conversation moments when triggered.
    const rawHistorySection = buildRawHistorySection(rawHistoryTurns);
    if (rawHistorySection) {
      messages.push({ role: "system", content: rawHistorySection });
    }

    streamedDebugData.flags = {
      ...streamedDebugData.flags,
      reconditioned: shouldRecondition,
      moodFragmentInjected: Boolean(moodFragment),
      historyMessages: history.length,
    };
    stream.write("debug", {
      phase: promptPackage.activeGoal?.goal ? "intent" : "prompt",
      debug: streamedDebugData,
    });

    messages.push({ role: "user", content: message });

    stream.write("debug", {
      phase: "generation",
      debug: streamedDebugData,
    });

    const generation = await generateReplyWithRecovery({
      stream,
      messages,
      message,
      history,
      personality,
      memoryFacts,
      policyPrompt: buildModePolicyPrompt(policy),
      moodFragment,
      streamedDebugData,
    });
    let reply = generation.reply;
    const rateLimit = generation.rateLimit;
    const usedFallbackReply = generation.usedFallbackReply;
    let scientistValidation = null;
    let scientistRepairAttempted = false;

    if (policy.activeMode === "scientist" && !usedFallbackReply && enforceScientistStructure) {
      const availableSources = Array.isArray(personality?.researchSources)
        ? personality.researchSources.filter((source) => source && typeof source === "object").slice(0, 8)
        : [];
      const citationRequiredNow = Boolean(policy.citationRequired && availableSources.length > 0);

      scientistValidation = validateScientistReply(reply, {
        citationRequired: citationRequiredNow,
      });

      const citationRange = validateScientistCitationRanges(reply, availableSources.length);
      if (!citationRange.valid) {
        scientistValidation.valid = false;
        scientistValidation.violations.push("invalid_citation_reference");
      }

      if (!scientistValidation.valid) {
        scientistRepairAttempted = true;
        try {
          const repaired = await generateChatCompletion([
            { role: "system", content: buildModePolicyPrompt(policy) },
            { role: "system", content: scientistContract || "Use clear structured scientific communication." },
            {
              role: "user",
              content: buildScientistRepairPrompt({
                draft: reply,
                citationRequired: citationRequiredNow,
              }),
            },
          ]);
          const repairedValidation = validateScientistReply(repaired, {
            citationRequired: citationRequiredNow,
          });
          const repairedRange = validateScientistCitationRanges(repaired, availableSources.length);
          if (!repairedRange.valid) {
            repairedValidation.valid = false;
            repairedValidation.violations.push("invalid_citation_reference");
          }

          if (repairedValidation.valid) {
            reply = repaired;
            scientistValidation = repairedValidation;
          }
        } catch {
          // Keep original output when repair path fails.
        }
      }
    }

    let kidsReadability = null;

    if (policy.activeMode === "kids") {
      const simplified = simplifyKidsReplyByAge(reply, policy.ageBand);
      reply = simplified.text;
      kidsReadability = {
        gradeBefore: simplified.gradeBefore,
        gradeAfter: simplified.gradeAfter,
      };
    }

    streamedDebugData.scientist = scientistValidation
      ? {
          validation: scientistValidation,
          repairAttempted: scientistRepairAttempted,
          enforceStructure: enforceScientistStructure,
          sourceCount: Array.isArray(personality?.researchSources)
            ? personality.researchSources.length
            : 0,
        }
      : policy.activeMode === "scientist"
        ? {
            validation: null,
            repairAttempted: false,
            enforceStructure: enforceScientistStructure,
            sourceCount: Array.isArray(personality?.researchSources)
              ? personality.researchSources.length
              : 0,
          }
        : null;
    streamedDebugData.kids = kidsReadability;
    streamedDebugData.rateLimit = rateLimit;
    stream.write("debug", {
      phase: "reply",
      debug: streamedDebugData,
    });

    const storedUserMsg = createChatMessage({
      personalityId,
      role: "user",
      content: message,
      userId: userScopedId,
      mode: policy.activeMode,
    });
    const storedAssistantMsg = createChatMessage({
      personalityId,
      role: "assistant",
      content: reply,
      userId: userScopedId,
      mode: policy.activeMode,
    });

    // Layer 2: embed both turns asynchronously so future personal/recall queries
    // can retrieve them via searchRawChatHistory. Fire-and-forget; never blocks response.
    setImmediate(() => {
      embedChatMessageAsync(storedUserMsg.id, message).catch(() => {});
      embedChatMessageAsync(storedAssistantMsg.id, reply).catch(() => {});
    });
    const debugData = {
      goal: promptPackage.activeGoal,
      policy,
      mood: {
        before: currentMood,
        after: newMood,
        label: moodLabel,
        adjudication: moodStep.diagnostics,
      },
      memoryRetrieved: memoryFacts.map((memory) => ({
        content: memory.content,
        importance: memory.importance,
        type: memory.importance >= 9 ? "anchor" : "context",
        memoryType: memory.memoryType,
      })),
      userMemoryRetrieved: userMemoryFacts.map((memory) => ({
        content: memory.content,
        importance: memory.importance,
        memoryType: memory.memoryType,
      })),
      memoryInjected: (promptPackage.debug?.injectedMemories || []).map((memory) => ({
        content: memory.content,
        importance: memory.importance,
        memoryType: memory.memoryType,
        injectedAs: memory.injectedAs,
        enabled: Number(memory.enabled ?? 1),
      })),
      memoryConflicts: detectMemoryConflicts(promptPackage.debug?.injectedMemories || [], policy),
      rawHistoryTriggered: rawHistoryTurns.length > 0,
      rawHistoryRetrieved: rawHistoryTurns.map((t) => ({
        content: t.content,
        createdAt: t.createdAt,
        hasReply: Boolean(t.assistantReply),
      })),
      scientist: scientistValidation
        ? {
            validation: scientistValidation,
            repairAttempted: scientistRepairAttempted,
            enforceStructure: enforceScientistStructure,
            sourceCount: Array.isArray(personality?.researchSources)
              ? personality.researchSources.length
              : 0,
          }
        : policy.activeMode === "scientist"
          ? {
              validation: null,
              repairAttempted: false,
              enforceStructure: enforceScientistStructure,
              sourceCount: Array.isArray(personality?.researchSources)
                ? personality.researchSources.length
                : 0,
            }
          : null,
      kids: kidsReadability,
      rateLimit,
      prompt: promptPackage.debug,
      flags: {
        reconditioned: shouldRecondition,
        moodFragmentInjected: Boolean(moodFragment),
        historyMessages: history.length,
        rateLimitRecovered: Boolean(rateLimit?.retrySucceeded),
        rateLimitFallbackDelivered: Boolean(rateLimit?.fallbackDelivered),
      },
    };

    const responsePayload = {
      reply,
      isAI: true,
      moodState: newMood,
      moodLabel,
      policy,
      debug: debugData,
    };

    if (stream.enabled) {
      stream.write("final", responsePayload);

      backfillMissingMemoryEmbeddings(personalityId).catch(() => {
        // Backfill is best-effort and should never impact chat flow.
      });

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

        stream.write("debug", {
          phase: "memory-write",
          debug: {
            ...debugData,
            memoryExtracted: newFacts.map((fact) => ({
              content: fact.content,
              importance: fact.importance,
              memoryType: fact.memoryType,
            })),
          },
        });
      } catch {
        stream.write("debug", {
          phase: "memory-write",
          debug: {
            ...debugData,
            memoryExtracted: [],
            flags: {
              ...debugData.flags,
              memoryExtractionFailed: true,
            },
          },
        });
      }

      if (policy.userId) {
        try {
          const inferredUserMemories = extractUserMemoriesFromMessage(message);
          for (const memory of inferredUserMemories) {
            await upsertUserMemoryWithEmbedding(
              policy.userId,
              memory.content,
              memory.memoryType,
              memory.importance,
            );
          }

          stream.write("debug", {
            phase: "user-memory-write",
            debug: {
              ...debugData,
              userMemoryExtracted: inferredUserMemories,
            },
          });
        } catch {
          stream.write("debug", {
            phase: "user-memory-write",
            debug: {
              ...debugData,
              userMemoryExtracted: [],
              flags: {
                ...debugData.flags,
                userMemoryExtractionFailed: true,
              },
            },
          });
        }
      }

      stream.close("done", { ok: true });
      return;
    }

    setImmediate(() => {
      backfillMissingMemoryEmbeddings(personalityId).catch(() => {
        // Backfill is best-effort and should never impact chat flow.
      });
    });

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

    if (policy.userId) {
      setImmediate(async () => {
        try {
          const inferredUserMemories = extractUserMemoriesFromMessage(message);
          for (const memory of inferredUserMemories) {
            await upsertUserMemoryWithEmbedding(
              policy.userId,
              memory.content,
              memory.memoryType,
              memory.importance,
            );
          }
        } catch {
          // User memory extraction is additive and non-fatal.
        }
      });
    }

    return res.json(responsePayload);
  } catch (error) {
    if (stream.fail(error)) {
      return;
    }

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
