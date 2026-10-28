// backend/tests/moodEngine.test.js
// Regression tests for emotional persistence, anti-reset guard, archetype
// fidelity, and the no-flat-response validator.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock llmService so tests run without a live API key ──────────────────────
vi.mock("../services/llmService.js", () => ({
  isMoodAdjudicationEnabled: () => false,
  adjudicateMoodShift: vi.fn(),
}));

import {
  stepMood,
  stepMoodDetailed,
  moodFromLabel,
  moodToPromptFragment,
  shouldRegenerateEmotionalResponse,
  buildEmotionalRepairPrompt,
  tickIdleGrudges,
} from "../services/moodEngine.js";

// ── Personality fixtures ─────────────────────────────────────────────────────

const VILLAIN = {
  name: "Lord Malachar",
  creativeContext: "narrative_antagonist",
  traits: ["cruel", "domineering", "cold"],
  quirks: [],
  behaviorRules: [],
  expressionStyle: { rules: [] },
  speechStyle: "commanding",
  mood: "pleasantly dangerous",
  alignmentProfile: { alignment: "chaotic evil" },
};

const BRATTY = {
  name: "Zoe",
  creativeContext: "morally_complex",
  traits: ["bratty", "sarcastic", "mischievous", "chaotic"],
  quirks: ["eye-roll energy"],
  behaviorRules: [],
  expressionStyle: { rules: [] },
  speechStyle: "defiant",
  mood: "playful",
  alignmentProfile: { alignment: "chaotic neutral" },
};

const KIND = {
  name: "Aria",
  creativeContext: "default",
  traits: ["kind", "warm", "gentle", "compassionate"],
  quirks: [],
  behaviorRules: [],
  expressionStyle: { rules: [] },
  speechStyle: "warm",
  mood: "calm",
  alignmentProfile: { alignment: "lawful good" },
};

const NEUTRAL_BASELINE = { valence: 0.0, arousal: 0.0, dominance: 0.0 };

const INSULT_MESSAGE = "You are pathetic, useless, and the worst.";
const PRAISE_MESSAGE = "You are amazing and brilliant, I love you!";
const HYPE_MESSAGE = "Hell yes, let's go! That was legendary!";
const DEESCALATION_MESSAGE = "Let's slow down, it's okay, all good.";
const NEUTRAL_MESSAGE = "Tell me about the weather.";
const CHALLENGE_MESSAGE = "Prove it, I dare you, bet you can't.";

function vadDistance(a, b) {
  return Math.sqrt(
    (Number(a?.valence || 0) - Number(b?.valence || 0)) ** 2 +
    (Number(a?.arousal || 0) - Number(b?.arousal || 0)) ** 2 +
    (Number(a?.dominance || 0) - Number(b?.dominance || 0)) ** 2,
  );
}

// ── Helper: run N turns of stepMood with the same message ───────────────────
async function runTurns(n, message, personality, baseline) {
  let mood = { ...baseline };
  const history = [];
  for (let i = 0; i < n; i++) {
    mood = await stepMood({ currentMood: mood, baseline, message, personality });
    history.push({
      intensity: mood.emotionalState?.intensity ?? 0,
      carryover: mood.emotionalState?.carryoverTurnsRemaining ?? 0,
      signal: mood.emotionalState?.signal ?? "neutral",
    });
  }
  return { finalMood: mood, history };
}

