import { getPersonalityById } from "../models/personalityModel.js";
import { getRelevantPersonalityMemory } from "../models/memoryModel.js";
import {
  buildPersonaPromptPackage,
  generateChatCompletionWithMeta,
} from "../services/llmService.js";
import { moodFromLabel, moodToLabel, moodToPromptFragment } from "../services/moodEngine.js";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 16000;
const MAX_EXTRA_CHARS = 24000;
const MEMORY_RETRIEVAL_LIMIT = 5;
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

function hasVad(value) {
  return Boolean(value) && typeof value === "object" && "valence" in value;
}

function resolveMood(personality) {
  const moodState = hasVad(personality.moodState)
    ? personality.moodState
    : moodFromLabel(personality.mood);
  const moodBaseline = hasVad(personality.moodBaseline)
    ? personality.moodBaseline
    : moodFromLabel(personality.mood);
  return {
    moodState,
    moodBaseline,
    moodLabel: moodToLabel(moodState),
  };
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { error: "messages must be a non-empty array." };
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return { error: `messages must contain at most ${MAX_MESSAGES} items.` };
  }

  const messages = [];
  for (const item of rawMessages) {
    const role = String(item?.role || "").trim().toLowerCase();
    const content = String(item?.content ?? "").trim();
    if (!ALLOWED_ROLES.has(role) || !content) {
      return {
        error: "Each message needs a role of system, user, or assistant, and non-empty content.",
      };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return { error: `Message content must be ${MAX_MESSAGE_CHARS} characters or fewer.` };
    }
    messages.push({ role, content });
  }

  return { messages };
}

function normalizeExtraContext(body) {
  const raw = body?.extraContext ?? body?.systemAppend ?? "";
  if (raw != null && typeof raw !== "string") {
    return { error: "extraContext must be a string." };
  }
  const extraContext = String(raw || "").trim();
  if (extraContext.length > MAX_EXTRA_CHARS) {
    return { error: `extraContext must be ${MAX_EXTRA_CHARS} characters or fewer.` };
  }
  return { extraContext };
}

function normalizeTemperature(value) {
  if (value === undefined || value === null || value === "") {
    return { temperature: 0.85 };
  }
  const temperature = Number(value);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { error: "temperature must be a number between 0 and 2." };
  }
  return { temperature };
}

export function buildInternalChatMessages({
  prompt,
  extraContext,
  moodFragment,
  messages,
}) {
  const llmMessages = [{ role: "system", content: prompt }];

  if (extraContext) {
    llmMessages.push({
      role: "system",
      content: [
        "Additional context for this turn. Use it when it does not contradict the personality above.",
        extraContext,
      ].join("\n\n"),
    });
  }

  if (moodFragment) {
    llmMessages.push({ role: "system", content: moodFragment });
  }

  llmMessages.push(...messages);
  return llmMessages;
}

// Non-streaming personality turn for a local orchestrator.
// Reads the current persona, memory, and mood into the prompt.
// Does not write chat history or step mood, so a council fanout
// does not land in the user's conversation log.
export async function internalChatHandler(req, res, next) {
  try {
    const personalityId = Number(req.body?.personalityId);
    if (!Number.isInteger(personalityId) || personalityId <= 0) {
      return res.status(400).json({ error: "A valid personalityId is required." });
    }

    const personality = getPersonalityById(personalityId);
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const normalizedMessages = normalizeMessages(req.body?.messages);
    if (normalizedMessages.error) {
      return res.status(400).json({ error: normalizedMessages.error });
    }

    const normalizedExtra = normalizeExtraContext(req.body);
    if (normalizedExtra.error) {
      return res.status(400).json({ error: normalizedExtra.error });
    }

    const normalizedTemperature = normalizeTemperature(req.body?.temperature);
    if (normalizedTemperature.error) {
      return res.status(400).json({ error: normalizedTemperature.error });
    }

    const { messages } = normalizedMessages;
    const { extraContext } = normalizedExtra;
    const queryText = [...messages].reverse().find((message) => message.role === "user")?.content
      || messages[messages.length - 1].content;

    let memoryFacts = [];
    try {
      memoryFacts = await getRelevantPersonalityMemory(
        personalityId,
        queryText,
        MEMORY_RETRIEVAL_LIMIT,
      );
    } catch (error) {
      console.warn("[internal-chat] memory retrieval skipped", {
        message: String(error?.message || error),
      });
    }

    const { moodState, moodBaseline, moodLabel } = resolveMood(personality);
    const promptPackage = buildPersonaPromptPackage(personality, memoryFacts, queryText, {
      currentMoodLabel: moodLabel,
      conversationKey: `internal:${personalityId}`,
      userName: "",
    });

    const llmMessages = buildInternalChatMessages({
      prompt: promptPackage.prompt,
      extraContext,
      moodFragment: moodToPromptFragment(moodState, moodBaseline),
      messages,
    });

    const generation = await generateChatCompletionWithMeta(llmMessages, {
      temperature: normalizedTemperature.temperature,
    });
    const text = String(generation?.reply || "").trim();
    if (!text) {
      return res.status(502).json({ error: "The model returned an empty reply." });
    }

    return res.json({
      text,
      personalityId: personality.id,
      personalityName: personality.name,
      model: generation.model || null,
      usage: generation.usage || null,
    });
  } catch (error) {
    const status = Number(error?.statusCode || error?.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return res.status(status).json({
        error: error.message || "Internal chat failed.",
      });
    }
    return next(error);
  }
}
