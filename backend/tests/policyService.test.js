import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Must be declared before imports so vitest hoists mocker
vi.mock("../models/userModel.js", () => ({
  getUserById: vi.fn(),
  getUserProfile: vi.fn(),
}));

import { getUserById, getUserProfile } from "../models/userModel.js";
import { resolvePolicyContext, buildModePolicyPrompt } from "../services/policyService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUser(overrides = {}) {
  return { id: 1, displayName: "Test User", ageBand: "adult", locale: "en-US", ...overrides };
}

function makeProfile(overrides = {}) {
  return {
    userId: 1,
    defaultMode: "scientist",
    safetyTier: "standard",
    performanceTier: "balanced",
    voiceNarrationEnabled: false,
    supervisedAdvancedMode: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fail-closed behavior
// ---------------------------------------------------------------------------
describe("resolvePolicyContext – fail-closed (missing / invalid user)", () => {
  beforeEach(() => {
    getUserById.mockReturnValue(null);
    getUserProfile.mockReturnValue(null);
  });

  it("returns kids mode when userId is null", () => {
    const result = resolvePolicyContext({ userId: null });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeReason).toBe("fail_closed_missing_or_invalid_user");
    expect(result.policy.safetyTier).toBe("child_strict");
    expect(result.policy.citationRequired).toBe(false);
    expect(result.user).toBeNull();
  });

  it("returns kids mode when userId is undefined", () => {
    const result = resolvePolicyContext({ userId: undefined });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeReason).toBe("fail_closed_missing_or_invalid_user");
  });

  it("returns kids mode when userId is a non-numeric string", () => {
    const result = resolvePolicyContext({ userId: "abc" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeReason).toBe("fail_closed_missing_or_invalid_user");
  });

  it("returns kids mode when getUserById returns null for a valid-looking id", () => {
    getUserById.mockReturnValue(null);
    const result = resolvePolicyContext({ userId: 99 });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeReason).toBe("fail_closed_missing_or_invalid_user");
  });

  it("defaults performanceTier to light when fail-closed", () => {
    const result = resolvePolicyContext({ userId: null });
    expect(result.policy.performanceTier).toBe("light");
  });

  it("sets voiceNarrationEnabled to false when fail-closed", () => {
    const result = resolvePolicyContext({ userId: null });
    expect(result.policy.voiceNarrationEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Child age band
// ---------------------------------------------------------------------------
describe("resolvePolicyContext – child age band", () => {
  beforeEach(() => {
    getUserById.mockReturnValue(makeUser({ ageBand: "child" }));
    getUserProfile.mockReturnValue(makeProfile({ defaultMode: "scientist", performanceTier: "full" }));
  });

  it("always resolves to kids mode for child", () => {
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.activeMode).toBe("kids");
  });

  it("rejects a scientist mode request from a child", () => {
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeAccepted).toBe(false);
    expect(result.policy.modeReason).toBe("restricted_by_age_policy");
  });

  it("accepts a kids mode request from a child", () => {
    const result = resolvePolicyContext({ userId: 1, requestedMode: "kids" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("enforces child_strict safetyTier regardless of profile", () => {
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.safetyTier).toBe("child_strict");
  });

  it("defaults to light performanceTier for child even if profile says full", () => {
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.performanceTier).toBe("light");
  });

  it("citationRequired is false for child (always kids mode)", () => {
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.citationRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Teen age band
// ---------------------------------------------------------------------------
describe("resolvePolicyContext – teen age band", () => {
  afterEach(() => vi.restoreAllMocks());

  it("defaults to kids mode for teen without supervisedAdvancedMode", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "teen" }));
    getUserProfile.mockReturnValue(makeProfile({ supervisedAdvancedMode: false }));
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.activeMode).toBe("kids");
  });

  it("rejects scientist request for teen without supervisedAdvancedMode", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "teen" }));
    getUserProfile.mockReturnValue(makeProfile({ supervisedAdvancedMode: false }));
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeAccepted).toBe(false);
    expect(result.policy.modeReason).toBe("restricted_by_age_policy");
  });

  it("allows scientist for teen with supervisedAdvancedMode=true", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "teen" }));
    getUserProfile.mockReturnValue(makeProfile({ supervisedAdvancedMode: true, defaultMode: "scientist" }));
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.activeMode).toBe("scientist");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("always allows kids mode for teen", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "teen" }));
    getUserProfile.mockReturnValue(makeProfile({ supervisedAdvancedMode: false }));
    const result = resolvePolicyContext({ userId: 1, requestedMode: "kids" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("applies teen_guarded safetyTier when profile has none", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "teen" }));
    getUserProfile.mockReturnValue(makeProfile({ supervisedAdvancedMode: false, safetyTier: null }));
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.safetyTier).toBe("teen_guarded");
  });
});

