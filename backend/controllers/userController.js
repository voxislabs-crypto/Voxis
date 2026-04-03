import {
  createUser,
  getUserById,
  getUserProfile,
  listUsers,
  updateUserProfile,
} from "../models/userModel.js";

function sanitizeAgeBand(value) {
  const normalized = String(value || "adult").trim().toLowerCase();
  return ["child", "teen", "adult"].includes(normalized) ? normalized : "adult";
}

function sanitizeMode(value, fallback = "scientist") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["kids", "scientist"].includes(normalized) ? normalized : fallback;
}

export function listUsersHandler(_req, res, next) {
  try {
    return res.json({ users: listUsers() });
  } catch (error) {
    return next(error);
  }
}

export function createUserHandler(req, res, next) {
  try {
    const displayName = String(req.body?.displayName || "Guest").trim() || "Guest";
    const ageBand = sanitizeAgeBand(req.body?.ageBand);
    const locale = String(req.body?.locale || "en-US").trim() || "en-US";
    const defaultMode = sanitizeMode(
      req.body?.defaultMode,
      ageBand === "adult" ? "scientist" : "kids",
    );

    const created = createUser({
      displayName,
      ageBand,
      locale,
      defaultMode,
      safetyTier: req.body?.safetyTier,
      supervisedAdvancedMode: Boolean(req.body?.supervisedAdvancedMode),
      parentEmailOptional: req.body?.parentEmailOptional,
      parentalConsentRequired:
        req.body?.parentalConsentRequired === undefined
          ? ageBand !== "adult"
          : Boolean(req.body?.parentalConsentRequired),
      parentalConsentVerifiedAt: req.body?.parentalConsentVerifiedAt,
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
}

export function getUserProfileHandler(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "A valid user id is required." });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const profile = getUserProfile(userId);
    return res.json({ user, profile });
  } catch (error) {
    return next(error);
  }
}

export function updateUserProfileHandler(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "A valid user id is required." });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const profile = updateUserProfile(userId, {
      defaultMode: req.body?.defaultMode,
      safetyTier: req.body?.safetyTier,
      supervisedAdvancedMode: req.body?.supervisedAdvancedMode,
      parentEmailOptional: req.body?.parentEmailOptional,
      parentalConsentRequired: req.body?.parentalConsentRequired,
      parentalConsentVerifiedAt: req.body?.parentalConsentVerifiedAt,
    });

    return res.json({ user, profile });
  } catch (error) {
    return next(error);
  }
}
