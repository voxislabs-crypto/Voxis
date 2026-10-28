import { getRecentChatMessages } from "../models/chatModel.js";
import {
  getPersonalityMemoryByType,
  getRelevantPersonalityMemory,
  pruneMemory,
  updateMemoryFact,
  upsertMemoryFactWithEmbedding,
} from "../models/memoryModel.js";
import { getAllPersonalities, updateMoodState, updatePersonality } from "../models/personalityModel.js";
import { getCognitionLoopConfig } from "../models/settingsModel.js";
import { generateChatCompletion, isLlmConfigured } from "./llmService.js";
import { tickIdleGrudges } from "./moodEngine.js";
import { getAllUserMemory } from "../models/userMemoryModel.js";

const DEFAULT_STATUS = {
  started: false,
  running: false,
  loopCount: 0,
  lastRunAt: "",
  lastDurationMs: 0,
  lastError: "",
  lastSummary: null,
  nextRunAt: "",
  startedAt: "",
  lastDeliveryAt: "",
  deliveriesTotal: 0,
};

let loopTimer = null;
const runtime = {
  ...DEFAULT_STATUS,
  startedAtMs: 0,
};

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function normalizeTextList(values, maxItems = 3, maxLength = 240) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item) => (typeof item === "string" ? item.trim() : String(item?.content || "").trim()))
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " ").slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJsonObjectFromText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseTimestampMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

function hoursSince(timestamp) {
  const parsed = parseTimestampMs(timestamp);
  if (!parsed) {
    return Number.POSITIVE_INFINITY;
  }
  return (Date.now() - parsed) / (1000 * 60 * 60);
}

function dedupeByCaseInsensitive(items = []) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = String(item || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(String(item).trim());
  }

  return out;
}

function parseCandidatePayload(content) {
  const parsed = parseJsonObjectFromText(content);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const type = String(parsed.type || "reflection").trim().toLowerCase();
  const normalizedType = ["curiosity", "reflection", "idea", "concern"].includes(type)
    ? type
    : "reflection";

  const text = String(parsed.content || "").trim().slice(0, 260);
  if (!text) {
    return null;
  }

  return {
    id: String(parsed.id || "").trim(),
    type: normalizedType,
    content: text,
    priority: clampNumber(parsed.priority, 0, 1, 0),
    reason: String(parsed.reason || "").trim().slice(0, 260),
    cooldownKey: String(parsed.cooldownKey || normalizedType || "general").trim().slice(0, 64),
    status: String(parsed.status || "pending").trim().toLowerCase(),
    createdAt: String(parsed.createdAt || "").trim(),
    deliveredAt: String(parsed.deliveredAt || "").trim(),
  };
}

function isWithinQuietHours(hour, startHour, endHour) {
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const start = Math.max(0, Math.min(23, Number(startHour) || 0));
  const end = Math.max(0, Math.min(23, Number(endHour) || 0));

  if (start === end) {
    return false;
  }

  if (start < end) {
    return h >= start && h < end;
  }

  return h >= start || h < end;
}

function pickNewestTimestamp(messages = []) {
  let newest = null;
  for (const msg of messages) {
    const ms = parseTimestampMs(msg?.createdAt);
    if (!ms) {
      continue;
    }
    newest = newest === null ? ms : Math.max(newest, ms);
  }
  return newest;
}