// ---------------------------------------------------------------------------
// Adult age band
// ---------------------------------------------------------------------------
describe("resolvePolicyContext – adult age band", () => {
  beforeEach(() => {
    getUserById.mockReturnValue(makeUser({ ageBand: "adult" }));
    getUserProfile.mockReturnValue(makeProfile());
  });

  it("defaults to scientist mode for adult", () => {
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.activeMode).toBe("scientist");
  });

  it("accepts a kids mode request from adult", () => {
    const result = resolvePolicyContext({ userId: 1, requestedMode: "kids" });
    expect(result.policy.activeMode).toBe("kids");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("accepts a scientist mode request from adult", () => {
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.activeMode).toBe("scientist");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("falls back to default when an unknown mode is requested", () => {
    const result = resolvePolicyContext({ userId: 1, requestedMode: "supermode" });
    // normalizeMode returns fallback (scientist); canUseMode(adult, scientist) = true
    expect(result.policy.activeMode).toBe("scientist");
    expect(result.policy.modeAccepted).toBe(true);
  });

  it("sets standard safetyTier for adult when profile has none", () => {
    getUserProfile.mockReturnValue(makeProfile({ safetyTier: null }));
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.safetyTier).toBe("standard");
  });

  it("respects profile performanceTier for adult in scientist mode", () => {
    getUserProfile.mockReturnValue(makeProfile({ performanceTier: "full" }));
    const result = resolvePolicyContext({ userId: 1 });
    expect(result.policy.performanceTier).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// Citation required
// ---------------------------------------------------------------------------
describe("resolvePolicyContext – citationRequired", () => {
  afterEach(() => {
    delete process.env.RESEARCH_CITATION_REQUIRED;
    vi.restoreAllMocks();
  });

  it("citationRequired is true for adult in scientist mode by default", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "adult" }));
    getUserProfile.mockReturnValue(makeProfile());
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.citationRequired).toBe(true);
  });

  it("citationRequired is false when RESEARCH_CITATION_REQUIRED=false", () => {
    process.env.RESEARCH_CITATION_REQUIRED = "false";
    getUserById.mockReturnValue(makeUser({ ageBand: "adult" }));
    getUserProfile.mockReturnValue(makeProfile());
    const result = resolvePolicyContext({ userId: 1, requestedMode: "scientist" });
    expect(result.policy.citationRequired).toBe(false);
  });

  it("citationRequired is false when adult is in kids mode", () => {
    getUserById.mockReturnValue(makeUser({ ageBand: "adult" }));
    getUserProfile.mockReturnValue(makeProfile());
    const result = resolvePolicyContext({ userId: 1, requestedMode: "kids" });
    expect(result.policy.citationRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildModePolicyPrompt
// ---------------------------------------------------------------------------
describe("buildModePolicyPrompt", () => {
  it("kids mode prompt contains MODE POLICY: KIDS header", () => {
    const prompt = buildModePolicyPrompt({ activeMode: "kids" });
    expect(prompt).toContain("MODE POLICY: KIDS");
  });

  it("kids mode prompt instructs to refuse unsafe content", () => {
    const prompt = buildModePolicyPrompt({ activeMode: "kids" });
    expect(prompt).toMatch(/unsafe|refuse|safe/i);
  });

  it("scientist mode prompt contains MODE POLICY: SCIENTIST header", () => {
    const prompt = buildModePolicyPrompt({ activeMode: "scientist" });
    expect(prompt).toContain("MODE POLICY: SCIENTIST");
  });

  it("scientist mode prompt mentions evidence-grounded reasoning", () => {
    const prompt = buildModePolicyPrompt({ activeMode: "scientist" });
    expect(prompt).toMatch(/evidence/i);
  });
});
