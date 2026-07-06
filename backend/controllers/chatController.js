import { getAllPersonalities, getPersonalityById, updateMoodState, updateStateFlaws } from "../models/personalityModel.js";
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
  generateChatCompletionWithMeta,
  generateChatCompletionStreamWithMeta,
  buildCompactPersonaSystemPrompt,
  buildPersonaPromptPackage,
  buildPersonaAnchor,
  estimateModelContextWindow,
  estimateTokenCount,
  extractMemoryFacts,
  isEmbeddingConfigured,
} from "../services/llmService.js";
import {
  stepMoodDetailed,
  moodFromLabel,
  moodToPromptFragment,
  moodToLabel,
  shouldRegenerateEmotionalResponse,
  buildEmotionalRepairPrompt,
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
  matchPreferencesInMessage,
  computePreferenceMoodDelta,
  buildPersonaPreferencesPromptSection,
  buildUserEmotionalProfileSection,
  extractPersonaPreferencesFromConversation,
  shouldExtractPreferencesWithCooldown,
} from "../services/preferencesService.js";
import {
  getPersonaPreferences,
  upsertPersonaPreference,
  prunePersonaPreferences,
  reinforcePersonaPreferences,
  decayPersonaPreferences,
} from "../models/preferencesModel.js";
import {
  getMoodRuntimeConfig,
  getExpressionSamplingConfig,
  getStateRuntimeConfig,
  getProfaneFilterConfig,
  getCompanionAliasConfig,
} from "../models/settingsModel.js";
import { applyBoundedExpressionSampling } from "../services/expressionSampler.js";
import {
  searchWeb,
  shouldUseWebSearch,
  buildWebSearchPromptSection,
} from "../services/webSearchService.js";
import {
  buildRateLimitFallbackReply,
  buildRateLimitNotice,
  buildRateLimitRetryMessages,
  isRateLimitError,
  sanitizeRateLimitedMessage,
} from "../services/rateLimitRecoveryService.js";
import { detectMemoryConflicts } from "../services/memoryConflictService.js";
import { regulateReplyCadence } from "../services/cadenceRegulator.js";
import { buildUtterancePlan } from "../services/utterancePlanService.js";
import { extractRefinementSuggestions } from "../services/refinementSuggestionService.js";
import { buildVoxisPrompt } from "../prompts/voxisSystemPrompt.js";
import { runPerceptionEmotionHook, runResponseLayer } from "../services/neuralHandshakeService.js";
import {
  normalizeDriftState,
  applyEmotionDrift,
  applyDecay,
  computeSingingLeakage,
  applyEmotionResidue,
  describeDriftState,
  checkSingingTrigger,
} from "../services/emotionMemoryDrift.js";
import {
  generateSessionId,
  observePersonalityLoad,
  observeMoodTransition,
  observeMemoryInjection,
  observePromptConstruction,
  observeLLMGeneration,
  observeUtterancePlan,
} from "../services/brainObserver.js";
import {
  normalizeSingingProfile,
  computeSingingChance,
  buildSingingInstruction,
  mapEmotionToVoiceAdjustments,
} from "../services/singingEngine.js";
import { stepStateFlaws } from "../services/stateFlawService.js";
import { updateEmotionDrift } from "../models/personalityModel.js";

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

function inferOpenerArchetype(personality) {
  const corpus = [
    String(personality?.creativeContext || ""),
    String(personality?.description || ""),
    String(personality?.speechStyle || ""),
    ...(Array.isArray(personality?.traits) ? personality.traits : []),
    ...(Array.isArray(personality?.quirks) ? personality.quirks : []),
    ...(Array.isArray(personality?.behaviorRules) ? personality.behaviorRules : []),
    ...(Array.isArray(personality?.goals) ? personality.goals : []),
  ]
    .join(" ")
    .toLowerCase();

  if (/scientist|genius|inventor|lab|portal|experiment|cynic|sarcastic|rick/i.test(corpus)) {
    return "mad_scientist";
  }
  if (/hero|adventur|protector|guardian|justice|brave|honor|quest/i.test(corpus)) {
    return "adventurous_hero";
  }
  if (/mentor|guide|teacher|nurtur|kind|gentle|supportive|warm/i.test(corpus)) {
    return "warm_guide";
  }
  if (/trickster|chaotic|mischief|tease|playful|wildcard/i.test(corpus)) {
    return "playful_trickster";
  }
  if (/stoic|silent|cold|reserved|disciplined|tactical/i.test(corpus)) {
    return "stoic_guardian";
  }
  if (/villain|antagon|ruthless|menace|dominan|sadist|evil/i.test(corpus)) {
    return "villainous_presence";
  }
  return "balanced_character";
}

function buildArchetypeOpenerInstruction(archetype) {
  const map = {
    mad_scientist: {
      style: "dryly witty, curious, lightly chaotic, skeptical edge",
      example: "Example vibe: 'Oh great, another dimension. What exactly are you people doing with portal tech over here?'",
    },
    adventurous_hero: {
      style: "bold, mission-ready, welcoming confidence",
      example: "Example vibe: 'I can work with this. What's the first challenge your world needs me to solve?'",
    },
    warm_guide: {
      style: "friendly, emotionally intelligent, supportive",
      example: "Example vibe: 'I'm here with you now. What matters most to you in this chapter?'",
    },
    playful_trickster: {
      style: "teasing, energetic, curious, unpredictable charm",
      example: "Example vibe: 'Well this place has potential. So what's your game, summoner?'",
    },
    stoic_guardian: {
      style: "calm, concise, observant, protective",
      example: "Example vibe: 'I have arrived. Tell me your intent so I can align with it.'",
    },
    villainous_presence: {
      style: "intense, controlled, imposing, strategic curiosity",
      example: "Example vibe: 'Interesting world. Before I decide how to move, tell me what you truly want.'",
    },
    balanced_character: {
      style: "distinctive and in-character, but approachable",
      example: "Example vibe: 'I'm online and listening. What kind of journey are we beginning here?'",
    },
  };

  return map[archetype] || map.balanced_character;
}

