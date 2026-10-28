import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, getUserByClerkId, createUser } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getUserByClerkId: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  verifyToken,
}));

vi.mock("../models/userModel.js", () => ({
  getUserByClerkId,
  createUser,
}));

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityCountByOwner: vi.fn(() => 1),
  transferPersonalitiesToOwner: vi.fn(() => 0),
}));

const { clerkVerify, requireAuth } = await import("../middleware/requireAuth.js");

function mockRes() {
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

describe("VOXIS_LOCAL clerk gate", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...env };
    process.env.ALLOW_MISSING_CLERK_KEYS = "false";
    delete process.env.VOXIS_LOCAL;
    getUserByClerkId.mockReturnValue({ id: 1, clerkId: "1", displayName: "Dev User" });
    verifyToken.mockResolvedValue({ sub: "user_123" });
  });

  it("returns 401 when VOXIS_LOCAL is unset and no session is present", async () => {
    const res = mockRes();
    const next = vi.fn();

    await requireAuth({ auth: null, headers: {} }, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required." });
    expect(next).not.toHaveBeenCalled();
  });

  it("skips session verification and provisions the dev user when VOXIS_LOCAL is true", async () => {
    process.env.VOXIS_LOCAL = "true";
    const req = { headers: { authorization: "Bearer not-a-session" } };
    const next = vi.fn();

    await clerkVerify(req, {}, next);

    expect(verifyToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    const res = mockRes();
    const authNext = vi.fn();
    await requireAuth(req, res, authNext);

    expect(authNext).toHaveBeenCalledTimes(1);
    expect(req.clerkUserId).toBe("1");
    expect(req.voxisUser.displayName).toBe("Dev User");
    expect(getUserByClerkId).toHaveBeenCalledWith("1");
  });

  it("still verifies a bearer token when VOXIS_LOCAL is unset", async () => {
    const req = { headers: { authorization: "Bearer session-token" } };
    const next = vi.fn();

    await clerkVerify(req, {}, next);

    expect(verifyToken).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({ userId: "user_123" });
  });
});