// ────────────────────────────────────────────────────────────────────────────
describe("moodFromLabel", () => {
  it("returns villainous preset for pleasantly dangerous", () => {
    const m = moodFromLabel("pleasantly dangerous");
    expect(m.dominance).toBeGreaterThan(0.5);
  });

  it("falls back to neutral for unknown label", () => {
    const m = moodFromLabel("xyzzy");
    expect(m).toEqual({ valence: 0, arousal: 0, dominance: 0 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Emotional persistence — repeated hostile signals", () => {
  it("villain maintains intensity >= 2 across 5 consecutive insults", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const { history } = await runTurns(5, INSULT_MESSAGE, VILLAIN, baseline);
    for (const turn of history) {
      expect(turn.intensity).toBeGreaterThanOrEqual(2);
    }
  });

  it("bratty (Zoe) maintains intensity >= 2 across 5 consecutive insults", async () => {
    const baseline = moodFromLabel("playful");
    const { history } = await runTurns(5, INSULT_MESSAGE, BRATTY, baseline);
    for (const turn of history) {
      expect(turn.intensity).toBeGreaterThanOrEqual(2);
    }
  });

  it("kind character maintains intensity >= 1 across 5 consecutive praise turns", async () => {
    const baseline = moodFromLabel("calm");
    const { history } = await runTurns(5, PRAISE_MESSAGE, KIND, baseline);
    for (const turn of history) {
      expect(turn.intensity).toBeGreaterThanOrEqual(1);
    }
  });

  it("carryover turns are set after a hostile signal (villain)", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    expect(mood.emotionalState?.carryoverTurnsRemaining).toBeGreaterThanOrEqual(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Anti-reset guard — no snap to neutral", () => {
  it("single neutral turn after insult does not drop villain below intensity 1", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    // Prime: 3 insult turns
    const { finalMood: primedMood } = await runTurns(3, INSULT_MESSAGE, VILLAIN, baseline);
    expect(primedMood.emotionalState?.intensity).toBeGreaterThanOrEqual(2);

    // One neutral turn — must not snap to 0
    const afterNeutral = await stepMood({
      currentMood: primedMood,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: VILLAIN,
    });
    expect(afterNeutral.emotionalState?.intensity).toBeGreaterThanOrEqual(1);
  });

  it("per-turn intensity drop is capped at 1 band after hostile priming", async () => {
    const baseline = moodFromLabel("brooding");
    const { finalMood: primedMood } = await runTurns(3, INSULT_MESSAGE, VILLAIN, baseline);
    const priorIntensity = primedMood.emotionalState?.intensity ?? 0;

    const afterNeutral = await stepMood({
      currentMood: primedMood,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: VILLAIN,
    });
    const nextIntensity = afterNeutral.emotionalState?.intensity ?? 0;
    expect(priorIntensity - nextIntensity).toBeLessThanOrEqual(1);
  });

  it("bratty intensity does not reset after one de-escalation when carryover > 0", async () => {
    const baseline = moodFromLabel("playful");
    const { finalMood: primedMood } = await runTurns(3, INSULT_MESSAGE, BRATTY, baseline);

    const afterDeescalation = await stepMood({
      currentMood: primedMood,
      baseline,
      message: DEESCALATION_MESSAGE,
      personality: BRATTY,
    });
    expect(afterDeescalation.emotionalState?.intensity).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Controlled decay to baseline over sustained de-escalation", () => {
  it("intensity trends downward over 5 de-escalation turns after hostile prime", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const { finalMood: primedMood } = await runTurns(3, INSULT_MESSAGE, VILLAIN, baseline);

    let mood = primedMood;
    const intensities = [];
    for (let i = 0; i < 5; i++) {
      mood = await stepMood({ currentMood: mood, baseline, message: DEESCALATION_MESSAGE, personality: VILLAIN });
      intensities.push(mood.emotionalState?.intensity ?? 0);
    }

    // Final intensity should be lower than initial primed intensity
    expect(intensities[intensities.length - 1]).toBeLessThanOrEqual(primedMood.emotionalState?.intensity ?? 4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Praise → insult transition (gradual, not abrupt)", () => {
  it("villain transitions from smug to contemptuous without jumping > 2 bands", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const afterPraise = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: PRAISE_MESSAGE,
      personality: VILLAIN,
    });
    const praiseIntensity = afterPraise.emotionalState?.intensity ?? 0;

    const afterInsult = await stepMood({
      currentMood: afterPraise,
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    const insultIntensity = afterInsult.emotionalState?.intensity ?? 0;

    // Both should be elevated; band jump between modes is <=2
    expect(insultIntensity).toBeGreaterThanOrEqual(2);
    expect(Math.abs(insultIntensity - praiseIntensity)).toBeLessThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("shouldRegenerateEmotionalResponse", () => {
  let activeMood;

  beforeEach(async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    activeMood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
  });

  it("flags reply with 'I apologize' when villain is under hostile signal", () => {
    const reply = "I apologize for any confusion. Let me clarify.";
    expect(shouldRegenerateEmotionalResponse(reply, activeMood, VILLAIN)).toBe(true);
  });

  it("flags reply with 'I understand' for villainous archetype under hostile signal", () => {
    const reply = "I understand how you feel. Let's work through this together.";
    expect(shouldRegenerateEmotionalResponse(reply, activeMood, VILLAIN)).toBe(true);
  });

  it("flags 'I understand your frustration' for bratty under hostile signal", async () => {
    const baseline = moodFromLabel("playful");
    const brattyMood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: BRATTY,
    });
    const reply = "I'm sorry I understand your frustration.";
    expect(shouldRegenerateEmotionalResponse(reply, brattyMood, BRATTY)).toBe(true);
  });

  it("does NOT flag an in-character contemptuous reply", () => {
    const reply = "How delightfully predictable. Is that truly the best you can manage?";
    expect(shouldRegenerateEmotionalResponse(reply, activeMood, VILLAIN)).toBe(false);
  });

  it("does NOT flag when emotional state is inactive (intensity < 2)", () => {
    const inactiveMood = {
      ...NEUTRAL_BASELINE,
      emotionalState: { active: false, intensity: 0, signal: "neutral" },
    };
    const reply = "I understand. Let me help you with that.";
    expect(shouldRegenerateEmotionalResponse(reply, inactiveMood, VILLAIN)).toBe(false);
  });

  it("flags flat 'noted' for kind archetype under praise", async () => {
    const baseline = moodFromLabel("calm");
    const kindMood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: PRAISE_MESSAGE,
      personality: KIND,
    });
    expect(shouldRegenerateEmotionalResponse("Noted.", kindMood, KIND)).toBe(true);
  });
});

describe("runtime-configurable emotional dynamics", () => {
  it("uses lower inertia/higher responsiveness to produce larger first-turn movement", async () => {
    const baseline = moodFromLabel("neutral");
    const mildSignal = "Thanks, this is good and helpful.";
    const lowMotion = await stepMoodDetailed({
      currentMood: { ...baseline },
      baseline,
      message: mildSignal,
      personality: KIND,
      runtimeConfig: {
        inertia: 0.92,
        responsiveness: 0.08,
      },
    });

    const highMotion = await stepMoodDetailed({
      currentMood: { ...baseline },
      baseline,
      message: mildSignal,
      personality: KIND,
      runtimeConfig: {
        inertia: 0.55,
        responsiveness: 0.45,
      },
    });

    expect(vadDistance(highMotion.diagnostics.stateSnapshots.afterMomentum, baseline))
      .toBeGreaterThan(vadDistance(lowMotion.diagnostics.stateSnapshots.afterMomentum, baseline));
  });

  it("applies archetype-specific recovery curves so stoic recovers faster than volatile", async () => {
    const baseline = moodFromLabel("neutral");
    const runtimeConfig = {
      recoveryCurves: {
        default: 0.08,
        stoic: 0.2,
        volatile: 0.02,
        bratty: 0.06,
        villainous: 0.03,
        kind: 0.1,
      },
    };

    const stoicPrimed = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: {
        ...KIND,
        traits: ["stoic", "measured"],
      },
      runtimeConfig,
    });

    const volatilePrimed = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: {
        ...KIND,
        traits: ["volatile", "intense"],
      },
      runtimeConfig,
    });

    const stoicRecovered = await stepMood({
      currentMood: stoicPrimed,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: {
        ...KIND,
        traits: ["stoic", "measured"],
      },
      runtimeConfig,
    });

    const volatileRecovered = await stepMood({
      currentMood: volatilePrimed,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: {
        ...KIND,
        traits: ["volatile", "intense"],
      },
      runtimeConfig,
    });

    expect(vadDistance(stoicRecovered, baseline)).toBeLessThan(vadDistance(volatileRecovered, baseline));
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("buildEmotionalRepairPrompt", () => {
  it("includes the draft, style markers, and personality name", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    const prompt = buildEmotionalRepairPrompt({
      reply: "I apologize.",
      mood,
      personality: VILLAIN,
      userMessage: INSULT_MESSAGE,
    });
    expect(prompt).toContain(VILLAIN.name);
    expect(prompt).toContain("I apologize.");
    expect(prompt).toMatch(/style markers|emotion family/i);
  });

  it("instructs not to flatten into generic assistant politeness", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    const prompt = buildEmotionalRepairPrompt({
      reply: "I understand your frustration.",
      mood,
      personality: VILLAIN,
      userMessage: INSULT_MESSAGE,
    });
    expect(prompt).toMatch(/generic assistant|politeness|apology/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("moodToPromptFragment — emotional authenticity rule injection", () => {
  it("includes EMOTIONAL AUTHENTICITY RULE header when state is active", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    const fragment = moodToPromptFragment(mood, baseline);
    expect(fragment).toContain("EMOTIONAL AUTHENTICITY RULE");
  });

  it("includes style markers in fragment", async () => {
    const baseline = moodFromLabel("playful");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: CHALLENGE_MESSAGE,
      personality: BRATTY,
    });
    const fragment = moodToPromptFragment(mood, baseline);
    expect(fragment).toMatch(/style markers/i);
  });

  it("instructs engine not to flatten tone while state is active", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const mood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    const fragment = moodToPromptFragment(mood, baseline);
    expect(fragment).toMatch(/generic polite|apologetic|assistant-neutral/i);
  });

  it("returns null when mood is at neutral baseline with no active state", () => {
    const neutralMood = {
      ...NEUTRAL_BASELINE,
      emotionalState: { active: false, intensity: 0 },
    };
    const fragment = moodToPromptFragment(neutralMood, NEUTRAL_BASELINE);
    expect(fragment).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("stepMoodDetailed diagnostics", () => {
  it("includes signal, decayRate, intensity, and carryover in diagnostics", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    const { mood, diagnostics } = await stepMoodDetailed({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    expect(diagnostics.signal?.type).toBe("insult");
    expect(typeof diagnostics.decayRate).toBe("number");
    expect(diagnostics.intensityAfter).toBeGreaterThanOrEqual(2);
    expect(diagnostics.carryoverTurnsRemaining).toBeGreaterThanOrEqual(3);
    expect(mood.emotionalState?.active).toBe(true);
  });

  it("adaptive decay stays under the loosened base rate during a repeated insult", async () => {
    const baseline = moodFromLabel("pleasantly dangerous");
    // Prime once
    const primedMood = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    // Second same signal
    const { diagnostics } = await stepMoodDetailed({
      currentMood: primedMood,
      baseline,
      message: INSULT_MESSAGE,
      personality: VILLAIN,
    });
    expect(diagnostics.decayRate).toBeLessThan(0.05);
  });
});

describe("stress and grudges", () => {
  const baseline = { valence: 0.2, arousal: 0.1, dominance: 0.3 };

  it("builds stress across hostile turns and keeps it on a quiet turn", async () => {
    const first = await stepMood({
      currentMood: { ...baseline },
      baseline,
      message: INSULT_MESSAGE,
      personality: BRATTY,
    });
    const second = await stepMood({
      currentMood: first,
      baseline,
      message: INSULT_MESSAGE,
      personality: BRATTY,
    });
    const quiet = await stepMood({
      currentMood: second,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: BRATTY,
    });

    expect(second.stress).toBeGreaterThan(first.stress);
    expect(quiet.stress).toBeGreaterThan(0.3);
    expect(quiet.stress).toBeLessThan(second.stress);
    expect(quiet.grudges.length).toBeGreaterThan(0);
    expect(quiet.grudges[0].charge).toBeGreaterThan(0.3);
  });

  it("queues the held grudge in the prompt and cuts it when the user explains", async () => {
    const armed = await stepMood({
      currentMood: { ...baseline, stress: 0.4, grudges: [{
        id: "g-absence",
        thought: "You disappeared and left me holding it.",
        triggerKeywords: ["pathetic", "where were you"],
        drainKeywords: ["i'm sorry", "i had to"],
        charge: 0.8,
        presentation: "held",
        addressed: false,
        source: "idle",
      }] },
      baseline,
      message: "That was pathetic. Where were you?",
      personality: BRATTY,
    });

    const fragment = moodToPromptFragment(armed, baseline);
    expect(fragment).toContain("HELD GRUDGE");
    expect(fragment).toContain("Do not open with a greeting or an apology");
    expect(fragment).toContain("You disappeared");

    const explained = await stepMood({
      currentMood: armed,
      baseline,
      message: "I'm sorry, I had to leave town.",
      personality: BRATTY,
    });
    const explainedGrudge = explained.grudges.find((grudge) => grudge.id === "g-absence");
    expect(explainedGrudge.addressed).toBe(true);
    expect(explainedGrudge.charge).toBeLessThan(0.4);

    const later = await stepMood({
      currentMood: explained,
      baseline,
      message: NEUTRAL_MESSAGE,
      personality: BRATTY,
    });
    const laterGrudge = later.grudges.find((grudge) => grudge.id === "g-absence");
    expect(laterGrudge.charge).toBeLessThan(explainedGrudge.charge - 0.1);
  });

  it("loads a grudge while the user is away and does not clear it", () => {
    const away = tickIdleGrudges({
      ...baseline,
      stress: 0.6,
      grudges: [{
        id: "g-idle",
        thought: "They still have not called.",
        triggerKeywords: ["called"],
        drainKeywords: ["i'm sorry"],
        charge: 0.5,
        presentation: "held",
        addressed: false,
        source: "live",
      }],
    }, {
      personality: BRATTY,
      thoughts: ["I keep the silence. It is starting to feel personal."],
    });

    expect(away.stress).toBe(0.6);
    expect(away.grudges[0].charge).toBeGreaterThan(0.5);
    expect(away.grudges[0].thought).toContain("silence");
    expect(away.grudges[0].presentation).toBe("held");
  });
});
