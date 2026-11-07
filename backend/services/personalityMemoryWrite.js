import { pruneMemory, upsertMemoryFactWithEmbedding } from "../models/memoryModel.js";
import { extractMemoryFacts } from "./llmService.js";

export const PERSONALITY_MEMORY_LIMIT = 50;

// Same personality-memory write the text chat uses after a reply.
// Callers keep user-memory extraction, preference extraction, residual notes,
// and micro-variation on their own paths.
export async function writeExtractedPersonalityMemories({
  personality,
  personalityId,
  userMessage,
  assistantReply,
  existingFacts = [],
  memoryLimit = PERSONALITY_MEMORY_LIMIT,
}) {
  const newFacts = await extractMemoryFacts({
    personality,
    recentMessages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantReply },
    ],
    existingFacts,
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
    pruneMemory(personalityId, memoryLimit);
  }

  return newFacts;
}
