import { afterEach, describe, expect, it } from "vitest";

import { requireInternalAuth } from "../middleware/requireInternalAuth.js";

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function run(req) {
  const res = mockRes();
  let nextCalled = false;
  requireInternalAuth(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe("requireInternalAuth", () => {
  const original = process.env.VOXIS_INTERNAL_SECRET;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VOXIS_INTERNAL_SECRET;
    } else {
      process.env.VOXIS_INTERNAL_SECRET = original;
    }
  });

  it("allows loopback when no secret is configured", () => {
    delete process.env.VOXIS_INTERNAL_SECRET;
    const { res, nextCalled } = run({
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it("rejects a remote caller when no secret is configured", () => {
    delete process.env.VOXIS_INTERNAL_SECRET;
    const { res, nextCalled } = run({
      headers: {},
      socket: { remoteAddress: "10.0.0.8" },
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("accepts the shared secret from the internal header", () => {
    process.env.VOXIS_INTERNAL_SECRET = "sidecar-secret";
    const { nextCalled } = run({
      headers: { "x-voxis-internal-key": "sidecar-secret" },
      socket: { remoteAddress: "10.0.0.8" },
    });
    expect(nextCalled).toBe(true);
  });

  it("accepts the shared secret as a bearer token", () => {
    process.env.VOXIS_INTERNAL_SECRET = "sidecar-secret";
    const { nextCalled } = run({
      headers: { authorization: "Bearer sidecar-secret" },
      socket: { remoteAddress: "::ffff:10.0.0.8" },
    });
    expect(nextCalled).toBe(true);
  });

  it("rejects a wrong secret even from loopback", () => {
    process.env.VOXIS_INTERNAL_SECRET = "sidecar-secret";
    const { res, nextCalled } = run({
      headers: { "x-voxis-internal-key": "nope" },
      socket: { remoteAddress: "::1" },
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
