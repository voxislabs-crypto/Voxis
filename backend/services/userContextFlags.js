const OFF = new Set(["0", "false", "off", "no"]);

function enabled(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  return !OFF.has(String(value).trim().toLowerCase());
}

// Each layer can be turned off without affecting the others.
// Unset variables stay on so a normal turn still produces user context.
export function readUserContextFlags(env = process.env) {
  return {
    affect: enabled(env.VOXIS_USER_AFFECT, true),
    model: enabled(env.VOXIS_USER_MODEL, true),
    theory: enabled(env.VOXIS_THEORY_OF_MIND, true),
    adaptation: enabled(env.VOXIS_USER_ADAPTATION, true),
  };
}
