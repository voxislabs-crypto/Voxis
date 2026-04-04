import { describe, expect, it } from "vitest";

import {
  buildRateLimitFallbackReply,
  buildRateLimitRetryMessages,
  isRateLimitError,
  sanitizeRateLimitedMessage,
} from "../services/rateLimitRecoveryService.js";

describe("rateLimitRecoveryService", () => {
  it("detects provider 429 errors", () => {
    expect(isRateLimitError({ isRateLimit: true })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ providerStatus: 429 })).toBe(true);
    expect(isRateLimitError({ message: "LLM request failed with 429: rate limit" })).toBe(true);
    expect(isRateLimitError({ statusCode: 502, message: "Bad gateway" })).toBe(false);
  });

  it("sanitizes and shortens long messages", () => {
    const input = `Here is a very long request with code. \`const a = 1;\` ${"More detail. ".repeat(40)}`;
    const output = sanitizeRateLimitedMessage(input, 160);

    expect(output.length).toBeLessThanOrEqual(160);
    expect(output).not.toContain("const a = 1;");
    expect(output.endsWith("...")).toBe(true);
  });

  it("builds a minimal retry prompt with shortened user content", () => {
    const messages = buildRateLimitRetryMessages({
      compactSystemPrompt: "You are concise.",
      policyPrompt: "Stay safe.",
      moodFragment: "Current mood: neutral.",
      history: [
        { role: "user", content: "Older turn" },
        { role: "assistant", content: "Older reply" },
        { role: "user", content: "Newest turn" },
      ],
      sanitizedUserMessage: "Shortened request",
    });

    expect(messages[0]).toEqual({ role: "system", content: "You are concise." });
    expect(messages[messages.length - 1].content).toContain("Shortened request");
    expect(messages.some((message) => message.content.includes("Rate-limit recovery mode"))).toBe(true);
  });

  it("builds a friendly fallback reply", () => {
    const reply = buildRateLimitFallbackReply({ sanitizedUserMessage: "Tell me the short version" });

    expect(reply).toContain("temporary rate limit");
    expect(reply).toContain("Tell me the short version");
    expect(reply).toContain("Please retry");
  });
});