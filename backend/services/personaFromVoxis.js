// backend/services/personaFromVoxis.js

const META_PITCH = /let'?s bring this character to life/i;

export function isMetaIdentityPitch(description) {
  const text = String(description || "").trim();
  if (!text) return false;
  return META_PITCH.test(text) || /^meet\s+["“]/i.test(text);
}

function dropTruncatedTail(text) {
  const value = String(text || "").trim();
  if (!/(?:\.{3}|…)\s*$/.test(value)) return value;
  return value
    .replace(/(?:\.{3}|…)\s*$/, "")
    .replace(/\s+\S+$/, "")
    .replace(/[\s,;:\-–—]+$/, "")
    .trim();
}

function sentence(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

// Turns a Voxis meta pitch ("Let's bring this character to life. Meet ...")
// into a first-person identity. Ordinary descriptions pass through unchanged.
export function extractIdentityStatement(description, personaName = "") {
  const original = String(description || "").trim();
  if (!original || !isMetaIdentityPitch(original)) return original;

  const source = original.replace(/\s+/g, " ").trim();
  let body = source.replace(/let'?s bring this character to life[.!]?\s*/i, "").trim();
  body = dropTruncatedTail(body.replace(/^meet\s+/i, "").trim());

  let epithet = "";
  const quoted = body.match(/^["“]([^"”]+)["”]\s*[-–—:]?\s*(.*)$/);
  if (quoted) {
    epithet = quoted[1].replace(/\s+/g, " ").trim();
    body = quoted[2].replace(/\s+/g, " ").trim();
  }

  const name = String(personaName || "").trim();
  const titleHasName = Boolean(name) && epithet.toLowerCase().includes(name.toLowerCase());
  const head = [name && !titleHasName ? name : "", epithet].filter(Boolean).join(", ");

  let detail = body.replace(/^(?:a|an)\s+/i, "").replace(/[\s,;:\-–—]+$/, "").trim();
  const parts = detail.split(/\s*,\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].replace(/^and\s+/i, "");
    detail = `${parts.slice(0, -1).join(", ")}, and ${last}`;
  }

  if (head && detail) return sentence(`You are ${head}, ${detail}`);
  if (head) return sentence(`You are ${head}`);
  if (detail) return sentence(/^you are\b/i.test(detail) ? detail : `You are ${detail}`);
  return original;
}

function descriptionFromReply(reply, personaName) {
  const source = String(reply || "").trim();
  if (isMetaIdentityPitch(source)) {
    return extractIdentityStatement(source, personaName);
  }
  if (source.length <= 160) return source;
  return `${source.substring(0, 160)}...`;
}

/**
 * Improved extraction logic that analyzes the full conversation
 * and Voxis's final reply to build a coherent persona
 */
export const createPersonaFromConversation = (messages, voxisFinalReply) => {
  const fullContext = messages.map(m => `${m.role}: ${m.content}`).join("\n") + 
                     `\nVoxis: ${voxisFinalReply}`;

  // Basic keyword/intent detection
  const text = (fullContext + voxisFinalReply).toLowerCase();

  const traits = [];
  const quirks = [];
  let name = "Unnamed Persona";
  let description = "";
  let creativeContext = "default";
  let darkHumor = false;
  let energyLevel = 0.6;

  // Name detection
  const nameMatch = voxisFinalReply.match(/(?:name|call(?:ed|s)?|known as)\s+(?:him|her|them|it)?\s*["']?([A-Za-z\s-]{2,30})/i);
  if (nameMatch) name = nameMatch[1].trim();

  const identityName = name === "Unnamed Persona" ? "" : name;
  description = descriptionFromReply(voxisFinalReply, identityName);

  // Trait detection
  if (text.includes("evil") || text.includes("villain") || text.includes("dark")) traits.push("evil");
  if (text.includes("calm") || text.includes("polite")) traits.push("calm", "polite");
  if (text.includes("funny") || text.includes("humor") || text.includes("joke")) {
    traits.push("witty");
    darkHumor = true;
  }
  if (text.includes("bunny") || text.includes("rabbit")) quirks.push("has a soft spot for bunnies");

  // Energy level
  if (text.includes("high energy") || text.includes("energetic") || text.includes("loud")) energyLevel = 0.85;
  if (text.includes("low energy") || text.includes("calm")) energyLevel = 0.35;

  // Narrative framing is an explicit choice. Evil or villain keywords do not set it.
  if (text.includes("narrative antagonist") || text.includes("narrative_antagonist")) {
    creativeContext = "narrative_antagonist";
  }
  if (text.includes("anti-hero") || text.includes("morally gray")) creativeContext = "anti_hero";

  // Build description if it's too generic
  if (description.length < 50) {
    description = `A ${traits.join(" and ")} character with ${quirks.length ? quirks.join(", ") : "distinctive quirks"}.`;
  }

  return {
    name,
    description,
    traits: [...new Set(traits)],           // remove duplicates
    quirks: [...new Set(quirks)],
    speechStyle: "Calm and polite on the surface, with sharp dark humor underneath",
    creativeContext,
    narrativeMode: false,
    moodBaseline: { 
      valence: darkHumor ? -0.3 : -0.5, 
      arousal: energyLevel - 0.2, 
      dominance: 0.65 
    },
    energyLevel,
    darkHumor,
    notes: `Created through natural conversation with Voxis on ${new Date().toISOString().split('T')[0]}` 
  };
};
