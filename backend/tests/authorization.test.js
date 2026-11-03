import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockGetMemoryFactById = vi.fn();
const mockGetPersonaPreferenceById = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../models/memoryModel.js", () => ({
  getMemoryFactById: mockGetMemoryFactById,
}));

vi.mock("../models/preferencesModel.js", () => ({
  getPersonaPreferenceById: mockGetPersonaPreferenceById,
}));

const {
  getAuthenticatedActor,
  isAdminActor,
  requireSelfOrAdmin,
  resolveOwnedPersona,
  resolveOwnedMemory,
  resolveOwnedPreference,
} = await import("../gatekeeper/authorization.js");

function response() {
  const res = { statusCode: 200, body: null };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe("Gatekeeper authorization", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...savedEnv };
    delete process.env.VOXIS_LOCAL;
    delete process.env.ALLOW_MISSING_CLERK_KEYS;
    delete process.env.ADMIN_CLERK_IDS;
  });

  it("uses the server-attached local user as the actor", () => {
    expect(getAuthenticatedActor({ voxisUser: { id: 7 }, clerkUserId: "user_7" })).toEqual({
      localUserId: 7,
      clerkUserId: "user_7",
    });
    expect(getAuthenticatedActor({ voxisUser: { id: "not-an-id" } })).toBeNull();
  });

  it("fails closed for administration without an explicit admin or local development mode", () => {
    const req = { voxisUser: { id: 7 }, clerkUserId: "user_7" };
    expect(isAdminActor(req)).toBe(false);

    process.env.ADMIN_CLERK_IDS = "user_admin";
    expect(isAdminActor(req)).toBe(false);
    expect(isAdminActor({ ...req, clerkUserId: "user_admin" })).toBe(true);
  });

  it("allows only the authenticated user or an explicit admin through self-scoped routes", () => {
    const middleware = requireSelfOrAdmin();
    const next = vi.fn();
    const denied = response();

    middleware({ voxisUser: { id: 7 }, clerkUserId: "user_7", params: { id: "8" } }, denied, next);
    expect(next).not.toHaveBeenCalled();
    expect(denied.statusCode).toBe(404);

    const allowed = response();
    middleware({ voxisUser: { id: 7 }, clerkUserId: "user_7", params: { id: "7" } }, allowed, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("queries personas with the authenticated local owner id", () => {
    const persona = { id: 24, ownerId: 7, name: "Ara" };
    mockGetPersonalityById.mockReturnValue(persona);
    const res = response();

    expect(resolveOwnedPersona({ voxisUser: { id: 7 } }, res, "24")).toBe(persona);
    expect(mockGetPersonalityById).toHaveBeenCalledWith(24, 7);
  });

  it("authorizes memory and preference records through their parent personality", () => {
    const res = response();
    mockGetMemoryFactById.mockReturnValue({ id: 12, personalityId: 24 });
    mockGetPersonaPreferenceById.mockReturnValue({ id: 13, personalityId: 24 });
    mockGetPersonalityById.mockReturnValue({ id: 24, ownerId: 7 });
    const req = { voxisUser: { id: 7 } };

    expect(resolveOwnedMemory(req, res, 12)?.memory.id).toBe(12);
    expect(resolveOwnedPreference(req, res, 13)?.preference.id).toBe(13);
    expect(mockGetPersonalityById).toHaveBeenCalledWith(24, 7);
  });
});
