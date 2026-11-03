import { timingSafeEqual } from "crypto";

export const SOURCE_INSPECTOR_HEADER = "x-voxis-source-inspector-key";
export const SOURCE_INSPECTOR_SECRET_ENV = "VOXIS_SOURCE_INSPECTOR_SECRET";

const FAILURE = { error: "Source inspector authorization failed." };

let boundListenHost = null;

export function resolveListenHost(env = process.env) {
  return String(env.HOST || "127.0.0.1").trim() || "127.0.0.1";
}

// Server startup records the host it actually binds. Tests leave this unset
// and the request gate falls back to the same HOST resolution.
export function setSourceInspectorListenHost(host) {
  const value = String(host || "").trim();
  boundListenHost = value || null;
}

export function listenHostForInspector() {
  return boundListenHost || resolveListenHost();
}

export function isLoopbackAddress(address) {
  const value = String(address || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
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

function fail(res) {
  res.status(401).json(FAILURE);
}

// Owner gate for the read-only source inspector.
// VOXIS_LOCAL, Clerk dev identity, and VOXIS_INTERNAL_SECRET do not pass.
// The secret is accepted only from SOURCE_INSPECTOR_HEADER.
export function requireSourceInspectorAuth(req, res, next) {
  if (!isLoopbackAddress(listenHostForInspector())) {
    return fail(res);
  }

  const peer = String(req.socket?.remoteAddress || "").trim();
  if (!isLoopbackAddress(peer)) {
    return fail(res);
  }

  const expected = String(process.env[SOURCE_INSPECTOR_SECRET_ENV] || "").trim();
  if (!expected) {
    return fail(res);
  }

  const provided = String(req.headers?.[SOURCE_INSPECTOR_HEADER] || "").trim();
  if (!provided || !secretsMatch(provided, expected)) {
    return fail(res);
  }

  return next();
}
