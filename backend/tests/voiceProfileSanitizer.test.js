import { describe, expect, it } from "vitest";
import { sanitizeVoiceProfile } from "../services/voiceProfileSanitizer.js";

const ENV_KEYS = ["TTS_DEBUG_PROVIDER_LOCK", "TTS_DISABLE_KOKORO"];

function withEnv(values, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    return run();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

describe("sanitizeVoiceProfile engine allow list", () => {
  it("keeps openvoice when the debug lock is off", () => {
    withEnv({ TTS_DEBUG_PROVIDER_LOCK: "false", TTS_DISABLE_KOKORO: "true" }, () => {
      expect(sanitizeVoiceProfile({ engine: "openvoice" }).engine).toBe("openvoice");
    });
  });

  it("keeps openvoice when the debug lock is on", () => {
    withEnv({ TTS_DEBUG_PROVIDER_LOCK: "true", TTS_DISABLE_KOKORO: "true" }, () => {
      expect(sanitizeVoiceProfile({ engine: "openvoice" }).engine).toBe("openvoice");
    });
  });

  it("keeps a blank Piper speaker blank", () => {
    withEnv({ TTS_DEBUG_PROVIDER_LOCK: "false", TTS_DISABLE_KOKORO: "true" }, () => {
      expect(sanitizeVoiceProfile({ piperSpeaker: null }).piperSpeaker).toBeNull();
      expect(sanitizeVoiceProfile({ piperSpeaker: "" }).piperSpeaker).toBeNull();
      expect(sanitizeVoiceProfile({ piperSpeaker: 0 }).piperSpeaker).toBe(0);
      expect(sanitizeVoiceProfile({ piperSpeaker: 1 }).piperSpeaker).toBe(1);
    });
  });

  it("rewrites kokoro to auto while kokoro is disabled", () => {
    withEnv({ TTS_DEBUG_PROVIDER_LOCK: "false", TTS_DISABLE_KOKORO: "true" }, () => {
      expect(sanitizeVoiceProfile({ engine: "kokoro" }).engine).toBe("auto");
    });
  });
});