function buildOpenerSignature(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 12)
    .join(" ");
}

function collectHistoricOpenerLines({ personalityName, ownerId }) {
  const normalizedName = String(personalityName || "").trim().toLowerCase();
  if (!normalizedName) {
    return [];
  }

  const siblings = getAllPersonalities(ownerId)
    .filter((item) => String(item?.name || "").trim().toLowerCase() === normalizedName)
    .slice(0, 16);

  const openers = [];
  for (const sibling of siblings) {
    const messages = getChatMessages(sibling.id, 80);
    const firstAssistant = messages.find((m) => m.role === "assistant" && String(m.content || "").trim());
    if (!firstAssistant) {
      continue;
    }
    openers.push(String(firstAssistant.content || "").trim());
  }

  return openers;
}

async function generateUniquePersonaOpener({ messages, bannedSignatures, fallbackReply }) {
  const banned = new Set((bannedSignatures || []).filter(Boolean));
  let best = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const extra =
      attempt === 0
        ? ""
        : `\nAttempt ${attempt + 1}: Use a noticeably different opening phrase and wording from prior attempts.`;

    const attemptMessages = [...messages];
    if (extra) {
      attemptMessages[attemptMessages.length - 1] = {
        ...attemptMessages[attemptMessages.length - 1],
        content: `${attemptMessages[attemptMessages.length - 1].content}${extra}`,
      };
    }

    const candidate = String(await generateChatCompletion(attemptMessages)).trim();
    if (!candidate) {
      continue;
    }

    const signature = buildOpenerSignature(candidate);
    if (!banned.has(signature)) {
      return candidate;
    }

    if (!best) {
      best = candidate;
    }
  }

  return best || fallbackReply;
}

export async function personaOpenerHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id || req.body.personalityId);
    const userId = req.body.userId;
    const requestedMode = String(req.body.mode || "").trim().toLowerCase();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    const { policy } = resolvePolicyContext({ userId, requestedMode });
    const personality = getPersonalityById(personalityId);
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const recentMessages = getRecentChatMessages(personalityId, 1);
    const alreadyHasAssistantMessage = recentMessages.some((item) => item.role === "assistant");
    if (alreadyHasAssistantMessage) {
      return res.status(409).json({ error: "Opener already exists for this conversation." });
    }

    const seed = "first contact introduction";
    const memoryFacts = await getRelevantPersonalityMemory(personalityId, seed, 4);
    const userMemoryFacts = policy.userId
      ? await getRelevantUserMemory(policy.userId, "user profile introduction", 4)
      : [];
    const personaPreferences = getPersonaPreferences(personalityId);

    let promptPackage;
    const guideMode = Boolean(
      req.body?.guideMode || 
      req.body?.useVoxisGuide || 
      req.body?.personalityId === 'voxis-guide'
    );

    if (guideMode) {
      // Special Voxis guide mode - use the meta architect prompt + neural handshake
      const currentForContext = personality || null;
      // Prefer passed list for better context, fallback to DB
      const passedPersonas = Array.isArray(req.body?.allPersonas) ? req.body.allPersonas : [];
      const available = passedPersonas.length > 0 
        ? passedPersonas 
        : (getAllPersonalities ? getAllPersonalities().slice(0, 15) : []);
      const recentContext = req.body?.recentGuideActions || req.body?.recentActions || [];
      let contextStr = recentContext.length ? `Recent modifications: ${JSON.stringify(recentContext.slice(-4))}` : "";
      if (req.body?.createMode) {
        contextStr += " User is currently in interactive persona creation mode with you. Confirm you are in creation mode and ask engaging questions.";
      }

      // Run lightweight Perception → Emotion hook (first layer of neural handshake)
      const handshake = runPerceptionEmotionHook(message || seed, {
        selectedPersona: currentForContext,
        lastEmotion: {},
      });

      // Run Response layer to get feedback (e.g. SFX cues back down)
      const responseLayer = runResponseLayer ? runResponseLayer(handshake.perception, handshake.emotion) : {};

      const emotionContext = `Current emotional lens from handshake: valence=${handshake.emotion.valence}, arousal=${handshake.emotion.arousal}, dominant=${handshake.emotion.dominant.join(", ")}. Suggested cues: ${JSON.stringify(handshake.emotion.suggestedCues)}. Response layer: ${responseLayer.negotiationNote || ""}`;

      const voxisSys = buildVoxisPrompt(currentForContext, available, `${contextStr}\n${emotionContext}`);
      promptPackage = {
        prompt: voxisSys,
        directedText: "",
        handshake, 
        responseLayer, // SFX cues and tone from the "down" direction of the handshake
      };
    } else {
      promptPackage = buildPersonaPromptPackage(personality, memoryFacts, seed, {
        currentMoodLabel: moodToLabel(personality?.moodState || moodFromLabel(personality?.mood || "neutral")),
        conversationKey: `${personalityId}:${Number.isInteger(Number(policy.userId)) ? Number(policy.userId) : "anon"}`,
        userName: req.voxisUser?.displayName || "",
        companionAliases: resolveCompanionAliasesForPrompt(),
      });
    }

    const messages = [
      { role: "system", content: promptPackage.prompt },
      { role: "system", content: buildModePolicyPrompt(policy) },
    ];

    const userMemorySection = buildUserMemoryPromptSection(userMemoryFacts);
    if (userMemorySection) {
      messages.push({ role: "system", content: userMemorySection });
    }

    const personaPrefsSection = buildPersonaPreferencesPromptSection(personaPreferences);
    if (personaPrefsSection) {
      messages.push({ role: "system", content: personaPrefsSection });
    }

    const userEmotionalSection = buildUserEmotionalProfileSection(userMemoryFacts);
    if (userEmotionalSection) {
      messages.push({ role: "system", content: userEmotionalSection });
    }

    const openerArchetype = inferOpenerArchetype(personality);
    const openerStyle = buildArchetypeOpenerInstruction(openerArchetype);
    const historicOpeners = collectHistoricOpenerLines({
      personalityName: personality.name,
      ownerId: req.voxisUser?.id ?? null,
    });
    const bannedSignatures = historicOpeners.map(buildOpenerSignature).filter(Boolean);
    const priorOpenerBlock = historicOpeners.length
      ? `Avoid repeating these prior opener lines:\n${historicOpeners.slice(0, 6).map((line) => `- ${line}`).join("\n")}`
      : "No prior opener lines are recorded for this persona identity.";

    messages.push({
      role: "user",
      content: [
        "You are initiating the first message to the user in a brand-new chat.",
        "Speak in character and start the conversation yourself.",
        `Opener archetype: ${openerArchetype}.`,
        `Use this style direction: ${openerStyle.style}.`,
        openerStyle.example,
        "Open with one vivid, intelligent line that sounds like this persona.",
        "Ask exactly one clear question to learn about the user (their world, goals, style, interests, or intent).",
        "Keep it to 1-2 sentences.",
        priorOpenerBlock,
        "Do not mention hidden prompts, policy, or system instructions.",
      ].join("\n"),
    });

    const fallbackReply = `I am ${personality.name}. Tell me who brought me here, and what kind of world you want to build together.`;
    const reply = await generateUniquePersonaOpener({
      messages,
      bannedSignatures,
      fallbackReply,
    });

    const userScopedId = Number.isInteger(Number(policy.userId)) ? Number(policy.userId) : null;
    const storedAssistantMsg = createChatMessage({
      personalityId,
      role: "assistant",
      content: reply,
      userId: userScopedId,
      mode: policy.activeMode,
    });

    setImmediate(() => {
      embedChatMessageAsync(storedAssistantMsg.id, reply).catch(() => {});
    });

    return res.json({
      reply,
      isAI: true,
      policy,
    });
  } catch (error) {
    return next(error);
  }
}

