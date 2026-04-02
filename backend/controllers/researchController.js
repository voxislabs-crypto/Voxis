import { buildResearchProfile } from "../services/researchService.js";

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

    if (!name && !sourceQuery) {
      return res.status(400).json({ error: "Provide a character name or source query." });
    }

    const profile = await buildResearchProfile({
      name,
      description,
      sourceQuery,
      sourceUrls,
    });

    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}