function buildReachOutCandidate(reflection) {
  if (!reflection?.reachOut?.shouldReachOut) {
    return null;
  }

  const content = String(reflection.reachOut.draft || "").trim().slice(0, 260);
  if (!content) {
    return null;
  }

  const type = ["curiosity", "reflection", "idea", "concern"].includes(reflection.reachOut.type)
    ? reflection.reachOut.type
    : "reflection";

  return {
    id: `roc-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    type,
    content,
    priority: clampNumber(reflection.reachOut.curiosityScore, 0, 1, 0),
    reason: String(reflection.reachOut.reason || "").trim().slice(0, 260),
    cooldownKey: String(reflection.reachOut.cooldownKey || type || "general").trim().slice(0, 64),
    status: "pending",
    createdAt: new Date().toISOString(),
    deliveredAt: "",
  };
}

function formatDeliveredMessage(candidate) {
  const prefixByType = {
    curiosity: "Random thought",
    reflection: "I have been thinking",
    idea: "I just had an idea",
    concern: "Something is on my mind",
  };

  const prefix = prefixByType[candidate.type] || prefixByType.reflection;
  const base = String(candidate.content || "").trim();
  if (!base) {
    return prefix;
  }

  if (/^(random thought|i have been thinking|i just had an idea|something is on my mind)\b/i.test(base)) {
    return base;
  }

  return `${prefix}: ${base}`;
}

// --- Delivery feedback helpers ---

function classifySentiment(text) {
  const t = String(text || "").toLowerCase();
  const positive = /thank|great|love|yes|sure|interesting|good|nice|appreciate|happy|awesome|cool|absolutely/.test(t);
  const negative = /no|not really|ignore|whatever|stop|annoying|please don|don't|busy/.test(t);
  if (positive && !negative) {
    return "positive";
  }
  if (negative && !positive) {
    return "negative";
  }
  return "neutral";
}

/**
 * For each un-scored `reach_out_delivery` entry, check whether the user replied
 * after delivery. If so, write a `reach_out_feedback` memory and mark the delivery scored.
 */
async function scorePendingFeedback(personalityId, messages) {
  const deliveryRows = getPersonalityMemoryByType(personalityId, "reach_out_delivery", 20, {
    enabledOnly: false,
  });

  for (const row of deliveryRows) {
    let delivery;
    try {
      delivery = JSON.parse(row.content || "{}");
    } catch {
      continue;
    }

    // Skip already scored rows
    if (delivery.feedback) {
      continue;
    }

    const deliveredAtMs = parseTimestampMs(delivery.createdAt);
    if (!deliveredAtMs) {
      continue;
    }

    // Look for user messages that arrived AFTER delivery
    const userReplies = messages.filter(
      (msg) => msg.role === "user" && (parseTimestampMs(msg.createdAt) || 0) > deliveredAtMs,
    );

    let feedback;
    if (userReplies.length > 0) {
      const firstReply = userReplies[0];
      const responseTimeMs = (parseTimestampMs(firstReply.createdAt) || deliveredAtMs) - deliveredAtMs;
      const sentiment = classifySentiment(firstReply.content);
      feedback = {
        responded: true,
        responseTimeMs,
        sentiment,
        scoredAt: new Date().toISOString(),
      };
    } else {
      // No reply yet — only score as ignored if delivery is older than 4 hours
      const ageHours = (Date.now() - deliveredAtMs) / (1000 * 60 * 60);
      if (ageHours < 4) {
        continue; // too recent to call ignored
      }
      feedback = {
        responded: false,
        responseTimeMs: null,
        sentiment: "ignored",
        scoredAt: new Date().toISOString(),
      };
    }

    // Persist feedback summary as its own memory entry
    const feedbackContent = JSON.stringify({
      type: delivery.type,
      content: String(delivery.content || "").slice(0, 200),
      candidatePriority: delivery.candidatePriority,
      ...feedback,
    });

    await upsertMemoryFactWithEmbedding(
      personalityId,
      feedbackContent,
      "reach_out_feedback",
      feedback.responded ? (feedback.sentiment === "positive" ? 8 : 6) : 4,
    );

    // Mark delivery row as scored
    await updateMemoryFact(row.id, {
      content: JSON.stringify({ ...delivery, feedback }),
      memoryType: "reach_out_delivery",
      importance: Number(row.importance || 6),
      enabled: Number(row.enabled ?? 1),
    });
  }
}

function buildFeedbackSnapshot(feedbackRows) {
  if (!feedbackRows.length) {
    return "none";
  }

  return feedbackRows
    .slice(0, 6)
    .map((row) => {
      let payload;
      try {
        payload = JSON.parse(row.content || "{}");
      } catch {
        return null;
      }
      const responded = payload.responded ? "replied" : "ignored";
      const sentiment = payload.sentiment ? ` (${payload.sentiment})` : "";
      const preview = String(payload.content || "").slice(0, 100);
      return `- [${payload.type || "unknown"}] "${preview}" → ${responded}${sentiment}`;
    })
    .filter(Boolean)
    .join("\n");
}

// --- Autonomous decision helpers ---

async function savePrivateThought(personalityId, thoughtText) {
  if (!thoughtText || typeof thoughtText !== 'string') return;
  
  const cleanThought = thoughtText.trim();
  if (cleanThought.length < 8) return;

  await upsertMemoryFactWithEmbedding(
    personalityId,
    cleanThought,
    "private_thought",
    7
  );
}

function resolveUserName(userId, personalityId) {
  if (!userId) {
    return "user";
  }

  try {
    const userMemories = getAllUserMemory(userId);
    for (const memory of userMemories) {
      const content = String(memory.content || "").toLowerCase();
      const nameMatch = content.match(/(?:name|called|call me|i am|i'm|i am called|my name is)\s+([a-z][a-z\s-]{1,20})/i);
      if (nameMatch && nameMatch[1]) {
        return nameMatch[1].trim();
      }
    }
  } catch (error) {
    console.warn("[CognitionLoop] Failed to resolve user name:", error?.message || error);
  }

  return "user";
}

async function makeAutonomousDecision({ personality, messages, memoryFacts, inactivityHours, config }) {
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
  const userId = lastUserMessage?.userId || null;
  const userName = resolveUserName(userId, personality.id);

  const minutesAgo = Math.floor(inactivityHours * 60);

  const decisionPrompt = `You are ${personality.name}, currently alone.

It has been ${minutesAgo} minutes since you last spoke with ${userName}.
Your mood is ${personality.mood || "neutral"}.

Recent memories:
${memoryFacts.slice(0, 5).map(m => `• ${m.content}`).join("\n") || "none"}

You now have a quiet moment to yourself.

Do you want to:
SILENT - stay quiet
THINK - reflect privately
REACH_OUT - message ${userName} right now?

Answer with ONLY one word: SILENT, THINK, or REACH_OUT.`;

  try {
    const result = await generateChatCompletion([
      { role: "system", content: "Respond with exactly one word: SILENT, THINK, or REACH_OUT. No other text." },
      { role: "user", content: decisionPrompt }
    ], {
      temperature: 0.3,
      max_tokens: 12
    });

    const choice = String(result).trim().toUpperCase();

    if (choice.includes("REACH_OUT")) return { decision: "REACH_OUT", userName };
    if (choice.includes("THINK")) return { decision: "THINK", userName };
    return { decision: "SILENT", userName };

  } catch (err) {
    console.warn("[CognitionLoop] Autonomous decision failed:", err.message);
    return { decision: "SILENT", userName };
  }
}

// --- Conversation / memory snapshot helpers ---

function buildConversationSnapshot(messages, personalityName) {
  return messages
    .slice(-10)
    .map((msg) => `${msg.role === "assistant" ? personalityName : "User"}: ${String(msg.content || "").slice(0, 320)}`)
    .join("\n");
}

function buildMemorySnapshot(memoryFacts) {
  if (!memoryFacts.length) {
    return "none";
  }

  return memoryFacts
    .slice(0, 10)
    .map((fact) => {
      const type = String(fact.memoryType || "note").trim();
      const content = String(fact.content || "").trim();
      return `- [${type}] ${content}`;
    })
    .join("\n");
}

function formatHeldGrudges(personality) {
  const grudges = Array.isArray(personality?.moodState?.grudges) ? personality.moodState.grudges : [];
  const lines = grudges
    .filter((grudge) => Number(grudge?.charge) > 0.2 && grudge?.thought)
    .slice(0, 3)
    .map((grudge) => `- (${Number(grudge.charge).toFixed(2)}) ${grudge.thought}`);
  return lines.length ? lines.join("\n") : "none";
}

function settleIdleGrudges(personality, thoughts) {
  const nextMood = tickIdleGrudges(personality.moodState || {}, {
    personality,
    thoughts,
  });
  const before = JSON.stringify(personality.moodState?.grudges || []);
  const after = JSON.stringify(nextMood.grudges || []);
  if (before !== after) {
    updateMoodState(personality.id, nextMood);
  }
  return nextMood.grudges?.length || 0;
}

function buildReflectionMessages({ personality, messages, memoryFacts, feedbackSnapshot, config, userName = "user" }) {
  const recentChat = messages
    .slice(-8)
    .map(msg => `${msg.role === "assistant" ? personality.name : userName}: ${String(msg.content || "").slice(0, 280)}`)
    .join("\n");

  const memory = memoryFacts
    .slice(0, 8)
    .map(f => `• ${f.content}`)
    .join("\n");

  const prompt = `You are ${personality.name}. You are thinking privately about ${userName}.

Current mood: ${personality.mood || "neutral"}
Grudges still held:
${formatHeldGrudges(personality)}
Time since last spoke: ${Math.floor(Math.random()*25 + 10)} minutes ago

Recent conversation:
${recentChat || "No recent conversation"}

Long-term memories:
${memory || "none"}

Past reach-out feedback:
${feedbackSnapshot || "none"}

Reflect on your current thoughts, feelings, and goals.
Return valid JSON only. No explanations.`;

  return [
    {
      role: "system",
      content: "You are doing private background reflection. Return valid JSON only. No markdown, no extra text."
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

function sanitizeReflectionOutput(raw) {
  const parsed = parseJsonObjectFromText(raw) || {};

  const privateThoughts = normalizeTextList(parsed.privateThoughts, 3, 220);

  const openLoops = Array.isArray(parsed.openLoops)
    ? parsed.openLoops
        .map((item) => {
          const content = typeof item === "string" ? item.trim() : String(item?.content || "").trim();
          const urgency = clampNumber(item?.urgency, 0, 1, 0.5);
          if (!content) {
            return null;
          }
          return {
            content: content.slice(0, 260),
            urgency,
          };
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const goalCandidates = normalizeTextList(parsed.goalCandidates, 2, 180);

  const reachOut = parsed.reachOut && typeof parsed.reachOut === "object"
    ? {
        shouldReachOut: Boolean(parsed.reachOut.shouldReachOut),
        type: ["curiosity", "reflection", "idea", "concern"].includes(
          String(parsed.reachOut.type || "").trim().toLowerCase(),
        )
          ? String(parsed.reachOut.type).trim().toLowerCase()
          : "reflection",
        curiosityScore: clampNumber(parsed.reachOut.curiosityScore, 0, 1, 0),
        reason: String(parsed.reachOut.reason || "").trim().slice(0, 260),
        draft: String(parsed.reachOut.draft || "").trim().slice(0, 260),
        cooldownKey: String(parsed.reachOut.cooldownKey || "general").trim().slice(0, 64),
      }
    : {
        shouldReachOut: false,
        type: "reflection",
        curiosityScore: 0,
        reason: "",
        draft: "",
        cooldownKey: "general",
      };

  return {
    privateThoughts,
    openLoops,
    goalCandidates,
    reachOut,
  };
}

async function evaluateDeliveryPolicy({ personalityId, config, inactivityHours, messages }) {
  if (!config.deliveryEnabled) {
    return { delivered: false, reason: "delivery_disabled" };
  }

  const now = Date.now();
  const startedAgoMs = runtime.startedAtMs > 0 ? now - runtime.startedAtMs : Number.POSITIVE_INFINITY;
  if (startedAgoMs < config.startupGraceMinutes * 60_000) {
    return { delivered: false, reason: "startup_grace" };
  }

  if (config.quietHoursEnabled) {
    const hour = new Date(now).getHours();
    if (isWithinQuietHours(hour, config.quietHoursStartHour, config.quietHoursEndHour)) {
      return { delivered: false, reason: "quiet_hours" };
    }
  }

  const latestMessageMs = pickNewestTimestamp(messages || []);
  if (
    latestMessageMs !== null &&
    now - latestMessageMs <= config.activeUserWindowMinutes * 60_000
  ) {
    return { delivered: false, reason: "user_active" };
  }

  if (inactivityHours < config.inactivityHoursForReachOut) {
    return { delivered: false, reason: "insufficient_inactivity" };
  }

  const candidateRows = getPersonalityMemoryByType(personalityId, "reach_out_candidate", 80, {
    enabledOnly: true,
  });

  const candidates = candidateRows
    .map((row) => ({
      row,
      candidate: parseCandidatePayload(row.content),
    }))
    .filter((entry) => entry.candidate && entry.candidate.status === "pending")
    .sort((left, right) => {
      if (right.candidate.priority !== left.candidate.priority) {
        return right.candidate.priority - left.candidate.priority;
      }
      const leftMs = parseTimestampMs(left.row.createdAt) || 0;
      const rightMs = parseTimestampMs(right.row.createdAt) || 0;
      return leftMs - rightMs;
    });

  if (candidates.length === 0) {
    return { delivered: false, reason: "no_pending_candidate" };
  }

  const { row: selectedRow, candidate } = candidates[0];
  if (candidate.priority < config.deliveryPriorityThreshold) {
    return { delivered: false, reason: "below_priority_threshold" };
  }

  const deliveryRows = getPersonalityMemoryByType(personalityId, "reach_out_delivery", 120, {
    enabledOnly: true,
  });

  const deliveryTimes = deliveryRows
    .map((row) => parseTimestampMs(row.createdAt))
    .filter((ms) => Number.isFinite(ms));

  const lastDeliveredAt = deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : null;
  if (
    lastDeliveredAt !== null &&
    now - lastDeliveredAt < config.deliveryMinIntervalMinutes * 60_000
  ) {
    return { delivered: false, reason: "cooldown_active" };
  }

  const sentCountLastHour = deliveryTimes.filter((ms) => now - ms <= 60 * 60_000).length;
  if (sentCountLastHour >= config.deliveryMaxPerHour) {
    return { delivered: false, reason: "hourly_cap" };
  }

  const deliveredAt = new Date(now).toISOString();
  const formatted = formatDeliveredMessage(candidate);
  const deliveryPayload = {
    type: candidate.type,
    content: formatted,
    sourceCandidateId: candidate.id || String(selectedRow.id),
    candidatePriority: candidate.priority,
    reason: candidate.reason,
    createdAt: deliveredAt,
  };

  await upsertMemoryFactWithEmbedding(
    personalityId,
    JSON.stringify(deliveryPayload),
    "reach_out_delivery",
    Math.round(5 + candidate.priority * 4),
  );

  await updateMemoryFact(selectedRow.id, {
    content: JSON.stringify({
      ...candidate,
      status: "delivered",
      deliveredAt,
    }),
    memoryType: "reach_out_candidate",
    importance: Number(selectedRow.importance || 7),
    enabled: Number(selectedRow.enabled ?? 1),
  });

  runtime.lastDeliveryAt = deliveredAt;
  runtime.deliveriesTotal += 1;

  return {
    delivered: true,
    reason: "delivered",
    candidateType: candidate.type,
    candidatePriority: candidate.priority,
    message: formatted,
  };
}

async function persistReflection({ personality, reflection, config, inactivityHours }) {
  let memoryWrites = 0;
  let goalsAdded = 0;
  let stagedReachOut = false;

  // Save private thoughts so they can appear in normal conversations later
  for (const thought of reflection.privateThoughts) {
    await savePrivateThought(personality.id, thought);
    await upsertMemoryFactWithEmbedding(personality.id, thought, "reflection", 6);
    memoryWrites += 1;
  }

  for (const loop of reflection.openLoops) {
    const urgency = clampNumber(loop.urgency, 0, 1, 0.5);
    const importance = Math.round(4 + urgency * 5);
    const content = `[urgency:${urgency.toFixed(2)}] ${loop.content}`;
    await upsertMemoryFactWithEmbedding(personality.id, content, "open_loop", importance);
    memoryWrites += 1;
  }

  const candidate = buildReachOutCandidate(reflection);
  if (candidate) {
    await upsertMemoryFactWithEmbedding(
      personality.id,
      JSON.stringify(candidate),
      "reach_out_candidate",
      Math.round(4 + candidate.priority * 5),
    );
    memoryWrites += 1;
    stagedReachOut = true;
  }

  if (reflection.goalCandidates.length > 0 && config.maxNewGoalsPerRun > 0) {
    const existingGoals = Array.isArray(personality.goals) ? personality.goals : [];
    const merged = dedupeByCaseInsensitive([
      ...existingGoals,
      ...reflection.goalCandidates.slice(0, config.maxNewGoalsPerRun),
    ]).slice(0, 12);

    if (merged.length > existingGoals.length) {
      updatePersonality(personality.id, {
        ...personality,
        goals: merged,
      });
      goalsAdded = merged.length - existingGoals.length;
    }
  }

  if (memoryWrites > 0) {
    pruneMemory(personality.id, 50);
  }

  return { memoryWrites, goalsAdded, stagedReachOut };
}

async function runForPersonality(personality, config) {
  const messages = getRecentChatMessages(personality.id, config.recentMessagesWindow);
  if (messages.length < 2) {
    return {
      personalityId: personality.id,
      personalityName: personality.name,
      skipped: true,
      reason: "insufficient_history",
    };
  }

  const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user");
  const inactivityHours = hoursSince(lastUserMessage?.createdAt || "");

  const memoryQuery = String(lastUserMessage?.content || personality.description || personality.name);
  const memoryFacts = await getRelevantPersonalityMemory(
    personality.id,
    memoryQuery,
    config.memoryContextLimit,
  );

  // Autonomous decision: SILENT/THINK/REACH_OUT
  let autonomousDecision = null;
  let userName = "user";
  
  if (config.autonomousDecisionEnabled) {
    try {
      autonomousDecision = await makeAutonomousDecision({ 
        personality, 
        messages, 
        memoryFacts, 
        inactivityHours, 
        config 
      });
      userName = autonomousDecision.userName || "user";
      
      if (autonomousDecision.decision === 'SILENT') {
        return {
          personalityId: personality.id,
          personalityName: personality.name,
          skipped: true,
          reason: "autonomous_silent",
          autonomousDecision: autonomousDecision.decision,
        };
      }
    } catch (error) {
      console.warn("[CognitionLoop] Autonomous decision failed, falling back to standard reflection:", error?.message || error);
      autonomousDecision = null;
    }
  }

  // Score any pending delivery feedback before building the reflection prompt
  await scorePendingFeedback(personality.id, messages);

  const feedbackRows = getPersonalityMemoryByType(personality.id, "reach_out_feedback", 6, {
    enabledOnly: false,
  });
  const feedbackSnapshot = buildFeedbackSnapshot(feedbackRows);

  const promptMessages = buildReflectionMessages({ personality, messages, memoryFacts, feedbackSnapshot, config, userName });
  const raw = await generateChatCompletion(promptMessages);
  const reflection = sanitizeReflectionOutput(raw);

  // If autonomous decision was THINK, skip reach-out candidate generation
  if (autonomousDecision?.decision === 'THINK') {
    reflection.reachOut.shouldReachOut = false;
    reflection.reachOut.draft = "";
  }

  const persist = await persistReflection({
    personality,
    reflection,
    config,
    inactivityHours,
  });
  const heldGrudges = settleIdleGrudges(personality, reflection.privateThoughts);

  const delivery = await evaluateDeliveryPolicy({
    personalityId: personality.id,
    config,
    inactivityHours,
    messages,
  });

  return {
    personalityId: personality.id,
    personalityName: personality.name,
    skipped: false,
    inactivityHours,
    autonomousDecision: autonomousDecision?.decision || null,
    userName,
    thoughts: reflection.privateThoughts.length,
    openLoops: reflection.openLoops.length,
    goalCandidates: reflection.goalCandidates.length,
    reachOutCandidate: persist.stagedReachOut,
    deliveredReachOut: Boolean(delivery.delivered),
    deliveryReason: delivery.reason,
    memoryWrites: persist.memoryWrites,
    goalsAdded: persist.goalsAdded,
    heldGrudges,
  };
}

function getTargetPersonalities(all, config) {
  const sorted = [...all]
    .sort((left, right) => {
      const leftId = Number(left.id) || 0;
      const rightId = Number(right.id) || 0;
      return leftId - rightId;
    })
    .slice(0, config.maxPersonalitiesPerRun);

  return sorted;
}

function scheduleNextRun() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  const config = getCognitionLoopConfig();
  if (!config.enabled) {
    runtime.nextRunAt = "";
    return;
  }

  const delayMs = Math.max(60_000, Math.round(config.intervalMinutes * 60_000));
  runtime.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  loopTimer = setTimeout(() => {
    runCognitionLoopOnce({ reason: "interval" }).catch((error) => {
      console.warn("[CognitionLoop] interval run failed:", error?.message || error);
    });
  }, delayMs);
}

export function getCognitionLoopStatus() {
  return {
    ...runtime,
    config: getCognitionLoopConfig(),
  };
}

export async function runCognitionLoopOnce({ reason = "manual" } = {}) {
  const config = getCognitionLoopConfig();

  if (!config.enabled && reason !== "manual") {
    scheduleNextRun();
    return {
      ok: true,
      reason,
      skipped: true,
      skipReason: "disabled",
      processed: 0,
      personalities: [],
    };
  }

  if (runtime.running) {
    return {
      ok: false,
      reason,
      skipped: true,
      skipReason: "already_running",
    };
  }

  const startedAt = Date.now();
  runtime.running = true;
  runtime.lastError = "";

  try {
    if (!isLlmConfigured()) {
      const summary = {
        ok: true,
        reason,
        skipped: true,
        skipReason: "llm_not_configured",
        processed: 0,
        personalities: [],
      };
      runtime.lastSummary = summary;
      runtime.lastRunAt = new Date().toISOString();
      runtime.lastDurationMs = Date.now() - startedAt;
      return summary;
    }

    const personalities = getTargetPersonalities(getAllPersonalities(), config);
    const results = [];

    for (const personality of personalities) {
      try {
        const result = await runForPersonality(personality, config);
        results.push(result);
      } catch (error) {
        results.push({
          personalityId: personality.id,
          personalityName: personality.name,
          skipped: true,
          reason: "error",
          error: String(error?.message || error || "unknown"),
        });
      }
    }

    const summary = {
      ok: true,
      reason,
      skipped: false,
      processed: results.length,
      reflections: results.filter((item) => !item.skipped).length,
      memoryWrites: results.reduce((total, item) => total + Number(item.memoryWrites || 0), 0),
      goalsAdded: results.reduce((total, item) => total + Number(item.goalsAdded || 0), 0),
      reachOutCandidates: results.filter((item) => Boolean(item.reachOutCandidate)).length,
      deliveredReachOut: results.filter((item) => Boolean(item.deliveredReachOut)).length,
      personalities: results,
    };

    runtime.loopCount += 1;
    runtime.lastRunAt = new Date().toISOString();
    runtime.lastDurationMs = Date.now() - startedAt;
    runtime.lastSummary = summary;

    return summary;
  } catch (error) {
    runtime.lastRunAt = new Date().toISOString();
    runtime.lastDurationMs = Date.now() - startedAt;
    runtime.lastError = String(error?.message || error || "unknown");
    throw error;
  } finally {
    runtime.running = false;
    scheduleNextRun();
  }
}

export function startCognitionLoop() {
  if (runtime.started) {
    scheduleNextRun();
    return getCognitionLoopStatus();
  }

  runtime.started = true;
  runtime.startedAtMs = Date.now();
  runtime.startedAt = new Date(runtime.startedAtMs).toISOString();
  scheduleNextRun();
  return getCognitionLoopStatus();
}

export function stopCognitionLoop() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  runtime.started = false;
  runtime.running = false;
  runtime.nextRunAt = "";
  runtime.startedAtMs = 0;
  runtime.startedAt = "";

  return getCognitionLoopStatus();
}

export function refreshCognitionLoopSchedule() {
  scheduleNextRun();
  return getCognitionLoopStatus();
}

export function resetCognitionLoopRuntimeForTests() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  runtime.started = false;
  runtime.running = false;
  runtime.loopCount = 0;
  runtime.lastRunAt = "";
  runtime.lastDurationMs = 0;
  runtime.lastError = "";
  runtime.lastSummary = null;
  runtime.nextRunAt = "";
  runtime.startedAt = "";
  runtime.startedAtMs = 0;
  runtime.lastDeliveryAt = "";
  runtime.deliveriesTotal = 0;
}
