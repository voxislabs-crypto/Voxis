import { getUserById, getUserProfile } from "../models/userModel.js";

const VALID_MODES = new Set(["kids", "scientist"]);
const VALID_PERFORMANCE_TIERS = new Set(["light", "balanced", "full"]);

function normalizeMode(value, fallback = "scientist") {
  const mode = String(value || fallback).trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : fallback;
}

function normalizePerformanceTier(value, fallback = "balanced") {
  const tier = String(value || fallback).trim().toLowerCase();
  return VALID_PERFORMANCE_TIERS.has(tier) ? tier : fallback;
}

function selectDefaultMode({ ageBand, profile }) {
  if (ageBand === "child") {
    return "kids";
  }

  if (ageBand === "teen") {
    return profile?.supervisedAdvancedMode ? normalizeMode(profile?.defaultMode, "kids") : "kids";
  }

  return normalizeMode(profile?.defaultMode, "scientist");
}

function canUseMode({ ageBand, profile, mode }) {
  if (ageBand === "child") {
    return mode === "kids";
  }

  if (ageBand === "teen") {
    if (mode === "kids") {
      return true;
    }

    return Boolean(profile?.supervisedAdvancedMode);
  }

  return mode === "kids" || mode === "scientist";
}

function resolveSafetyTier(ageBand, profile) {
  if (ageBand === "child") {
    return "child_strict";
  }

  if (ageBand === "teen") {
    return profile?.safetyTier || "teen_guarded";
  }

  return profile?.safetyTier || "standard";
}

function isCitationRequired(activeMode) {
  if (activeMode !== "scientist") {
    return false;
  }

  return process.env.RESEARCH_CITATION_REQUIRED !== "false";
}

function resolvePerformanceTier(ageBand, profile, activeMode) {
  if (ageBand === "child") {
    return "light";
  }
  const fallback = activeMode === "kids" ? "light" : "balanced";
  return normalizePerformanceTier(profile?.performanceTier, fallback);
}

export function resolvePolicyContext({ userId, requestedMode }) {
  const parsedUserId = Number(userId);
  const user = Number.isInteger(parsedUserId) ? getUserById(parsedUserId) : null;

  if (!user) {
    return {
      user: null,
      profile: null,
      policy: {
        userId: null,
        ageBand: "child",
        activeMode: "kids",
        defaultMode: "kids",
        safetyTier: "child_strict",
        performanceTier: "light",
        voiceNarrationEnabled: false,
        citationRequired: false,
        modeRequested: Boolean(requestedMode),
        modeAccepted: false,
        modeReason: "fail_closed_missing_or_invalid_user",
      },
    };
  }

  const profile = getUserProfile(user.id);
  const defaultMode = selectDefaultMode({ ageBand: user.ageBand, profile });
  const normalizedRequestedMode = requestedMode ? normalizeMode(requestedMode, defaultMode) : defaultMode;
  const accepted = canUseMode({ ageBand: user.ageBand, profile, mode: normalizedRequestedMode });
  const activeMode = accepted ? normalizedRequestedMode : defaultMode;

  return {
    user,
    profile,
    policy: {
      userId: user.id,
      ageBand: user.ageBand,
      activeMode,
      defaultMode,
      safetyTier: resolveSafetyTier(user.ageBand, profile),
      performanceTier: resolvePerformanceTier(user.ageBand, profile, activeMode),
      voiceNarrationEnabled: Boolean(profile?.voiceNarrationEnabled),
      citationRequired: isCitationRequired(activeMode),
      modeRequested: Boolean(requestedMode),
      modeAccepted: accepted,
      modeReason: accepted ? "requested_or_default" : "restricted_by_age_policy",
    },
  };
}

export function buildModePolicyPrompt(policy) {
  if (policy.activeMode === "kids") {
    return [
      "== MODE POLICY: KIDS ==",
      "Respond in child-safe language with short, clear sentences.",
      "Avoid mature, sexual, graphic, extremist, and self-harm content.",
      "If asked for unsafe content, refuse briefly and redirect to a safe alternative activity.",
      "Do not provide dangerous instructions.",
    ].join("\n");
  }

  return [
    "== MODE POLICY: SCIENTIST ==",
    "Prioritize evidence-grounded reasoning and identify uncertainty explicitly.",
    "Distinguish observations, assumptions, and speculation.",
    "When sources are unavailable, state that limitation clearly.",
  ].join("\n");
}

export function buildScientistEvidencePrompt(policy, personality, { enforceStructure = true } = {}) {
  if (policy.activeMode !== "scientist") {
    return "";
  }

  const researchSources = Array.isArray(personality?.researchSources)
    ? personality.researchSources
        .filter((source) => source && typeof source === "object")
        .slice(0, 8)
    : [];

  const sourceLines = researchSources.length
    ? researchSources
        .map((source, index) => {
          const title = String(source.title || "Untitled source").trim();
          const url = String(source.url || "").trim();
          return `- [S${index + 1}] ${title}${url ? ` (${url})` : ""}`;
        })
        .join("\n")
    : "- No research sources attached to this personality.";

  const citationInstruction = policy.citationRequired
    ? enforceStructure
      ? "Citations are required: reference supporting sources as [S#] in the answer and evidence sections."
      : "When making factual claims, cite supporting sources as [S#] where applicable."
    : "Include citations when useful, but they are optional in this mode.";

  if (!enforceStructure) {
    return [
      "== SCIENTIST EVIDENCE GUIDANCE ==",
      "Keep the character's natural voice and cadence primary.",
      "Use evidence-grounded reasoning only where factual claims are made.",
      citationInstruction,
      "If evidence is unavailable, state that limitation briefly without breaking character.",
      "Available sources:",
      sourceLines,
    ].join("\n");
  }

  return [
    "== SCIENTIST OUTPUT CONTRACT ==",
    "Use this response shape:\n1) Answer\n2) Evidence\n3) Uncertainty\n4) Next Questions",
    citationInstruction,
    "If no applicable evidence exists, explicitly say evidence is unavailable.",
    "Available sources:",
    sourceLines,
  ].join("\n");
}
