import { beforeEach, describe, expect, it } from "vitest";

const { isAllowedCorsOrigin } = await import("../gatekeeper/corsPolicy.js");

describe("production CORS policy", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.VOXIS_LOCAL;
    delete process.env.ALLOW_MISSING_CLERK_KEYS;
    process.env.VOXIS_ALLOWED_ORIGINS = "https://app.voxis.example, https://desktop.voxis.example";
  });

  it("allows configured browser origins and non-browser clients", () => {
    expect(isAllowedCorsOrigin("https://app.voxis.example")).toBe(true);
    expect(isAllowedCorsOrigin("https://desktop.voxis.example")).toBe(true);
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
  });

  it("does not reflect unconfigured credentialed browser origins", () => {
    expect(isAllowedCorsOrigin("https://untrusted.example")).toBe(false);
  });

  it("permits broad origins only in explicit local mode", () => {
    process.env.VOXIS_LOCAL = "true";
    expect(isAllowedCorsOrigin("http://localhost:3100")).toBe(true);
  });
});
