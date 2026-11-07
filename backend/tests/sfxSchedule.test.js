import { describe, expect, it } from "vitest";
import { sfxTargetSeconds } from "../../frontend/src/voice/sfxSchedule.js";

describe("sfx target seconds", () => {
  it("treats every non-negative delay as milliseconds", () => {
    expect(sfxTargetSeconds(16)).toBeCloseTo(0.016);
    expect(sfxTargetSeconds(1350)).toBeCloseTo(1.35);
    expect(sfxTargetSeconds(0)).toBe(0);
  });

  it("keeps an after-cue negative", () => {
    expect(sfxTargetSeconds(-1)).toBe(-1);
  });
});
