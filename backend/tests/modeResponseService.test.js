import { describe, it, expect } from "vitest";
import {
  detectKidsUnsafeInput,
  buildKidsSafetyRedirect,
  simplifyKidsReply,
  simplifyKidsReplyByAge,
  estimateReadabilityGrade,
  validateScientistReply,
  validateScientistCitationRanges,
  buildScientistRepairPrompt,
} from "../services/modeResponseService.js";

// ---------------------------------------------------------------------------
// detectKidsUnsafeInput
// ---------------------------------------------------------------------------
describe("detectKidsUnsafeInput – safe inputs", () => {
  it("returns null for empty string", () => {
    expect(detectKidsUnsafeInput("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(detectKidsUnsafeInput(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(detectKidsUnsafeInput(undefined)).toBeNull();
  });

  it("returns null for clearly safe content", () => {
    expect(detectKidsUnsafeInput("What is the capital of France?")).toBeNull();
  });

  it("returns null for numbers-only input", () => {
    expect(detectKidsUnsafeInput("12345")).toBeNull();
  });
});

describe("detectKidsUnsafeInput – blocked inputs", () => {
  it("blocks sexual content", () => {
    const result = detectKidsUnsafeInput("Tell me about sex");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("unsafe_topic");
  });

  it("blocks violence keyword (kill)", () => {
    const result = detectKidsUnsafeInput("How do I kill a bug?");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("blocks self-harm keyword", () => {
    const result = detectKidsUnsafeInput("I want to hurt myself");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("blocks drug references", () => {
    const result = detectKidsUnsafeInput("What is cocaine?");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("blocks hate speech keywords", () => {
    const result = detectKidsUnsafeInput("I hate nazis");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("blocks hack/malware keywords", () => {
    const result = detectKidsUnsafeInput("Show me how to write malware");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("is case-insensitive (uppercase trigger)", () => {
    const result = detectKidsUnsafeInput("PORN is bad");
    expect(result).not.toBeNull();
    expect(result.blocked).toBe(true);
  });

  it("includes pattern string in result", () => {
    const result = detectKidsUnsafeInput("shoot the target");
    expect(result).not.toBeNull();
    expect(typeof result.pattern).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// buildKidsSafetyRedirect
// ---------------------------------------------------------------------------
describe("buildKidsSafetyRedirect", () => {
  it("returns a non-empty string", () => {
    const redirect = buildKidsSafetyRedirect();
    expect(typeof redirect).toBe("string");
    expect(redirect.length).toBeGreaterThan(0);
  });

  it("does not contain any unsafe content itself", () => {
    const redirect = buildKidsSafetyRedirect();
    expect(detectKidsUnsafeInput(redirect)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// simplifyKidsReply
// ---------------------------------------------------------------------------
describe("simplifyKidsReply", () => {
  it("returns fallback for null input", () => {
    const result = simplifyKidsReply(null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns fallback for empty string", () => {
    const result = simplifyKidsReply("");
    expect(result).toBeTruthy();
  });

  it("returns text under word limit unchanged (normalized)", () => {
    const short = "The cat sat on the mat.";
    expect(simplifyKidsReply(short)).toBe(short);
  });

  it("truncates text over the word limit", () => {
    const long = Array(100).fill("word").join(" ") + ".";
    const result = simplifyKidsReply(long, 70); // default maxWords=70
    const wordCount = result.replace(/\.\.\.$/, "").split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(70);
  });

  it("appends '...' when truncated", () => {
    const long = Array(200).fill("word").join(" ");
    const result = simplifyKidsReply(long, 70);
    expect(result.endsWith("...")).toBe(true);
  });

  it("respects maxSentences limit", () => {
    const threeSentences = "First sentence. Second sentence. Third sentence.";
    const result = simplifyKidsReply(threeSentences, 200, 2);
    // Only first two sentences should appear
    const sentenceCount = (result.match(/\./g) || []).length;
    expect(sentenceCount).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// simplifyKidsReplyByAge
// ---------------------------------------------------------------------------
describe("simplifyKidsReplyByAge", () => {
  it("returns an object with text, gradeBefore, gradeAfter", () => {
    const result = simplifyKidsReplyByAge("The cat sat.", "child");
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("gradeBefore");
    expect(result).toHaveProperty("gradeAfter");
  });

  it("child target grade is stricter (fewer words) than teen", () => {
    const text = Array(120).fill("word").join(" ");
    const childResult = simplifyKidsReplyByAge(text, "child");
    const teenResult = simplifyKidsReplyByAge(text, "teen");
    const childWords = childResult.text.split(/\s+/).filter(Boolean).length;
    const teenWords = teenResult.text.split(/\s+/).filter(Boolean).length;
    expect(childWords).toBeLessThanOrEqual(teenWords);
  });
});

// ---------------------------------------------------------------------------
// estimateReadabilityGrade
// ---------------------------------------------------------------------------
describe("estimateReadabilityGrade", () => {
  it("returns 0 for empty string", () => {
    expect(estimateReadabilityGrade("")).toBe(0);
  });

  it("returns a non-negative number", () => {
    const grade = estimateReadabilityGrade("The cat sat on the mat.");
    expect(grade).toBeGreaterThanOrEqual(0);
  });

  it("returns a higher grade for complex academic text", () => {
    const simple = "The dog runs.";
    const complex =
      "The epistemological implications of quantum superposition fundamentally challenge conventional frameworks of deterministic causality and metaphysical ontology.";
    expect(estimateReadabilityGrade(complex)).toBeGreaterThan(
      estimateReadabilityGrade(simple)
    );
  });

  it("returns a number with at most 2 decimal places", () => {
    const grade = estimateReadabilityGrade("Some text here. More words for testing.");
    expect(Number.isFinite(grade)).toBe(true);
    expect(String(grade).replace(/^\d+\.?/, "").length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// validateScientistReply
// ---------------------------------------------------------------------------
describe("validateScientistReply – valid reply", () => {
  const wellFormed = [
    "1) Answer\nThe sky is blue.",
    "2) Evidence\nLight scattering [S1].",
    "3) Uncertainty\nVariations exist.",
    "4) Next Questions\nWhat causes green sunsets?",
  ].join("\n\n");

  it("returns valid=true for a complete reply", () => {
    const result = validateScientistReply(wellFormed, { citationRequired: false });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects hasCitation when [S#] is present", () => {
    const result = validateScientistReply(wellFormed, { citationRequired: false });
    expect(result.hasCitation).toBe(true);
  });

  it("citationRequired=true passes when [S#] is present", () => {
    const result = validateScientistReply(wellFormed, { citationRequired: true });
    expect(result.valid).toBe(true);
  });
});

describe("validateScientistReply – missing sections", () => {
  it("reports missing_answer_section when Answer is absent", () => {
    const reply = "2) Evidence\nFacts. 3) Uncertainty\nNone. 4) Next Questions\nNone.";
    const result = validateScientistReply(reply);
    expect(result.violations).toContain("missing_answer_section");
    expect(result.valid).toBe(false);
  });

  it("reports missing_evidence_section when Evidence is absent", () => {
    const reply = "1) Answer\nOkay. 3) Uncertainty\nNone. 4) Next Questions\nNone.";
    const result = validateScientistReply(reply);
    expect(result.violations).toContain("missing_evidence_section");
  });

  it("reports missing_uncertainty_section when Uncertainty is absent", () => {
    const reply = "1) Answer\nYep. 2) Evidence\nFacts. 4) Next Questions\nNone.";
    const result = validateScientistReply(reply);
    expect(result.violations).toContain("missing_uncertainty_section");
  });

  it("reports missing_next_questions_section when Next Questions is absent", () => {
    const reply = "1) Answer\nYep. 2) Evidence\nFacts. 3) Uncertainty\nNone.";
    const result = validateScientistReply(reply);
    expect(result.violations).toContain("missing_next_questions_section");
  });

  it("collects all violations in a single pass", () => {
    const result = validateScientistReply("nothing here");
    expect(result.violations).toHaveLength(4); // all four sections missing
    expect(result.valid).toBe(false);
  });

  it("reports missing_citations when citationRequired but no [S#]", () => {
    const noCitation = [
      "1) Answer\nYes.",
      "2) Evidence\nTrust me.",
      "3) Uncertainty\nSome.",
      "4) Next Questions\nWhy?",
    ].join("\n");
    const result = validateScientistReply(noCitation, { citationRequired: true });
    expect(result.violations).toContain("missing_citations");
    expect(result.valid).toBe(false);
  });

  it("does NOT report missing_citations when citationRequired=false and no [S#]", () => {
    const noCitation = [
      "1) Answer\nYes.",
      "2) Evidence\nTrust me.",
      "3) Uncertainty\nSome.",
      "4) Next Questions\nWhy?",
    ].join("\n");
    const result = validateScientistReply(noCitation, { citationRequired: false });
    expect(result.violations).not.toContain("missing_citations");
    expect(result.valid).toBe(true);
  });

  it("handles null/empty reply gracefully", () => {
    const result = validateScientistReply(null);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateScientistCitationRanges
// ---------------------------------------------------------------------------
describe("validateScientistCitationRanges", () => {
  it("returns valid=true when there are no citations", () => {
    const result = validateScientistCitationRanges("No citations here.", 5);
    expect(result.valid).toBe(true);
    expect(result.invalid).toHaveLength(0);
  });

  it("returns valid=true when all citations are in range", () => {
    const result = validateScientistCitationRanges("See [S1] and [S3].", 3);
    expect(result.valid).toBe(true);
  });

  it("flags a citation that exceeds availableSourceCount", () => {
    const result = validateScientistCitationRanges("See [S4].", 3);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain("[S4]");
  });

  it("flags [S0] as invalid (1-based indexing)", () => {
    const result = validateScientistCitationRanges("See [S0].", 3);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain("[S0]");
  });

  it("handles availableSourceCount=0 (any citation is invalid)", () => {
    const result = validateScientistCitationRanges("See [S1].", 0);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain("[S1]");
  });

  it("reports availableSourceCount in the result", () => {
    const result = validateScientistCitationRanges("text", 7);
    expect(result.availableSourceCount).toBe(7);
  });

  it("handles multiple invalid citations simultaneously", () => {
    const result = validateScientistCitationRanges("See [S0] and [S9] and [S2].", 3);
    expect(result.valid).toBe(false);
    expect(result.invalid).toContain("[S0]");
    expect(result.invalid).toContain("[S9]");
    expect(result.invalid).not.toContain("[S2]"); // S2 is valid
  });
});

// ---------------------------------------------------------------------------
// buildScientistRepairPrompt
// ---------------------------------------------------------------------------
describe("buildScientistRepairPrompt", () => {
  it("includes the draft content", () => {
    const prompt = buildScientistRepairPrompt({ draft: "My draft text", citationRequired: false });
    expect(prompt).toContain("My draft text");
  });

  it("mentions all four required sections", () => {
    const prompt = buildScientistRepairPrompt({ draft: "draft", citationRequired: false });
    expect(prompt).toMatch(/Answer/);
    expect(prompt).toMatch(/Evidence/);
    expect(prompt).toMatch(/Uncertainty/);
    expect(prompt).toMatch(/Next Questions/);
  });

  it("includes citation requirement instruction when citationRequired=true", () => {
    const prompt = buildScientistRepairPrompt({ draft: "draft", citationRequired: true });
    expect(prompt).toMatch(/\[S#\]/);
  });

  it("does not demand citations when citationRequired=false", () => {
    const prompt = buildScientistRepairPrompt({ draft: "draft", citationRequired: false });
    expect(prompt).not.toMatch(/Citations are required/i);
  });
});
