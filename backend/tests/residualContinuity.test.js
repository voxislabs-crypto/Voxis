import { beforeEach, describe, expect, it } from "vitest";

import {
  RESIDUAL_COOLDOWN_TURNS,
  RESIDUAL_NOTES,
  RESIDUAL_VALENCE_GAP,
  assessResidualContinuity,
  resetResidualCooldown,
  resolveResidualNote,
} from "../services/residualContinuity.js";

const BASELINE = { valence: 0.3, arousal: 0, dominance: 0.2 };

function historyFrom(valences) {
  return valences.map((valence, index) => ({
    valence,
    arousal: 0.1,
    dominance: 0.1,
    at: `2026-11-02T00:00:0${index}.000Z`,
  }));
}

describe("residual emotional continuity", () => {
  beforeEach(() => {
    resetResidualCooldown();
  });

  it("injects the residual note when recent valence stays below baseline", () => {
    const history = historyFrom([0.4, 0.05, 0.02, 0.0, -0.04, 0.01]);
    const assessment = assessResidualContinuity({
      history,
      baseline: BASELINE,
      personality: { traits: ["warm"] },
    });

    expect(assessment.sampleCount).toBe(5);
    expect(assessment.gap).toBeGreaterThanOrEqual(RESIDUAL_VALENCE_GAP);
    expect(assessment.active).toBe(true);
    expect(assessment.note).toBe(RESIDUAL_NOTES.default);

    const note = resolveResidualNote({
      personalityId: 7,
      userId: 3,
      history,
      baseline: BASELINE,
      personality: { traits: ["warm"] },
      turnIndex: 4,
    });
    expect(note).toBe(RESIDUAL_NOTES.default);
  });

  it("stays quiet when the dip is below the gap or the history is too short", () => {
    const mild = assessResidualContinuity({
      history: historyFrom([0.2, 0.18, 0.16, 0.19, 0.17]),
      baseline: BASELINE,
    });
    expect(mild.gap).toBeLessThan(RESIDUAL_VALENCE_GAP);
    expect(mild.note).toBeNull();

    const shortHistory = assessResidualContinuity({
      history: historyFrom([0, 0, 0]),
      baseline: BASELINE,
    });
    expect(shortHistory.active).toBe(false);
    expect(shortHistory.note).toBeNull();
  });

  it("uses a stronger note for sensitive personalities and a softer one for stoic ones", () => {
    const history = historyFrom([-0.2, -0.15, -0.1, -0.18, -0.12]);
    const sensitive = assessResidualContinuity({
      history,
      baseline: BASELINE,
      personality: { traits: ["sensitive", "emotional"] },
    });
    const stoic = assessResidualContinuity({
      history,
      baseline: BASELINE,
      personality: { traits: ["stoic", "reserved"] },
    });

    expect(sensitive.note).toBe(RESIDUAL_NOTES.sensitive);
    expect(stoic.note).toBe(RESIDUAL_NOTES.stoic);
    expect(sensitive.note).not.toBe(stoic.note);
  });

  it("blocks a second injection until the cooldown has elapsed", () => {
    const history = historyFrom([-0.1, -0.1, -0.1, -0.1, -0.1]);
    const args = {
      personalityId: 23,
      userId: 9,
      history,
      baseline: BASELINE,
      personality: {},
    };

    expect(resolveResidualNote({ ...args, turnIndex: 8 })).toBe(RESIDUAL_NOTES.default);
    expect(resolveResidualNote({ ...args, turnIndex: 9 })).toBeNull();
    expect(resolveResidualNote({ ...args, turnIndex: 8 + RESIDUAL_COOLDOWN_TURNS - 1 })).toBeNull();
    expect(resolveResidualNote({ ...args, turnIndex: 8 + RESIDUAL_COOLDOWN_TURNS })).toBe(RESIDUAL_NOTES.default);
  });

  it("does not arm the cooldown when the history does not qualify", () => {
    const quiet = historyFrom([0.3, 0.3, 0.3, 0.3, 0.3]);
    const low = historyFrom([-0.2, -0.2, -0.2, -0.2, -0.2]);
    const args = {
      personalityId: 4,
      userId: 4,
      baseline: BASELINE,
      personality: {},
    };

    expect(resolveResidualNote({ ...args, history: quiet, turnIndex: 2 })).toBeNull();
    expect(resolveResidualNote({ ...args, history: low, turnIndex: 3 })).toBe(RESIDUAL_NOTES.default);
  });

  it("returns no note without a signed-in user and personality pair", () => {
    const history = historyFrom([-0.2, -0.2, -0.2, -0.2, -0.2]);
    expect(resolveResidualNote({
      personalityId: null,
      userId: null,
      history,
      baseline: BASELINE,
      turnIndex: 1,
    })).toBeNull();
  });
});
