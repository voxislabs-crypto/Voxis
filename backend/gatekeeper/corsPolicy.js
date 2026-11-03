function envFlag(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function configuredOrigins() {
  return new Set(
    String(process.env.VOXIS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isAllowedCorsOrigin(origin) {
  // Non-browser clients do not send Origin. They authenticate independently.
  if (!origin) return true;

  // Local mode is an explicit development opt-in. Production must enumerate
  // browser origins rather than reflecting arbitrary credentialed origins.
  if (envFlag("VOXIS_LOCAL") || envFlag("ALLOW_MISSING_CLERK_KEYS")) {
    return true;
  }

  return configuredOrigins().has(String(origin).trim());
}

export function createCorsOriginValidator() {
  return (origin, callback) => callback(null, isAllowedCorsOrigin(origin));
}
