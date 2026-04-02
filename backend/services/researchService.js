import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { isLlmConfigured, synthesizeResearchProfile } from "./llmService.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS || 12000);
const TRAIT_LEXICON = [
  "brave",
  "clever",
  "compassionate",
  "confident",
  "cynical",
  "disciplined",
  "empathetic",
  "formal",
  "funny",
  "idealistic",
  "impulsive",
  "inventive",
  "loyal",
  "measured",
  "optimistic",
  "playful",
  "reflective",
  "rebellious",
  "restless",
  "sarcastic",
  "strategic",
  "stoic",
  "witty",
];

function withTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "User-Agent": "Voxis/1.0 (+https://localhost)",
      Accept: "application/json, text/html, text/plain;q=0.9, */*;q=0.8",
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timer));
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function truncate(text, maxLength = 900) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractQuotedPhrases(text) {
  const matches = text.match(/["“]([^"”]{8,120})["”]/g) || [];
  return dedupe(
    matches
      .map((phrase) => phrase.replace(/^["“]|["”]$/g, "").trim())
      .filter((phrase) => phrase.split(" ").length <= 16),
  ).slice(0, 6);
}

function extractSpeechStyle(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const speechSentence = sentences.find((sentence) =>
    /(speak|speaks|speech|voice|tone|delivery|accent|dialogue|phrases|manner)/i.test(sentence),
  );

  if (speechSentence) {
    return truncate(normalizeWhitespace(speechSentence), 220);
  }

  return "";
}

function extractTraits(text) {
  const lowerText = text.toLowerCase();
  return TRAIT_LEXICON.filter((trait) => lowerText.includes(trait)).slice(0, 6);
}

function extractQuirks(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return dedupe(
    sentences
      .filter((sentence) => /(often|tends to|signature|habit|usually|frequently|known for)/i.test(sentence))
      .map((sentence) => truncate(normalizeWhitespace(sentence), 140)),
  ).slice(0, 5);
}

async function fetchWikipediaSummary(query) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) {
    return null;
  }

  try {
    const searchResponse = await withTimeout(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(trimmedQuery)}&format=json`,
    );

    if (!searchResponse.ok) {
      return null;
    }

    const searchData = await searchResponse.json();
    const topResult = searchData?.query?.search?.[0]?.title;
    if (!topResult) {
      return null;
    }

    const summaryResponse = await withTimeout(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topResult.replace(/ /g, "_"))}`,
    );

    if (!summaryResponse.ok) {
      return null;
    }

    const summaryData = await summaryResponse.json();
    const summary = normalizeWhitespace(summaryData?.extract || "");

    if (!summary) {
      return null;
    }

    return {
      url: summaryData?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topResult.replace(/ /g, "_"))}`,
      title: summaryData?.title || topResult,
      text: truncate(summary, 1200),
      sourceType: "wikipedia",
    };
  } catch {
    return null;
  }
}

async function fetchYouTubeMetadata(url) {
  try {
    const oembedResponse = await withTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );

    if (!oembedResponse.ok) {
      return null;
    }

    const data = await oembedResponse.json();
    return {
      url,
      title: data.title || "YouTube video",
      text: truncate(
        normalizeWhitespace(
          `${data.title || ""}. Creator: ${data.author_name || "unknown"}. This is a video source, so treat it as reference context for tone and subject matter.`,
        ),
        320,
      ),
      sourceType: "youtube",
    };
  } catch {
    return null;
  }
}

async function fetchReadablePage(url) {
  try {
    const response = await withTimeout(url);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const metaDescription =
      dom.window.document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      dom.window.document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      "";

    const title =
      article?.title ||
      dom.window.document.querySelector("title")?.textContent ||
      url;

    const text = normalizeWhitespace(article?.textContent || metaDescription || "");
    if (!text) {
      return null;
    }

    return {
      url,
      title: truncate(title, 140),
      text: truncate(text, 1200),
      sourceType: /wikipedia\.org/.test(url) ? "wikipedia" : "web",
    };
  } catch {
    return null;
  }
}

async function fetchSource(url) {
  if (/youtube\.com|youtu\.be/.test(url)) {
    return fetchYouTubeMetadata(url);
  }

  return fetchReadablePage(url);
}

function buildFallbackProfile({ name, description, sourceQuery, sourceUrls, sourceNotes }) {
  const combinedText = normalizeWhitespace(
    [description, ...sourceNotes.map((source) => source.text)].filter(Boolean).join(" "),
  );
  const speechStyle = extractSpeechStyle(combinedText);
  const notablePhrases = extractQuotedPhrases(combinedText);
  const traits = extractTraits(combinedText);
  const quirks = extractQuirks(combinedText);

  const researchSummary = sourceNotes.length
    ? sourceNotes
        .map((source) => `${source.title}: ${truncate(source.text, 220)}`)
        .join("\n\n")
    : "No external sources were fetched. Use the manual description as the primary guide.";

  return {
    name,
    descriptionSuggestion: description || truncate(combinedText, 420),
    traits: traits.length ? traits : ["distinctive", "character-driven"],
    quirks: quirks.length ? quirks : ["speaks in a recognizable cadence"],
    mood: "Focused",
    speechStyle,
    notablePhrases,
    researchSummary,
    sourceQuery,
    sourceUrls,
    sources: sourceNotes,
  };
}

export async function buildResearchProfile({ name, description, sourceQuery, sourceUrls }) {
  const query = String(sourceQuery || name || "").trim();
  const urls = dedupe((sourceUrls || []).map((url) => String(url).trim()));

  const wikipediaSource = await fetchWikipediaSummary(query);
  const remoteSources = await Promise.all(urls.map((url) => fetchSource(url)));
  const sourceNotes = [wikipediaSource, ...remoteSources].filter(Boolean);

  const fallbackProfile = buildFallbackProfile({
    name,
    description,
    sourceQuery: query,
    sourceUrls: dedupe([...(wikipediaSource ? [wikipediaSource.url] : []), ...urls]),
    sourceNotes,
  });

  if (!sourceNotes.length || !isLlmConfigured()) {
    return fallbackProfile;
  }

  try {
    const synthesized = await synthesizeResearchProfile({
      name,
      description,
      sourceQuery: query,
      sourceNotes,
      fallbackProfile,
    });

    return {
      ...fallbackProfile,
      ...synthesized,
      sourceQuery: query,
      sourceUrls: fallbackProfile.sourceUrls,
      sources: sourceNotes,
    };
  } catch {
    return fallbackProfile;
  }
}
