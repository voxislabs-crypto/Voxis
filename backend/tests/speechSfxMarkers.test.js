import { describe, expect, it } from "vitest";
import { buildSpeechPacket } from "../services/speechDirector.js";
import { prepareSpeechSynthesis } from "../services/ttsService.js";

const rick = {
  name: "Rick Sanchez",
  vocalMannerisms: {
    sfxTags: ["burp"],
    sfxFrequency: 0.32,
    sfxPlacement: "random",
  },
};

describe("Rick burp markers", () => {
  it("keeps explicit burp cues when the line also has emphasis", () => {
    const packet = buildSpeechPacket(
      "*BUUUURP* hello _really_ there. *BRAAAP* done.",
      rick,
      null,
      { styleMode: "performance", channel: "tts", ttsEngine: "cartesia", appendInjectedPhrase: false },
    );

    expect(packet.speech).toContain("[SFX:long_burp]");
    expect(packet.speech).toContain("really");
    expect(packet.speech).toContain("hello");
    expect(packet.speech).toContain("[SFX:braap]");
    expect(packet.sfx.map((event) => event.tag)).toEqual(["long_burp", "braap"]);
  });

  it("schedules each explicit burp once", () => {
    const prepared = prepareSpeechSynthesis({
      personality: rick,
      text: "*BUUUURP* hello there. *BRAAAP* done.",
      voiceProfile: { engine: "cartesia", rate: 1 },
    });

    expect(prepared.sfx.map((event) => event.tag)).toEqual(["long_burp", "braap"]);
    expect(prepared.directedText).not.toContain("[SFX:");
    expect(prepared.directedText).toContain("hello");
  });
});
