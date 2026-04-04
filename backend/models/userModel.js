import db from "../db/db.js";

const VALID_AGE_BANDS = new Set(["child", "teen", "adult"]);
const VALID_MODES = new Set(["kids", "scientist"]);
const VALID_PERFORMANCE_TIERS = new Set(["light", "balanced", "full"]);

function toBooleanFlag(value) {
  return value ? 1 : 0;
}

function fromBooleanFlag(value) {
  return Boolean(value);
}

function normalizeAgeBand(value) {
  const ageBand = String(value || "adult").trim().toLowerCase();
  return VALID_AGE_BANDS.has(ageBand) ? ageBand : "adult";
}

function normalizeMode(value, fallback = "scientist") {
  const mode = String(value || fallback).trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : fallback;
}

function normalizePerformanceTier(value, fallback = "balanced") {
  const tier = String(value || fallback).trim().toLowerCase();
  return VALID_PERFORMANCE_TIERS.has(tier) ? tier : fallback;
}

function normalizeUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.displayName,
    ageBand: normalizeAgeBand(row.ageBand),
    locale: row.locale || "en-US",
    clerkId: row.clerkId || "",
    createdAt: row.createdAt,
  };
}

function normalizeProfileRow(row) {
  if (!row) {
    return null;
  }

  const defaultMode = normalizeMode(row.defaultMode);
  const defaultPerformanceTier = defaultMode === "kids" ? "light" : "balanced";

  return {
    userId: row.userId,
    defaultMode,
    safetyTier: String(row.safetyTier || "standard").trim() || "standard",
    performanceTier: normalizePerformanceTier(row.performanceTier, defaultPerformanceTier),
    voiceNarrationEnabled: fromBooleanFlag(row.voiceNarrationEnabled),
    supervisedAdvancedMode: fromBooleanFlag(row.supervisedAdvancedMode),
    parentEmailOptional: String(row.parentEmailOptional || "").trim(),
    parentalConsentRequired: fromBooleanFlag(row.parentalConsentRequired),
    parentalConsentVerifiedAt: String(row.parentalConsentVerifiedAt || ""),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function ensureUserProfile(userId) {
  db.prepare(
    `
      INSERT OR IGNORE INTO user_profiles (
        userId,
        defaultMode,
        safetyTier,
        performanceTier,
        voiceNarrationEnabled,
        supervisedAdvancedMode,
        parentEmailOptional,
        parentalConsentRequired,
        parentalConsentVerifiedAt
      ) VALUES (?, 'scientist', 'standard', 'light', 0, 0, '', 0, '')
    `,
  ).run(userId);
}

export function listUsers() {
  const rows = db
    .prepare(
      `
        SELECT id, displayName, ageBand, locale, clerkId, createdAt
        FROM users
        ORDER BY id DESC
      `,
    )
    .all();

  return rows.map(normalizeUserRow);
}

export function getUserById(userId) {
  const row = db
    .prepare(
      `
        SELECT id, displayName, ageBand, locale, clerkId, createdAt
        FROM users
        WHERE id = ?
      `,
    )
    .get(userId);

  return normalizeUserRow(row);
}

export function getUserByClerkId(clerkId) {
  const row = db
    .prepare(
      `
        SELECT id, displayName, ageBand, locale, clerkId, createdAt
        FROM users
        WHERE clerkId = ?
      `,
    )
    .get(String(clerkId || ""));

  return normalizeUserRow(row);
}

export function createUser(input) {
  const displayName = String(input?.displayName || "Guest").trim() || "Guest";
  const ageBand = normalizeAgeBand(input?.ageBand);
  const locale = String(input?.locale || "en-US").trim() || "en-US";
  const defaultMode = normalizeMode(input?.defaultMode, ageBand === "adult" ? "scientist" : "kids");
  const safetyTier = String(input?.safetyTier || (ageBand === "child" ? "child_strict" : "standard")).trim();
  const performanceTier = normalizePerformanceTier(
    input?.performanceTier,
    defaultMode === "kids" ? "light" : "balanced",
  );
  const voiceNarrationEnabled =
    input?.voiceNarrationEnabled === undefined ? ageBand === "child" : Boolean(input?.voiceNarrationEnabled);

  const clerkId = String(input?.clerkId || "").trim();

  const result = db
    .prepare(
      `
        INSERT INTO users (displayName, ageBand, locale, clerkId)
        VALUES (?, ?, ?, ?)
      `,
    )
    .run(displayName, ageBand, locale, clerkId);

  const userId = Number(result.lastInsertRowid);

  db.prepare(
    `
      INSERT OR REPLACE INTO user_profiles (
        userId,
        defaultMode,
        safetyTier,
        performanceTier,
        voiceNarrationEnabled,
        supervisedAdvancedMode,
        parentEmailOptional,
        parentalConsentRequired,
        parentalConsentVerifiedAt,
        createdAt,
        updatedAt
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        COALESCE((SELECT createdAt FROM user_profiles WHERE userId = ?), CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      )
    `,
  ).run(
    userId,
    defaultMode,
    safetyTier || "standard",
    performanceTier,
    toBooleanFlag(voiceNarrationEnabled),
    toBooleanFlag(Boolean(input?.supervisedAdvancedMode)),
    String(input?.parentEmailOptional || "").trim(),
    toBooleanFlag(Boolean(input?.parentalConsentRequired || ageBand !== "adult")),
    String(input?.parentalConsentVerifiedAt || "").trim(),
    userId,
  );

  return {
    user: getUserById(userId),
    profile: getUserProfile(userId),
  };
}

export function getUserProfile(userId) {
  ensureUserProfile(userId);

  const row = db
    .prepare(
      `
        SELECT
          userId,
          defaultMode,
          safetyTier,
          performanceTier,
          voiceNarrationEnabled,
          supervisedAdvancedMode,
          parentEmailOptional,
          parentalConsentRequired,
          parentalConsentVerifiedAt,
          createdAt,
          updatedAt
        FROM user_profiles
        WHERE userId = ?
      `,
    )
    .get(userId);

  return normalizeProfileRow(row);
}

export function updateUserProfile(userId, input) {
  ensureUserProfile(userId);
  const current = getUserProfile(userId);
  const user = getUserById(userId);

  const nextDefaultMode = normalizeMode(input?.defaultMode, current?.defaultMode || "scientist");
  const nextSafetyTier = String(input?.safetyTier || current?.safetyTier || "standard").trim() || "standard";
  const nextPerformanceTier =
    input?.performanceTier === undefined
      ? normalizePerformanceTier(
          current?.performanceTier,
          nextDefaultMode === "kids" || user?.ageBand === "child" ? "light" : "balanced",
        )
      : normalizePerformanceTier(
          input?.performanceTier,
          nextDefaultMode === "kids" || user?.ageBand === "child" ? "light" : "balanced",
        );
  const nextVoiceNarrationEnabled =
    input?.voiceNarrationEnabled === undefined
      ? current?.voiceNarrationEnabled ?? user?.ageBand === "child"
      : Boolean(input?.voiceNarrationEnabled);
  const nextSupervisedAdvancedMode =
    input?.supervisedAdvancedMode === undefined
      ? current?.supervisedAdvancedMode
      : Boolean(input?.supervisedAdvancedMode);
  const nextParentEmail =
    input?.parentEmailOptional === undefined
      ? current?.parentEmailOptional
      : String(input?.parentEmailOptional || "").trim();
  const nextParentalConsentRequired =
    input?.parentalConsentRequired === undefined
      ? current?.parentalConsentRequired
      : Boolean(input?.parentalConsentRequired);
  const nextParentalConsentVerifiedAt =
    input?.parentalConsentVerifiedAt === undefined
      ? current?.parentalConsentVerifiedAt
      : String(input?.parentalConsentVerifiedAt || "").trim();

  db.prepare(
    `
      UPDATE user_profiles
      SET
        defaultMode = ?,
        safetyTier = ?,
        performanceTier = ?,
        voiceNarrationEnabled = ?,
        supervisedAdvancedMode = ?,
        parentEmailOptional = ?,
        parentalConsentRequired = ?,
        parentalConsentVerifiedAt = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE userId = ?
    `,
  ).run(
    nextDefaultMode,
    nextSafetyTier,
    nextPerformanceTier,
    toBooleanFlag(nextVoiceNarrationEnabled),
    toBooleanFlag(nextSupervisedAdvancedMode),
    nextParentEmail,
    toBooleanFlag(nextParentalConsentRequired),
    nextParentalConsentVerifiedAt,
    userId,
  );

  return getUserProfile(userId);
}
