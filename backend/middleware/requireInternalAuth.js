import { timingSafeEqual } from "crypto";

const HEADER = "x-voxis-internal-key";

function readProvidedSecret(req) {
  const fromHeader = String(req.headers?.[HEADER] || "").trim();
  if (fromHeader) return fromHeader;

  const authorization = String(req.headers?.authorization || "");
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

function secretsMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isLoopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || req.ip || "").trim();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

// Shared-secret gate for sidecar callers such as Counsel of Echoes.
// When VOXIS_INTERNAL_SECRET is set, every caller must present it.
// When it is unset, only loopback clients are allowed, so a Dell sidecar
// works without Clerk and a remote caller still cannot reach the route.
export function requireInternalAuth(req, res, next) {
  const expected = String(process.env.VOXIS_INTERNAL_SECRET || "").trim();
  const provided = readProvidedSecret(req);

  if (expected) {
    if (provided && secretsMatch(provided, expected)) {
      return next();
    }
    return res.status(401).json({ error: "Invalid or missing internal key." });
  }

  if (isLoopbackRequest(req)) {
    return next();
  }

  return res.status(401).json({
    error: "Set VOXIS_INTERNAL_SECRET before calling internal chat from outside localhost.",
  });
}
