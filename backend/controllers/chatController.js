import { getPersonalityById } from "../models/personalityModel.js";
import { createChatMessage, getChatMessages, getRecentChatMessages } from "../models/chatModel.js";
import { generateChatCompletion } from "../services/llmService.js";

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

    const history = getRecentChatMessages(personalityId, 10).map((messageEntry) => ({
      role: messageEntry.role,
      content: messageEntry.content,
    }));
    const messages = [
      {
        role: "system",
        content: personality.systemPrompt,
      },
      ...history,
      {
        role: "user",
        content: message,
      },
    ];

    const reply = await generateChatCompletion(messages);

    createChatMessage({ personalityId, role: "user", content: message });
    createChatMessage({ personalityId, role: "assistant", content: reply });

    return res.json({ reply });
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
