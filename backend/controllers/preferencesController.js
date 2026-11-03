import {
  getPersonaPreferences,
  upsertPersonaPreference,
  updatePersonaPreference,
  deletePersonaPreference,
  PREF_TYPES,
} from "../models/preferencesModel.js";
import { resolveOwnedPersona, resolveOwnedPreference } from "../gatekeeper/authorization.js";

// ---------------------------------------------------------------------------
// GET /personality/:id/preferences
// ---------------------------------------------------------------------------
export function listPersonaPreferencesHandler(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid personality id." });

  if (!resolveOwnedPersona(req, res, id)) return;

  return res.json(getPersonaPreferences(id));
}

// ---------------------------------------------------------------------------
// POST /personality/:id/preferences
// Body: { prefType, content, importance?, source? }
// ---------------------------------------------------------------------------
export function createPersonaPreferenceHandler(req, res) {
  const personalityId = parseInt(req.params.id, 10);
  if (!personalityId) return res.status(400).json({ error: "Invalid personality id." });

  if (!resolveOwnedPersona(req, res, personalityId)) return;

  const { prefType, content, importance, source } = req.body;

  if (!PREF_TYPES.has(prefType)) {
    return res.status(400).json({
      error: `prefType must be one of: ${[...PREF_TYPES].join(", ")}`,
    });
  }

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required." });
  }

  const safeImportance = importance !== undefined
    ? Math.min(10, Math.max(1, parseInt(importance, 10) || 7))
    : 7;

  const id = upsertPersonaPreference(
    personalityId,
    prefType,
    content.trim(),
    safeImportance,
    source === "explicit" ? "explicit" : "learned",
  );

  return res.status(201).json({ ok: true, id });
}

// ---------------------------------------------------------------------------
// PUT /personality-preference/:prefId
// Body: { prefType?, content?, importance? }
// ---------------------------------------------------------------------------
export function updatePersonaPreferenceHandler(req, res) {
  const prefId = parseInt(req.params.prefId, 10);
  if (!prefId) return res.status(400).json({ error: "Invalid preference id." });
  if (!resolveOwnedPreference(req, res, prefId)) return;

  const { prefType, content, importance } = req.body;

  if (prefType && !PREF_TYPES.has(prefType)) {
    return res.status(400).json({
      error: `prefType must be one of: ${[...PREF_TYPES].join(", ")}`,
    });
  }

  const updated = updatePersonaPreference(prefId, { prefType, content, importance });
  if (!updated) return res.status(404).json({ error: "Preference not found." });

  return res.json(updated);
}

// ---------------------------------------------------------------------------
// DELETE /personality-preference/:prefId
// ---------------------------------------------------------------------------
export function deletePersonaPreferenceHandler(req, res) {
  const prefId = parseInt(req.params.prefId, 10);
  if (!prefId) return res.status(400).json({ error: "Invalid preference id." });
  if (!resolveOwnedPreference(req, res, prefId)) return;

  deletePersonaPreference(prefId);
  return res.json({ ok: true });
}
