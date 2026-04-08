import { promises as fs } from "node:fs";

import {
  getPersonalityById,
  updatePersonalityProsodyTemplate,
  updatePersonalityVoiceSampleAnalysis,
} from "../models/personalityModel.js";
import { extractProsodyTemplateFromUrl } from "../services/prosodyExtractionService.js";
import { analyzeAudioSegments } from "../services/voiceSegmentationService.js";

export async function extractProsodyTemplateHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const ownerId = req.voxisUser?.id ?? null;
    const url = String(req.body.url || "").trim();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    if (!url) {
      return res.status(400).json({ error: "A source URL is required." });
    }

    const personality = getPersonalityById(personalityId, ownerId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const extracted = await extractProsodyTemplateFromUrl({
      personalityId,
      url,
      deps: {
        onAudioReady: async ({ audioPath }) => {
          const voiceSamples = await analyzeAudioSegments({
            personalityId,
            audioPath,
          }).catch(() => null);

          if (!voiceSamples) {
            return null;
          }

          return {
            ...voiceSamples,
            extractedAt: new Date().toISOString(),
            representatives: (voiceSamples.representatives || []).map((sample) => ({
              ...sample,
              audioUrl: sample.clipFile
                ? `/personality/${personalityId}/voice-samples/audio/${encodeURIComponent(sample.clipFile)}`
                : "",
            })),
          };
        },
      },
    });

    let updated;

    try {
      updated = updatePersonalityProsodyTemplate(personalityId, {
        template: extracted.template,
        templatePath: extracted.templatePath,
        sourceUrl: extracted.sourceUrl,
        updatedAt: extracted.extractedAt,
      });

      if (extracted.audioDerived) {
        updated = updatePersonalityVoiceSampleAnalysis(personalityId, {
          analysis: extracted.audioDerived,
        });
      }
    } catch (error) {
      if (extracted.templatePath) {
        await fs.rm(extracted.templatePath, { force: true }).catch(() => {});
      }
      throw error;
    }

    return res.json({
      personality: updated,
      prosodyTemplate: updated.prosodyTemplate,
      prosodyTemplatePath: updated.prosodyTemplatePath,
      prosodySourceUrl: updated.prosodySourceUrl,
      prosodyUpdatedAt: updated.prosodyUpdatedAt,
      voiceSamples: updated.voiceSampleAnalysis,
    });
  } catch (error) {
    return next(error);
  }
}
