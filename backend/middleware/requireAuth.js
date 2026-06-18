import path from "path";
import { fileURLToPath } from "url";
import { verifyToken } from "@clerk/backend";
import { createUser, getUserByClerkId } from "../models/userModel.js";
import { getPersonalityCountByOwner, transferPersonalitiesToOwner } from "../models/personalityModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const dotenv = await import("dotenv");
  dotenv.default.config({ path: path.join(__dirname, "..", ".env") });
} catch {
  // PM2/system env is enough in production; missing dotenv should not crash auth.
}

// Verifies the Clerk JWT on every request that uses this middleware.
// On success, attaches req.clerkUserId (string) and req.voxisUser (the local DB record).
// Auto-provisions a Voxis user row on first sign-in.
const clerkPublishableKeyFrom =
  (process.env.CLERK_PUBLISHABLE_KEY && "CLERK_PUBLISHABLE_KEY") ||
  (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ||
  (process.env.VITE_CLERK_PUBLISHABLE_KEY && "VITE_CLERK_PUBLISHABLE_KEY") ||
  "";

const clerkPublishableKey = clerkPublishableKeyFrom
  ? process.env[clerkPublishableKeyFrom]
  : "";

const clerkSecretKey = process.env.CLERK_SECRET_KEY || "";
const allowMissingClerkKeys = String(process.env.ALLOW_MISSING_CLERK_KEYS || "")
  .trim()
  .toLowerCase() === "true";

if ((!clerkPublishableKey || !clerkSecretKey) && !allowMissingClerkKeys && process.env.NODE_ENV !== "test") {
  const missing = [
    !clerkPublishableKey ? "publishable key (CLERK_PUBLISHABLE_KEY preferred)" : null,
    !clerkSecretKey ? "CLERK_SECRET_KEY" : null,
  ]
    .filter(Boolean)
    .join(", ");

  throw new Error(
    `[Auth] Missing Clerk configuration: ${missing}. ` +
      "Set keys in backend/.env and restart with: " +
      "pm2 startOrReload ecosystem.config.cjs --only voxis-backend --update-env. " +
      "To bypass in local-only debugging, set ALLOW_MISSING_CLERK_KEYS=true.",
  );
}

// @clerk/shared's parsePublishableKey reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY first, then
// CLERK_PUBLISHABLE_KEY. Servers typically only have one alias set. Normalize both so Clerk's
// per-request AuthenticateContext construction finds the key regardless of which it checks.
if (clerkPublishableKey) {
  if (!process.env.CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = clerkPublishableKey;
  }
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkPublishableKey;
  }
}

console.info("[Auth] Clerk env", {
  publishableKeyPresent: Boolean(clerkPublishableKey),
  publishableKeyFrom: clerkPublishableKeyFrom || "missing",
  publishableKeyPrefix: clerkPublishableKey
    ? clerkPublishableKey.startsWith("pk_live_")
      ? "pk_live"
      : clerkPublishableKey.startsWith("pk_test_")
      ? "pk_test"
      : "pk_unknown"
    : "missing",
  secretKeyPresent: Boolean(clerkSecretKey),
  secretKeyPrefix: clerkSecretKey
    ? clerkSecretKey.startsWith("sk_live_")
      ? "sk_live"
      : clerkSecretKey.startsWith("sk_test_")
      ? "sk_test"
      : "sk_unknown"
    : "missing",
});

// Authenticate each request by verifying the Clerk session token when present.
// On success, attaches req.auth = { userId } so downstream requireAuth() can use it.
// Errors are always non-fatal here — protected routes gate separately via requireAuth().
export const clerkVerify = async (req, res, next) => {
  req.auth = null;
  if (!clerkSecretKey) return next();

  try {
    // Extract session token from Authorization: Bearer <token> or __session cookie.
    // Avoids constructing a full Request object (which requires an absolute URL).
    let token = null;
    const authHeader = String(req.headers["authorization"] || "");
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const cookieHeader = String(req.headers["cookie"] || "");
      const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }
    if (!token) return next();

    const payload = await verifyToken(token, {
      secretKey: clerkSecretKey,
      authorizedParties: [],
    });
    req.auth = { userId: payload.sub };
  } catch (err) {
    // Missing/invalid token — not fatal; requireAuth() returns 401 when userId absent.
  }
  return next();
};

export async function requireAuth(req, res, next) {
  try {
    // Development bypass when ALLOW_MISSING_CLERK_KEYS is set
    if (allowMissingClerkKeys) {
      const devUserId = "1"; // Match mock Clerk userId
      req.clerkUserId = devUserId;
      
      let voxisUser = getUserByClerkId(devUserId);
      
      if (!voxisUser) {
        const { user } = createUser({
          displayName: "Dev User",
          ageBand: "adult",
          defaultMode: "scientist",
          clerkId: devUserId,
        });
        voxisUser = user;
      }
      
      req.voxisUser = voxisUser;
      return next();
    }

    const clerkUserId = req.auth?.userId || null;

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

    // Recovery migration: if personas were created earlier under local dev auth
    // (clerkId "1") and this authenticated account has none, transfer those
    // personas so they become visible without manual DB fixes.
    if (clerkUserId !== "1") {
      try {
        const currentOwnerId = Number(voxisUser?.id);
        const currentPersonaCount = getPersonalityCountByOwner(currentOwnerId);
        if (Number.isInteger(currentOwnerId) && currentOwnerId > 0 && currentPersonaCount === 0) {
          const devUser = getUserByClerkId("1");
          const devOwnerId = Number(devUser?.id);
          if (Number.isInteger(devOwnerId) && devOwnerId > 0 && devOwnerId !== currentOwnerId) {
            const movedCount = transferPersonalitiesToOwner({
              fromOwnerId: devOwnerId,
              toOwnerId: currentOwnerId,
              includeLegacy: true,
            });
            if (movedCount > 0) {
              console.info("[Auth] Migrated local/dev personas to authenticated account", {
                movedCount,
                fromOwnerId: devOwnerId,
                toOwnerId: currentOwnerId,
              });
            }
          }
        }
      } catch (migrationError) {
        console.warn("[Auth] Persona recovery migration skipped", {
          message: String(migrationError?.message || migrationError),
        });
      }
    }

    req.voxisUser = voxisUser;
    return next();
  } catch (error) {
    const message = String(error?.message || "");
    const likelyAuthVerificationError =
      /clerk|jwt|token|secret key|verify|session/i.test(message) ||
      error?.status === 401 ||
      error?.statusCode === 401;

    if (likelyAuthVerificationError) {
      console.error("[Auth] Clerk verification failed", {
        message,
        code: error?.code || null,
      });
      return res.status(401).json({ error: "Authentication verification failed." });
    }

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
