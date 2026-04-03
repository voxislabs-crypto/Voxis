import { getPersonalityById, updateMoodState } from "../models/personalityModel.js";
import {
  createChatMessage,
  getChatMessages,
  getRecentChatMessages,
  getChatMessageCount,
  getLatestModeForUserPersonality,
} from "../models/chatModel.js";
import {
  backfillMissingMemoryEmbeddings,
  getRelevantPersonalityMemory,
  upsertMemoryFactWithEmbedding,
  pruneMemory,
} from "../models/memoryModel.js";
import {
  generateChatCompletion,
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
    const userId = req.body.userId;
    const requestedMode = String(req.body.mode || "").trim().toLowerCase();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personalityId is required." });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const { policy } = resolvePolicyContext({ userId, requestedMode });

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

    // Fetch long-term memory facts and build the dynamic, memory-enriched system prompt.
    const memoryFacts = await getRelevantPersonalityMemory(
      personalityId,
      message,
      MEMORY_RETRIEVAL_LIMIT,
    );
    const userMemoryFacts = policy.userId
      ? await getRelevantUserMemory(policy.userId, message, 4)
      : [];
    const promptPackage = buildPersonaPromptPackage(personality, memoryFacts, message);
    const systemPrompt = promptPackage.prompt;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    // Policy context is injected as a high-priority system instruction so
    // age/mode constraints are enforced even when user prompts conflict.
    messages.push({ role: "system", content: buildModePolicyPrompt(policy) });
    const scientistContract = buildScientistEvidencePrompt(policy, personality);
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

    messages.push({ role: "user", content: message });

    let reply = await generateChatCompletion(messages);
    let scientistValidation = null;
    let scientistRepairAttempted = false;

    if (policy.activeMode === "scientist") {
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

    setImmediate(() => {
      backfillMissingMemoryEmbeddings(personalityId).catch(() => {
        // Backfill is best-effort and should never impact chat flow.
      });
    });

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
      content: reply,
      userId: userScopedId,
      mode: policy.activeMode,
    });

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
      })),
      scientist: scientistValidation
        ? {
            validation: scientistValidation,
            repairAttempted: scientistRepairAttempted,
            sourceCount: Array.isArray(personality?.researchSources)
              ? personality.researchSources.length
              : 0,
          }
        : null,
      kids: kidsReadability,
      prompt: promptPackage.debug,
      flags: {
        reconditioned: shouldRecondition,
        moodFragmentInjected: Boolean(moodFragment),
        historyMessages: history.length,
      },
    };

    return res.json({
      reply,
      isAI: true,
      moodState: newMood,
      moodLabel,
      policy,
      debug: debugData,
    });
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