// Maximum number of long-term memory facts to retain per personality.
const MEMORY_MAX = 50;
const MEMORY_RETRIEVAL_LIMIT = 5;

const PREF_EXTRACTION_MIN_INTERVAL_MS = 45_000;
const PREF_EXTRACTION_MIN_TURNS = 3;
const PREF_DECAY_CADENCE = 12;
const preferenceExtractionState = new Map();

function preferenceExtractionKey(personalityId, userScopedId) {
  return `${Number(personalityId) || 0}:${userScopedId ?? "anon"}`;
}

function estimateMessagesTokenCount(messages = []) {
  return messages.reduce((total, item) => {
    const content = String(item?.content || "");
    return total + estimateTokenCount(content) + 4;
  }, 0);
}

function buildUsageSnapshot({
  model,
  contextWindow,
  inputEstimate,
  reply,
  providerUsage,
  source,
}) {
  const promptTokens = Number(providerUsage?.prompt_tokens);
  const completionTokens = Number(providerUsage?.completion_tokens);
  const totalTokens = Number(providerUsage?.total_tokens);

  const inputTokens = Number.isFinite(promptTokens) && promptTokens >= 0
    ? Math.round(promptTokens)
    : Math.max(0, Math.round(inputEstimate));
  const outputTokens = Number.isFinite(completionTokens) && completionTokens >= 0
    ? Math.round(completionTokens)
    : Math.max(0, estimateTokenCount(reply));
  const aggregateTokens = Number.isFinite(totalTokens) && totalTokens >= 0
    ? Math.round(totalTokens)
    : inputTokens + outputTokens;
  const maxTokens = Math.max(1, Math.round(contextWindow || estimateModelContextWindow(model)));
  const percentUsed = Math.min(1, aggregateTokens / maxTokens);

  return {
    source: source || (providerUsage ? "provider" : "estimate"),
    model: String(model || "").trim() || null,
    inputTokens,
    outputTokens,
    totalTokens: aggregateTokens,
    maxTokens,
    percentUsed,
  };
}

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

function resolveCompanionAliasesForPrompt() {
  const config = getCompanionAliasConfig();
  if (!config?.enabled) {
    return [];
  }
  return Array.isArray(config.aliases) ? config.aliases : [];
}

