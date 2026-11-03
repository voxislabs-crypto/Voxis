import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedActor = vi.fn();
const mockResolveOwnedPersona = vi.fn();
const mockResolvePolicyContext = vi.fn();
const mockGetChatMessages = vi.fn();

vi.mock("../gatekeeper/authorization.js", () => ({
  getAuthenticatedActor: mockGetAuthenticatedActor,
  resolveOwnedPersona: mockResolveOwnedPersona,
}));

vi.mock("../services/policyService.js", () => ({
  buildScientistEvidencePrompt: vi.fn(() => ""),
  buildModePolicyPrompt: vi.fn(() => ""),
  resolvePolicyContext: mockResolvePolicyContext,
}));

vi.mock("../models/chatModel.js", () => ({
  createChatMessage: vi.fn(),
  getChatMessages: mockGetChatMessages,
  getRecentChatMessages: vi.fn(),
  getChatMessageCount: vi.fn(),
  getLatestModeForUserPersonality: vi.fn(),
  embedChatMessageAsync: vi.fn(),
  searchRawChatHistory: vi.fn(),
}));

const { chatHandler, chatHistoryHandler } = await import("../controllers/chatController.js");

function response() {
  const res = { statusCode: 200, body: null, headersSent: false };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn();
  res.write = vi.fn();
  res.end = vi.fn();
  res.on = vi.fn();
  return res;
}

describe("chat identity authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedActor.mockReturnValue({ localUserId: 7, clerkUserId: "user_7" });
    mockResolvePolicyContext.mockReturnValue({ policy: { userId: 7, activeMode: "normal" } });
  });

  it("uses the authenticated actor rather than a forged body userId", async () => {
    const req = {
      body: { personalityId: 24, message: "hello", userId: 999, mode: "normal" },
      voxisUser: { id: 7 },
    };
    const res = response();

    mockResolveOwnedPersona.mockReturnValue(null);
    await chatHandler(req, res, vi.fn());

    expect(mockResolvePolicyContext).toHaveBeenCalledWith({ userId: 7, requestedMode: "normal" });
    expect(mockResolveOwnedPersona).toHaveBeenCalledWith(req, res, 24);
  });

  it("rejects inaccessible persona history before querying messages", () => {
    const req = { params: { id: "24" }, voxisUser: { id: 7 } };
    const res = response();

    mockResolveOwnedPersona.mockReturnValue(null);
    chatHistoryHandler(req, res, vi.fn());

    expect(mockResolveOwnedPersona).toHaveBeenCalledWith(req, res, 24);
    expect(mockGetChatMessages).not.toHaveBeenCalled();
  });
});
