const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

function getLlmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    apiKey: process.env.LLM_API_KEY || "",
  };
}

export function isLlmConfigured() {
  const { baseUrl, apiKey } = getLlmConfig();
  return Boolean(apiKey) || baseUrl !== DEFAULT_BASE_URL;
}

async function requestChatCompletion({ messages, temperature = 0.85 }) {
  const { baseUrl, model, apiKey } = getLlmConfig();

  if (!apiKey && baseUrl === DEFAULT_BASE_URL) {
    const error = new Error(
      "LLM_API_KEY is missing. Copy backend/.env.example to backend/.env and provide an API key or a custom OpenAI-compatible base URL.",
    );
    error.statusCode = 500;
    throw error;
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`LLM request failed with ${response.status}: ${errorText}`);
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("LLM response did not include any message content.");
    error.statusCode = 502;
    throw error;
  }

  return content.trim();
}

function extractJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Model did not return a JSON object.");
  }

  return JSON.parse(match[0]);
}

export async function generateChatCompletion(messages) {
  return requestChatCompletion({ messages, temperature: 0.85 });
}

export async function synthesizeResearchProfile({
  name,
  description,
  sourceQuery,
  sourceNotes,
  fallbackProfile,
}) {
  const prompt = [
    `Character: ${name || sourceQuery}`,
    description ? `Manual description: ${description}` : "Manual description: none provided",
    "Source notes:",
    ...sourceNotes.map(
      (source, index) =>
        `${index + 1}. ${source.title} (${source.url})\n${source.text}`,
    ),
    "Return a JSON object with these keys only:",
    "descriptionSuggestion, traits, quirks, mood, speechStyle, notablePhrases, researchSummary",
    "traits, quirks, and notablePhrases must be arrays of short strings.",
    "Keep researchSummary under 900 characters and grounded in the sources.",
    `Fallback profile for style reference: ${JSON.stringify(fallbackProfile)}`,
  ].join("\n\n");

  const responseText = await requestChatCompletion({
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You transform scraped reference material into a concise, structured character profile. Respond with JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const parsed = extractJsonObject(responseText);

  return {
    descriptionSuggestion: String(parsed.descriptionSuggestion || fallbackProfile.descriptionSuggestion || "").trim(),
    traits: Array.isArray(parsed.traits)
      ? parsed.traits.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : fallbackProfile.traits,
    quirks: Array.isArray(parsed.quirks)
      ? parsed.quirks.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : fallbackProfile.quirks,
    mood: String(parsed.mood || fallbackProfile.mood || "Focused").trim(),
    speechStyle: String(parsed.speechStyle || fallbackProfile.speechStyle || "").trim(),
    notablePhrases: Array.isArray(parsed.notablePhrases)
      ? parsed.notablePhrases.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : fallbackProfile.notablePhrases,
    researchSummary: String(parsed.researchSummary || fallbackProfile.researchSummary || "").trim(),
  };
}
