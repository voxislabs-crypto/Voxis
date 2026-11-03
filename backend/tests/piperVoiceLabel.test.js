import { describe, expect, it } from "vitest";
import {
  choosePiperVoice,
  formatQuickPiperLabel,
  piperPresentation,
} from "../../frontend/src/utils/piperVoiceLabel.js";

describe("piper quick voice labels", () => {
  const lessac = {
    id: "en_US-lessac-medium",
    label: "en-US • Lessac • Medium",
    path: "C:\\piper\\en_US-lessac-medium.onnx",
  };
  const amy = {
    id: "en_US-amy-medium",
    label: "en-US • Amy • Medium",
    path: "C:\\piper\\en_US-amy-medium.onnx",
  };

  it("labels Lessac as male and Amy as female", () => {
    expect(piperPresentation(lessac)).toBe("male");
    expect(piperPresentation(amy)).toBe("female");
    expect(formatQuickPiperLabel(lessac)).toBe(
      "en-US • Lessac • Medium (male) — smooth narration for long replies and stories",
    );
  });

  it("picks Amy for Sage when several female models are installed", () => {
    const alba = {
      id: "en_GB-alba-medium",
      label: "en-GB • Alba • Medium",
      path: "C:\\piper\\en_GB-alba-medium.onnx",
    };
    const choice = choosePiperVoice([alba, amy, lessac], {
      providerVoice: "sage",
      piperModelPath: "",
    });
    expect(choice.voice.id).toBe("en_US-amy-medium");
  });

  it("uses a female Piper model when Sage is selected and no Piper model is saved", () => {
    const choice = choosePiperVoice([lessac, amy], {
      engine: "piper",
      providerVoice: "sage",
      piperModelPath: "",
    });
    expect(choice.reason).toBe("cloud-female");
    expect(choice.voice.id).toBe("en_US-amy-medium");
  });

  it("keeps a saved Piper model ahead of the Sage cloud name", () => {
    const choice = choosePiperVoice([lessac, amy], {
      providerVoice: "sage",
      piperModelPath: lessac.path,
    });
    expect(choice.reason).toBe("saved-model");
    expect(choice.voice.id).toBe("en_US-lessac-medium");
  });
});
