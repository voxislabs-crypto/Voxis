import { getPersonalityById } from "../models/personalityModel.js";
import { getMemoryFactById } from "../models/memoryModel.js";
import { getPersonaPreferenceById } from "../models/preferencesModel.js";

function envFlag(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function getAuthenticatedActor(req) {
  const localUserId = Number(req?.voxisUser?.id);
  if (!Number.isInteger(localUserId) || localUserId <= 0) {
    return null;
  }

  return {
    localUserId,
    clerkUserId: String(req?.clerkUserId || "").trim(),
  };
}

export function isAdminActor(req) {
  // Local mode is an explicit development opt-in. Production never falls back
  // to treating every signed-in account as an administrator.
  if (envFlag("VOXIS_LOCAL") || envFlag("ALLOW_MISSING_CLERK_KEYS")) {
    return Boolean(getAuthenticatedActor(req));
  }

  const adminIds = String(process.env.ADMIN_CLERK_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return adminIds.includes(String(req?.clerkUserId || "").trim());
}

export function requireSelfOrAdmin(paramName = "id") {
  return (req, res, next) => {
    const actor = getAuthenticatedActor(req);
    const requestedUserId = Number(req.params?.[paramName]);

    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
      return res.status(400).json({ error: "A valid user id is required." });
    }
    if (actor.localUserId === requestedUserId || isAdminActor(req)) {
      return next();
    }

    // Do not disclose whether another local user exists.
    return res.status(404).json({ error: "User not found." });
  };
}

export function resolveOwnedPersona(req, res, rawPersonalityId) {
  const actor = getAuthenticatedActor(req);
  const personalityId = Number(rawPersonalityId);

  if (!actor) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  if (!Number.isInteger(personalityId) || personalityId <= 0) {
    res.status(400).json({ error: "A valid personality id is required." });
    return null;
  }

  const personality = getPersonalityById(personalityId, actor.localUserId);
  if (!personality) {
    // Owner-only access is the Phase 1 policy. Future grants belong in the
    // relationship/application-access model, not in this helper.
    res.status(404).json({ error: "Personality not found." });
    return null;
  }

  return personality;
}

export function resolveOwnedMemory(req, res, rawMemoryId) {
  const memoryId = Number(rawMemoryId);
  if (!Number.isInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ error: "Invalid memory id." });
    return null;
  }
  const memory = getMemoryFactById(memoryId);
  if (!memory) {
    res.status(404).json({ error: "Memory fact not found." });
    return null;
  }
  const personality = resolveOwnedPersona(req, res, memory.personalityId);
  return personality ? { memory, personality } : null;
}

export function resolveOwnedPreference(req, res, rawPreferenceId) {
  const preferenceId = Number(rawPreferenceId);
  if (!Number.isInteger(preferenceId) || preferenceId <= 0) {
    res.status(400).json({ error: "Invalid preference id." });
    return null;
  }
  const preference = getPersonaPreferenceById(preferenceId);
  if (!preference) {
    res.status(404).json({ error: "Preference not found." });
    return null;
  }
  const personality = resolveOwnedPersona(req, res, preference.personalityId);
  return personality ? { preference, personality } : null;
}