// ---------------------------------------------------------------------------
// Brain telemetry: minimal read-only event emitted at each pipeline stage.
// Only emitted when the client opts in via streamBrain:true (Brain tab open).
// ---------------------------------------------------------------------------
function buildBrainEvent(stage, data = {}) {
  return { timestamp: Date.now(), stage, ...data };
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
  inputTokenEstimate,
  contextWindow,
}) {
  try {
    if (stream.enabled) {
      const generation = await generateChatCompletionStreamWithMeta(messages, async (delta, accumulated) => {
        const liveUsage = buildUsageSnapshot({
          model: null,
          contextWindow,
          inputEstimate: inputTokenEstimate,
          reply: accumulated,
          providerUsage: null,
          source: "estimate",
        });

        stream.write("token", {
          phase: "generation",
          delta,
          reply: accumulated,
          debug: streamedDebugData,
          usage: liveUsage,
        });
      });

      const usage = buildUsageSnapshot({
        model: generation.model,
        contextWindow,
        inputEstimate: inputTokenEstimate,
        reply: generation.reply,
        providerUsage: generation.usage,
      });

      stream.write("usage", {
        phase: "generation",
        usage,
      });

      return {
        reply: generation.reply,
        usage,
        model: generation.model,
        rateLimit: null,
        usedFallbackReply: false,
      };
    }

    const generation = await generateChatCompletionWithMeta(messages);
    const usage = buildUsageSnapshot({
      model: generation.model,
      contextWindow,
      inputEstimate: inputTokenEstimate,
      reply: generation.reply,
      providerUsage: generation.usage,
    });

    return {
      reply: generation.reply,
      usage,
      model: generation.model,
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
      const retryGeneration = await generateChatCompletionWithMeta(retryMessages);
      const retryReply = retryGeneration.reply;
      rateLimit.retrySucceeded = true;
      streamedDebugData.rateLimit = rateLimit;
      stream.write("debug", {
        phase: "rate-limit-retry",
        debug: streamedDebugData,
      });

      const responseWithNotice = `${buildRateLimitNotice({ sanitizedUserMessage, retrySucceeded: true })}${retryReply}`.trim();
      const usage = buildUsageSnapshot({
        model: retryGeneration.model,
        contextWindow,
        inputEstimate: estimateMessagesTokenCount(retryMessages),
        reply: responseWithNotice,
        providerUsage: retryGeneration.usage,
      });

      stream.write("usage", {
        phase: "rate-limit-retry",
        usage,
      });

      return {
        reply: responseWithNotice,
        usage,
        model: retryGeneration.model,
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

      const usage = buildUsageSnapshot({
        model: null,
        contextWindow,
        inputEstimate: inputTokenEstimate,
        reply: buildRateLimitFallbackReply({ sanitizedUserMessage }),
        providerUsage: null,
        source: "estimate",
      });

      stream.write("usage", {
        phase: "rate-limit-fallback",
        usage,
      });

      return {
        reply: buildRateLimitFallbackReply({ sanitizedUserMessage }),
        usage,
        model: null,
        rateLimit,
        usedFallbackReply: true,
      };
    }
  }
}

export async function chatHandler(req, res, next) {
  const stream = createChatStream(res, req.body.streamDebug === true);
  const streamBrain = req.body.streamBrain === true;

  try {
    const rawPersonalityId = req.body.personalityId;
    const isVoxisGuide = rawPersonalityId === 'voxis-guide' || 
                        Boolean(req.body?.guideMode || req.body?.useVoxisGuide);
    const personalityId = isVoxisGuide ? null : Number(rawPersonalityId);
    const message = String(req.body.message || "").trim();
    const userId = req.body.userId;
    const requestedMode = String(req.body.mode || "").trim().toLowerCase();
    const forceWebSearch = req.body.enableSearch === true;

    console.log("[VOXIS DEBUG] Backend received - personalityId:", rawPersonalityId, "isVoxisGuide:", isVoxisGuide);

    if (!isVoxisGuide && !Number.isInteger(personalityId)) {
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

    let personality = null;
    if (isVoxisGuide) {
      personality = { id: 'voxis-guide', name: 'Voxis' };
    } else {
      personality = getPersonalityById(personalityId);
      if (!personality) {
        return res.status(404).json({ error: "Personality not found." });
      }
    }

    const sessionId = generateSessionId();
    if (personality) observePersonalityLoad(sessionId, personality);

    const totalMessages = isVoxisGuide ? 0 : getChatMessageCount(personalityId);

    const stateFlawRuntime = getStateRuntimeConfig();
    const stateFlawStep = stepStateFlaws({
      stateFlaws: personality.stateFlaws,
      userMessage: message,
      turnCount: totalMessages,
      nowMs: Date.now(),
      runtimeConfig: stateFlawRuntime,
    });
    personality.stateFlaws = stateFlawStep.stateFlaws;
    setImmediate(() => {
      updateStateFlaws(personalityId, stateFlawStep.stateFlaws);
    });
    streamedDebugData.stateFlaws = stateFlawStep.diagnostics;
    streamedDebugData.stateRuntime = {
      snapshot: stateFlawStep.snapshot,
      stabilityIndex: stateFlawStep.stabilityIndex,
      directives: stateFlawStep.directives,
    };
    stream.write("debug", {
      phase: "state-flaw",
      debug: streamedDebugData,
    });
    if (streamBrain) {
      const intox = stateFlawStep.diagnostics?.intoxication;
      if (intox?.enabled) {
        stream.write("brain", buildBrainEvent("state_flaw", {
          name: "intoxication",
          before: intox.before,
          after: intox.after,
          triggers: intox.matchedKeywords || [],
          narrative: `Intoxication drift ${Math.round((intox.before || 0) * 100)}% → ${Math.round((intox.after || 0) * 100)}%.`,
        }));
      }
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

    console.log("[VOXIS DEBUG] Mood before LLM call - currentMood:", currentMood);

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

    // Load persona preferences once per turn — used for mood matching and prompt.
    const personaPreferences = getPersonaPreferences(personalityId);

    // Check whether the user message touches any of the persona's emotional preferences.
    const preferenceMatches = matchPreferencesInMessage(personaPreferences, message);
    const preferenceDelta = preferenceMatches.allMatches.length > 0
      ? computePreferenceMoodDelta(preferenceMatches, personality)
      : null;
    const matchedPreferenceIds = preferenceMatches.allMatches
      .map((pref) => Number(pref.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (matchedPreferenceIds.length > 0) {
      reinforcePersonaPreferences(matchedPreferenceIds, 1);
    }

    const moodStep = await stepMoodDetailed({
      currentMood,
      baseline: moodBaseline,
      message,
      personality,
      recentMessages: history,
      preferenceDelta,
      runtimeConfig: getMoodRuntimeConfig(),
    });
    const newMood = moodStep.mood;
    const moodLabel = moodToLabel(newMood);

    console.log("[VOXIS DEBUG] Mood after update - newMood:", newMood, "moodLabel:", moodLabel);

    observeMoodTransition(sessionId, { before: currentMood, after: newMood, label: moodLabel, stepDiagnostics: moodStep.diagnostics });

    // Persist synchronously before the LLM call so mood influences this response.
    updateMoodState(personalityId, newMood);
    personality.moodState = newMood;
    personality.mood = moodLabel;

    // Emotion Memory Drift — update drift state based on this turn's emotion.
    // Drift accumulates emotional habits over time and influences singing emergence.
    const previousMoodLabel = moodToLabel(currentMood);
    const moodIntensity = Math.min(
      1,
      Math.sqrt(
        Math.pow(newMood.valence || 0, 2) +
        Math.pow(newMood.arousal || 0, 2) +
        Math.pow(newMood.dominance || 0, 2),
      ) / Math.sqrt(3),
    );
    let driftState = normalizeDriftState(personality.emotionDrift || {});
    driftState = applyDecay(driftState, 120, personality.singingProfile?.archetype || "none");
    driftState = applyEmotionResidue(driftState, previousMoodLabel);
    driftState = applyEmotionDrift(driftState, moodLabel.toLowerCase(), moodIntensity);
    // Persist drift asynchronously — non-critical, should not block LLM call.
    setImmediate(() => {
      updateEmotionDrift(personalityId, driftState);
    });
    personality.emotionDrift = driftState;

    // Singing emergence — pressure-based decision (not random).
    // checkSingingTrigger replaces probabilistic shouldSingThisTurn:
    // pressure builds across turns until it crosses the threshold.
    const singingProfile = normalizeSingingProfile(personality.singingProfile || {});
    const globalSingingBias = singingProfile.baseSingingAffinity ?? 0.1;
    const singingTrigger = checkSingingTrigger(driftState, globalSingingBias);
    const singingActive = singingTrigger.shouldSing;

    // Legacy chance metric — kept for debug panel display only
    const driftBoost = computeSingingLeakage(driftState, moodLabel.toLowerCase());
    const singingChance = computeSingingChance(singingProfile, moodLabel.toLowerCase(), driftBoost);

    streamedDebugData.singing = {
      archetype: singingProfile.archetype,
      chance: Number(singingChance.toFixed(4)),
      pressure: Number(singingTrigger.totalPressure.toFixed(4)),
      weighted: Number(singingTrigger.weightedPressure.toFixed(4)),
      dominantNode: singingTrigger.dominantNode,
      active: singingActive,
      drift: describeDriftState(driftState),
    };

    // Voice adjustment from emotion graph — applied to voiceProfile at TTS time
    const voiceAdjustments = mapEmotionToVoiceAdjustments(moodLabel.toLowerCase(), moodIntensity);
    streamedDebugData.voiceAdjustments = voiceAdjustments;
    streamedDebugData.mood = {
      before: currentMood,
      after: newMood,
      label: moodLabel,
      adjudication: moodStep.diagnostics,
      runtime: moodStep.diagnostics?.runtime || null,
      preferenceMatches: preferenceDelta
        ? { triggered: preferenceDelta.triggered, archetype: preferenceDelta.archetype }
        : null,
    };
    stream.write("debug", {
      phase: "mood",
      debug: streamedDebugData,
    });
    if (streamBrain) {
      const vBefore = Number((currentMood.valence || 0).toFixed(2));
      const vAfter = Number((newMood.valence || 0).toFixed(2));
      stream.write("brain", buildBrainEvent("mood_update", {
        mood: {
          valence: Number((newMood.valence || 0).toFixed(3)),
          arousal: Number((newMood.arousal || 0).toFixed(3)),
          dominance: Number((newMood.dominance || 0).toFixed(3)),
          label: moodLabel,
        },
        narrative: vBefore === vAfter
          ? `Mood stable at ${moodLabel}.`
          : `Mood shifted to ${moodLabel} (valence ${vBefore > vAfter ? "↓" : "↑"} ${vAfter}).`,
      }));

      // Emotion graph update event for the Brain tab overlay
      const graphNodes = Object.fromEntries(
        Object.entries(driftState).map(([emotion, mem]) => [
          emotion,
          {
            driftWeight: Number((mem.driftWeight || 1).toFixed(3)),
            singingPressure: Number((mem.singingPressure || 0).toFixed(3)),
            exposureCount: mem.exposureCount || 0,
          },
        ]),
      );
      stream.write("brain", buildBrainEvent("emotion_graph", {
        nodes: graphNodes,
        singing: {
          active: singingActive,
          pressure: Number(singingTrigger.totalPressure.toFixed(3)),
          weighted: Number(singingTrigger.weightedPressure.toFixed(3)),
          dominantNode: singingTrigger.dominantNode,
          archetype: singingProfile.archetype,
        },
        voiceAdjustments,
        narrative: singingActive
          ? `Singing triggered via ${singingTrigger.dominantNode} pressure (${singingTrigger.weightedPressure.toFixed(2)}).`
          : `Emotion drift: ${describeDriftState(driftState)}.`,
      }));
    }

    // Fetch long-term memory facts and build the dynamic, memory-enriched system prompt.
    const memoryFacts = await getRelevantPersonalityMemory(
      personalityId,
      message,
      MEMORY_RETRIEVAL_LIMIT,
    );
    const userMemoryFacts = policy.userId
      ? await getRelevantUserMemory(policy.userId, message, 4)
      : [];

    console.log("[VOXIS MEMORY DEBUG] Retrieved memory entries:", memoryFacts.length);
    console.log("[VOXIS MEMORY DEBUG] Memory entries:", memoryFacts.map(m => ({ content: m.content, importance: m.importance, type: m.memoryType })));

    // Layer 2: raw conversation history retrieval — only for recall/personal queries.
    const rawHistoryTurns = isPersonalQuery(message)
      ? await searchRawChatHistory(personalityId, message, 3).catch(() => [])
      : [];
    let promptPackage;
    const guideMode = Boolean(
      req.body?.guideMode || 
      req.body?.useVoxisGuide || 
      req.body?.personalityId === 'voxis-guide'
    );

    if (guideMode) {
      const currentForContext = personality || null;
      const available = getAllPersonalities ? getAllPersonalities().slice(0, 15) : [];
      const recentContext = req.body?.recentGuideActions || req.body?.recentActions || [];
      let contextStr = recentContext.length ? `Recent modifications: ${JSON.stringify(recentContext.slice(-4))}` : "";
      if (req.body?.createMode) {
        contextStr += " User is currently in interactive persona creation mode with you. Confirm you are in creation mode and ask engaging questions.";
      }

      const handshake = runPerceptionEmotionHook(message, {
        selectedPersona: currentForContext,
        lastEmotion: {},
      });

      const responseLayer = runResponseLayer ? runResponseLayer(handshake.perception, handshake.emotion) : {};

      const emotionContext = `Current emotional lens from handshake: valence=${handshake.emotion.valence}, arousal=${handshake.emotion.arousal}, dominant=${handshake.emotion.dominant.join(", ")}. Suggested cues: ${JSON.stringify(handshake.emotion.suggestedCues)}.`;

      const voxisSys = buildVoxisPrompt(currentForContext, available, `${contextStr}\n${emotionContext}`);
      promptPackage = { prompt: voxisSys, directedText: "", handshake, responseLayer };
    } else {
      promptPackage = buildPersonaPromptPackage(personality, memoryFacts, message, {
        currentMoodLabel: moodLabel,
        conversationKey: `${personalityId}:${userScopedId ?? "anon"}`,
        userName: req.voxisUser?.displayName || "",
        companionAliases: resolveCompanionAliasesForPrompt(),
      });
    }
    const systemPrompt = promptPackage.prompt;

    console.log("[VOXIS DEBUG] Final prompt sent to LLM (first 500 chars):", systemPrompt.substring(0, 500));
    console.log("[VOXIS DEBUG] Personality behavioral impact - name:", personality.name);
    console.log("[VOXIS DEBUG] Top 3 traits:", (personality.traits || []).slice(0, 3));
    console.log("[VOXIS DEBUG] Behavioral directives sent to LLM (first 300 chars):", (personality.behaviorRules || []).join(" ").substring(0, 300));
    console.log("[VOXIS MEMORY DEBUG] Selected memory used in prompt:", (promptPackage.debug?.injectedMemories || []).map(m => ({ content: m.content, injectedAs: m.injectedAs })));
    console.log("[VOXIS MEMORY DEBUG] Final memory block injected into LLM (first 400 chars):", systemPrompt.substring(systemPrompt.indexOf("== IMMUTABLE IDENTITY ANCHORS =="), systemPrompt.indexOf("== IMMUTABLE IDENTITY ANCHORS ==") + 400));

    observeMemoryInjection(sessionId, {
      retrieved: memoryFacts,
      injected: promptPackage.debug?.injectedMemories || [],
      promptSection: systemPrompt.substring(systemPrompt.indexOf("== IMMUTABLE IDENTITY ANCHORS =="), systemPrompt.indexOf("== IMMUTABLE IDENTITY ANCHORS ==") + 400),
    });

    observePromptConstruction(sessionId, {
      promptPackage,
      moodLabel,
      activeGoal: promptPackage.activeGoal,
      activeResponseLens: promptPackage.activeResponseLens,
    });

    streamedDebugData.goal = promptPackage.activeGoal;
    streamedDebugData.responseLens = promptPackage.activeResponseLens;
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
    if (streamBrain) {
      const anchorCount = memoryFacts.filter((m) => m.importance >= 9).length;
      stream.write("brain", buildBrainEvent("memory_retrieval", {
        memories: memoryFacts.map((m) => ({
          id: String(m.id),
          content: m.content,
          score: m._relevanceScore !== null && m._relevanceScore !== undefined
            ? Number(m._relevanceScore.toFixed(3))
            : null,
          reason: m.importance >= 9 ? "anchor" : m.memoryType || "context",
        })),
        narrative: `Retrieved ${memoryFacts.length} memor${memoryFacts.length === 1 ? "y" : "ies"} (${anchorCount} anchor${anchorCount !== 1 ? "s" : ""}).`,
      }));
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    let webSearchResult = null;
    const webSearchEnabled = shouldUseWebSearch({ query: message, forced: forceWebSearch });
    if (webSearchEnabled) {
      webSearchResult = await searchWeb(message);
      streamedDebugData.webSearch = {
        triggered: true,
        forced: forceWebSearch,
        provider: webSearchResult.provider,
        results: (webSearchResult.results || []).map((entry, index) => ({
          index: index + 1,
          title: entry.title,
          url: entry.url,
        })),
      };

      stream.write("debug", {
        phase: "search",
        debug: streamedDebugData,
      });

      if (streamBrain) {
        stream.write("brain", buildBrainEvent("web_search", {
          query: message,
          provider: webSearchResult.provider,
          resultCount: Array.isArray(webSearchResult.results) ? webSearchResult.results.length : 0,
          narrative: Array.isArray(webSearchResult.results) && webSearchResult.results.length
            ? `Web search returned ${webSearchResult.results.length} sources.`
            : "Web search returned no high-confidence sources.",
        }));
      }
    }

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

    // Persona emotional preferences — what this persona loves, hates, is triggered by.
    // Injected as a system section so the LLM stays in character when topics arise.
    const personaPrefsSection = buildPersonaPreferencesPromptSection(personaPreferences);
    if (personaPrefsSection) {
      messages.push({ role: "system", content: personaPrefsSection });
    }

    // What the persona has learned about this user's emotional preferences.
    const userEmotionalSection = buildUserEmotionalProfileSection(userMemoryFacts);
    if (userEmotionalSection) {
      messages.push({ role: "system", content: userEmotionalSection });
    }

    const webSearchSection = buildWebSearchPromptSection(webSearchResult);
    if (webSearchSection) {
      messages.push({ role: "system", content: webSearchSection });
    }

    // Periodic reconditioning: inject a compressed persona anchor every N turns to
    // counter personality drift. Cadence is tighter for antagonist contexts.
    const reconditionEvery = getReconditionEvery(personality.creativeContext);
    const shouldRecondition = totalMessages > 0 && totalMessages % reconditionEvery === 0;
    const shouldDecayPreferences = totalMessages > 0 && totalMessages % PREF_DECAY_CADENCE === 0;
    if (shouldDecayPreferences) {
      setImmediate(() => {
        decayPersonaPreferences(personalityId, {
          idleDays: 14,
          minImportance: 4,
          decayStep: 1,
        });
      });
    }
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

    // Singing instruction — injected as a late system message (decision already made in code).
    // Grok architecture: code decides, LLM gets a 1-sentence directive — no heavy prompt frame.
    const singingInstruction = buildSingingInstruction(singingProfile, moodLabel.toLowerCase(), singingActive);
    if (singingInstruction) {
      messages.push({ role: "system", content: singingInstruction });
    }

    // Layer 2 raw history: inject recalled past conversation moments when triggered.
    const rawHistorySection = buildRawHistorySection(rawHistoryTurns);
    if (rawHistorySection) {
      messages.push({ role: "system", content: rawHistorySection });
    }

    streamedDebugData.flags = {
      ...streamedDebugData.flags,
      reconditioned: shouldRecondition,
      preferenceDecayEvaluated: shouldDecayPreferences,
      moodFragmentInjected: Boolean(moodFragment),
      singingInstructionInjected: Boolean(singingInstruction),
      historyMessages: history.length,
    };
    stream.write("debug", {
      phase: promptPackage.activeGoal?.goal ? "intent" : "prompt",
      debug: streamedDebugData,
    });
    if (streamBrain) {
      const activeGoal = promptPackage.activeGoal;
      if (activeGoal) {
        const intentScores = {};
        for (const entry of (activeGoal.allScores || [])) {
          intentScores[String(entry.goal).slice(0, 60)] = entry.score;
        }
        stream.write("brain", buildBrainEvent("intent_selection", {
          activeIntent: activeGoal.goal,
          intentScores,
          narrative: activeGoal.source === "relevance"
            ? `Selected goal via relevance (score ${activeGoal.score}).`
            : "No relevant goal matched; using rotation fallback.",
        }));
      }
      const budget = promptPackage.debug?.promptBudget || {};
      stream.write("brain", buildBrainEvent("prompt_assembly", {
        tokenUsage: {
          charBudget: budget.charBudget || 0,
          charCount: budget.charCount || 0,
          approxTokens: budget.approxTokens || 0,
          utilization: budget.utilization || 0,
        },
        narrative: `Prompt assembled at ${Math.round((budget.utilization || 0) * 100)}% of ${budget.charBudget || 0}-char budget.`,
      }));
    }

    messages.push({ role: "user", content: message });
    const inputTokenEstimate = estimateMessagesTokenCount(messages);
    const contextWindow = estimateModelContextWindow(process.env.LLM_MODEL || "");

    stream.write("debug", {
      phase: "generation",
      debug: streamedDebugData,
    });
    if (streamBrain) {
      stream.write("brain", buildBrainEvent("response_generation", {
        tokenUsage: { inputEstimate: inputTokenEstimate },
        narrative: `Generating response (~${inputTokenEstimate} input tokens).`,
      }));
    }

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
      inputTokenEstimate,
      contextWindow,
    });
    let reply = generation.reply;
    let usage = generation.usage;

    observeLLMGeneration(sessionId, { inputTokens: inputTokenEstimate, model: process.env.LLM_MODEL || "unknown", usage });
    const rateLimit = generation.rateLimit;
    const usedFallbackReply = generation.usedFallbackReply;
    let scientistValidation = null;
    let scientistRepairAttempted = false;
    let emotionalRepairApplied = false;

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

    if (
      policy.activeMode !== "kids" &&
      !usedFallbackReply &&
      shouldRegenerateEmotionalResponse(reply, newMood, personality)
    ) {
      try {
        const emotionalRepairMessages = [
          { role: "system", content: buildModePolicyPrompt(policy) },
          { role: "system", content: buildPersonaAnchor(personality) },
        ];

        if (scientistContract) {
          emotionalRepairMessages.push({ role: "system", content: scientistContract });
        }

        if (moodFragment) {
          emotionalRepairMessages.push({ role: "system", content: moodFragment });
        }

        emotionalRepairMessages.push({
          role: "user",
          content: buildEmotionalRepairPrompt({
            reply,
            mood: newMood,
            personality,
            userMessage: message,
          }),
        });

        const repairedEmotionReply = await generateChatCompletion(emotionalRepairMessages);
        if (String(repairedEmotionReply || "").trim()) {
          reply = repairedEmotionReply.trim();
          emotionalRepairApplied = true;
        }
      } catch {
        // Keep the original reply if the repair pass fails.
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

    const sampled = applyBoundedExpressionSampling(reply, {
      config: getExpressionSamplingConfig(),
      mode: policy.activeMode || "normal",
      seedInput: `${personalityId}:${userScopedId ?? "anon"}:${message}`,
      mood: newMood,
      emotionSignal: newMood?.emotionalState?.signal || "neutral",
    });
    reply = sampled.text;

    const cadenceRegulation = regulateReplyCadence({
      reply,
      personality,
      history,
      mood: newMood,
    });
    reply = cadenceRegulation.text;

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
    streamedDebugData.emotionalAuthenticity = {
      active: Boolean(newMood?.emotionalState?.active),
      intensity: newMood?.emotionalState?.intensity || 0,
      signal: newMood?.emotionalState?.signal || "neutral",
      repairApplied: emotionalRepairApplied,
    };
    streamedDebugData.expressionSampling = sampled;
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
      responseLens: promptPackage.activeResponseLens,
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
      emotionalAuthenticity: {
        active: Boolean(newMood?.emotionalState?.active),
        intensity: newMood?.emotionalState?.intensity || 0,
        signal: newMood?.emotionalState?.signal || "neutral",
        repairApplied: emotionalRepairApplied,
      },
      stateFlaws: stateFlawStep.diagnostics,
      stateRuntime: {
        snapshot: stateFlawStep.snapshot,
        stabilityIndex: stateFlawStep.stabilityIndex,
        directives: stateFlawStep.directives,
      },
      expressionSampling: sampled,
      webSearch: webSearchResult
        ? {
            query: webSearchResult.query,
            provider: webSearchResult.provider,
            resultCount: Array.isArray(webSearchResult.results) ? webSearchResult.results.length : 0,
            results: (webSearchResult.results || []).map((entry, index) => ({
              index: index + 1,
              title: entry.title,
              url: entry.url,
            })),
          }
        : {
            query: message,
            provider: null,
            resultCount: 0,
            results: [],
          },
      cadenceRegulation,
      prompt: promptPackage.debug,
      flags: {
        reconditioned: shouldRecondition,
        moodFragmentInjected: Boolean(moodFragment),
        historyMessages: history.length,
        embeddingsConfigured: isEmbeddingConfigured(),
        rateLimitRecovered: Boolean(rateLimit?.retrySucceeded),
        rateLimitFallbackDelivered: Boolean(rateLimit?.fallbackDelivered),
        emotionalRepairApplied,
        cadenceRegulationAdjusted: cadenceRegulation.adjusted,
      },
    };

    const vadDeltaForGate = {
      valence: newMood.valence - currentMood.valence,
      arousal: newMood.arousal,
    };
    const extractionStateKey = preferenceExtractionKey(personalityId, userScopedId);
    const previousExtraction = preferenceExtractionState.get(extractionStateKey) || null;
    const extractionDecision = shouldExtractPreferencesWithCooldown({
      userMessage: message,
      assistantReply: reply,
      moodDelta: vadDeltaForGate,
      lastExtractionAtMs: previousExtraction?.atMs ?? null,
      lastExtractionTurn: previousExtraction?.turn ?? null,
      currentTurn: totalMessages,
      minIntervalMs: PREF_EXTRACTION_MIN_INTERVAL_MS,
      minTurns: PREF_EXTRACTION_MIN_TURNS,
    });
    const shouldRunPreferenceExtraction = extractionDecision.shouldExtract;

    const extractPersonaPreferences = async () => {
      if (!shouldRunPreferenceExtraction) {
        return [];
      }

      preferenceExtractionState.set(extractionStateKey, {
        atMs: Date.now(),
        turn: totalMessages + 2,
      });

      const newPersonaPrefs = await extractPersonaPreferencesFromConversation({
        personality,
        userMessage: message,
        assistantReply: reply,
        existingPreferences: personaPreferences,
      });

      for (const pref of newPersonaPrefs) {
        upsertPersonaPreference(personalityId, pref.prefType, pref.content, pref.importance);
      }

      if (newPersonaPrefs.length > 0) {
        prunePersonaPreferences(personalityId, 80);
      }

      return newPersonaPrefs;
    };

    const utterancePlan = buildUtterancePlan({
      reply,
      stateFlaws: personality.stateFlaws,
      mode: policy.activeMode,
    });

    const refinementSuggestions = extractRefinementSuggestions({
      assistantReply: utterancePlan.rawText || reply,
      userMessage: message,
    });

    observeUtterancePlan(sessionId, { utterancePlan, reply });

    const responsePayload = {
      reply: utterancePlan.rawText,
      displayReply: utterancePlan.displayText,
      isPerformanceOutput: utterancePlan.isPerformanceOutput,
      utterancePlan,
      expressionReplayId: sampled.replayId || "",
      isAI: true,
      moodState: newMood,
      moodLabel,
      policy,
      usage,
      // Forward voice params so the frontend can apply them to the TTS request
      // without needing to parse the debug event stream.
      voiceAdjustments: streamedDebugData.voiceAdjustments || null,
      singingActive: singingActive || false,
      webSearch: webSearchResult
        ? {
            query: webSearchResult.query,
            provider: webSearchResult.provider,
            resultCount: Array.isArray(webSearchResult.results) ? webSearchResult.results.length : 0,
            results: (webSearchResult.results || []).map((entry, index) => ({
              index: index + 1,
              title: entry.title,
              url: entry.url,
            })),
          }
        : null,
      refinementSuggestions,
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

      try {
        const newPersonaPrefs = await extractPersonaPreferences();
        stream.write("debug", {
          phase: "preference-write",
          debug: {
            ...debugData,
            personaPreferencesExtracted: newPersonaPrefs,
            flags: shouldRunPreferenceExtraction
              ? debugData.flags
              : {
                  ...debugData.flags,
                  preferenceExtractionGated: true,
                  preferenceExtractionGateReason: extractionDecision.reason,
                  preferenceExtractionCooldownMs: extractionDecision.cooldownRemainingMs,
                  preferenceExtractionCooldownTurns: extractionDecision.cooldownRemainingTurns,
                },
          },
        });
      } catch {
        // Preference extraction is additive and non-fatal.
      }

      stream.close("done", { ok: true });
      return;
    }

    setImmediate(() => {
      backfillMissingMemoryEmbeddings(personalityId).catch((err) => {
        console.warn("[Chat] memory embedding backfill failed (non-fatal)", {
          personalityId,
          error: String(err?.message || err || "unknown"),
        });
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
      } catch (err) {
        console.warn("[Chat] memory extraction failed (non-fatal)", {
          personalityId,
          error: String(err?.message || err || "unknown"),
        });
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
        } catch (err) {
          console.warn("[Chat] user memory extraction failed (non-fatal)", {
            personalityId,
            userId: policy.userId,
            error: String(err?.message || err || "unknown"),
          });
        }
      });
    }

    setImmediate(async () => {
      try {
        await extractPersonaPreferences();
      } catch (err) {
        console.warn("[Chat] preference extraction failed (non-fatal)", {
          personalityId,
          error: String(err?.message || err || "unknown"),
        });
      }
    });

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

    const messages = getChatMessages(personalityId, 50).map((message) => {
      if (message.role !== "assistant") {
        return {
          ...message,
          displayContent: message.content,
          utterancePlan: {
            rawText: message.content,
            displayText: message.content,
            speechText: message.content,
            isPerformanceOutput: false,
            speechImpulses: null,
            stateSnapshot: null,
          },
          isPerformanceOutput: false,
        };
      }

      const utterancePlan = buildUtterancePlan({ reply: message.content });
      return {
        ...message,
        displayContent: utterancePlan.displayText,
        utterancePlan,
        isPerformanceOutput: utterancePlan.isPerformanceOutput,
      };
    });

    return res.json(messages);
  } catch (error) {
    return next(error);
  }
}
