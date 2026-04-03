import { buildResearchProfile } from "../services/researchService.js";

const VALID_CREATIVE_CONTEXTS = new Set([
  "default",
  "narrative_antagonist",
  "anti_hero",
  "morally_complex",
  "tragic_villain",
]);

function sanitizeCreativeContext(value) {
  const str = String(value || "").trim();
  return VALID_CREATIVE_CONTEXTS.has(str) ? str : "default";
}

function sanitizeSourceUrls(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => String(item || "").trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

export async function researchProfileHandler(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const sourceQuery = String(req.body.sourceQuery || name).trim();
    const sourceUrls = sanitizeSourceUrls(req.body.sourceUrls);
    const creativeContext = sanitizeCreativeContext(req.body.creativeContext);

    if (!name && !sourceQuery) {
      return res.status(400).json({ error: "Provide a character name or source query." });
    }

    const profile = await buildResearchProfile({
      name,
      description,
      sourceQuery,
      sourceUrls,
      creativeContext,
    });

    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}