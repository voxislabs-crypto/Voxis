import { clerkMiddleware, getAuth } from "@clerk/express";
import { createUser, getUserByClerkId } from "../models/userModel.js";

// Verifies the Clerk JWT on every request that uses this middleware.
// On success, attaches req.clerkUserId (string) and req.voxisUser (the local DB record).
// Auto-provisions a Voxis user row on first sign-in.
export const clerkVerify = clerkMiddleware();

export async function requireAuth(req, res, next) {
  try {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    req.clerkUserId = clerkUserId;

    let voxisUser = getUserByClerkId(clerkUserId);

    if (!voxisUser) {
      // First sign-in — provision a local DB user linked to this Clerk account.
      // We use the Clerk userId as display name temporarily; the user can rename later.
      const { user } = createUser({
        displayName: req.auth?.firstName || req.auth?.username || "Voxis User",
        ageBand: "adult",
        defaultMode: "scientist",
        clerkId: clerkUserId,
      });
      voxisUser = user;
    }

    req.voxisUser = voxisUser;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Lightweight variant for admin-only routes (LLM settings).
// Requires ADMIN_CLERK_IDS env var — a comma-separated list of Clerk user IDs allowed to
// touch LLM provider settings. Falls back to allowing any authenticated user if unset.
export function requireAdmin(req, res, next) {
  const adminIds = process.env.ADMIN_CLERK_IDS
    ? process.env.ADMIN_CLERK_IDS.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  if (adminIds.length && !adminIds.includes(req.clerkUserId)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  return next();
}
