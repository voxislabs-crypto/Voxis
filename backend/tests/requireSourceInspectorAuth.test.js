import fs from "fs";
import http from "http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import {
  SOURCE_INSPECTOR_HEADER,
  SOURCE_INSPECTOR_SECRET_ENV,
  isLoopbackAddress,
  requireSourceInspectorAuth,
  resolveListenHost,
  setSourceInspectorListenHost,
} from "../middleware/requireSourceInspectorAuth.js";
import { createSourceInspectorRouter } from "../routes/sourceInspectorRoutes.js";
import sourceInspectorRoutes from "../routes/sourceInspectorRoutes.js";

const SECRET = "inspector-secret-do-not-leak";
const ORIGINAL = {
  HOST: process.env.HOST,
  VOXIS_LOCAL: process.env.VOXIS_LOCAL,
  ALLOW_MISSING_CLERK_KEYS: process.env.ALLOW_MISSING_CLERK_KEYS,
  VOXIS_INTERNAL_SECRET: process.env.VOXIS_INTERNAL_SECRET,
  [SOURCE_INSPECTOR_SECRET_ENV]: process.env[SOURCE_INSPECTOR_SECRET_ENV],
};

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  requireSourceInspectorAuth(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

function allowedRequest(headers = {}) {
  return {
    headers,
    socket: { remoteAddress: "127.0.0.1" },
    query: { [SOURCE_INSPECTOR_HEADER]: SECRET },
    ip: "127.0.0.1",
  };
}

afterEach(() => {
  restoreEnv("HOST", ORIGINAL.HOST);
  restoreEnv("VOXIS_LOCAL", ORIGINAL.VOXIS_LOCAL);
  restoreEnv("ALLOW_MISSING_CLERK_KEYS", ORIGINAL.ALLOW_MISSING_CLERK_KEYS);
  restoreEnv("VOXIS_INTERNAL_SECRET", ORIGINAL.VOXIS_INTERNAL_SECRET);
  restoreEnv(SOURCE_INSPECTOR_SECRET_ENV, ORIGINAL[SOURCE_INSPECTOR_SECRET_ENV]);
  setSourceInspectorListenHost("");
});

describe("requireSourceInspectorAuth", () => {
  it("fails closed when the inspector secret is missing", () => {
    delete process.env[SOURCE_INSPECTOR_SECRET_ENV];
    process.env.HOST = "127.0.0.1";
    process.env.VOXIS_LOCAL = "true";
    process.env.ALLOW_MISSING_CLERK_KEYS = "true";
    const { res, nextCalled } = run(allowedRequest({
      [SOURCE_INSPECTOR_HEADER]: SECRET,
    }));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Source inspector authorization failed." });
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it("rejects the internal sidecar secret and development-mode identity", () => {
    process.env.HOST = "127.0.0.1";
    process.env.VOXIS_LOCAL = "true";
    process.env.VOXIS_INTERNAL_SECRET = "sidecar-secret-value";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    const { res, nextCalled } = run(allowedRequest({
      "x-voxis-internal-key": "sidecar-secret-value",
      authorization: `Bearer ${SECRET}`,
    }));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(JSON.stringify(res.body)).not.toContain("sidecar-secret-value");
  });

  it("rejects a wrong secret from loopback without echoing it", () => {
    process.env.HOST = "127.0.0.1";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    const provided = "wrong-inspector-secret-value";
    const calls = [];
    const methods = ["log", "info", "warn", "error", "debug"];
    const originals = Object.fromEntries(methods.map((method) => [method, console[method]]));
    for (const method of methods) {
      console[method] = (...args) => calls.push(args.map(String).join(" "));
    }
    try {
      const { res, nextCalled } = run(allowedRequest({
        [SOURCE_INSPECTOR_HEADER]: provided,
      }));
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(401);
      const rendered = `${JSON.stringify(res.body)}\n${calls.join("\n")}`;
      expect(rendered).not.toContain(SECRET);
      expect(rendered).not.toContain(provided);
    } finally {
      for (const method of methods) console[method] = originals[method];
    }
  });

  it("rejects a non-loopback peer even when req.ip is loopback", () => {
    process.env.HOST = "127.0.0.1";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    const { res, nextCalled } = run({
      headers: { [SOURCE_INSPECTOR_HEADER]: SECRET },
      socket: { remoteAddress: "10.0.0.8" },
      ip: "127.0.0.1",
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a missing socket address", () => {
    process.env.HOST = "127.0.0.1";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    const { nextCalled, res } = run({
      headers: { [SOURCE_INSPECTOR_HEADER]: SECRET },
      socket: {},
      ip: "127.0.0.1",
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-loopback bind host recorded by the server", () => {
    process.env.HOST = "127.0.0.1";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    setSourceInspectorListenHost("0.0.0.0");
    const { res, nextCalled } = run(allowedRequest({
      [SOURCE_INSPECTOR_HEADER]: SECRET,
    }));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(resolveListenHost({ HOST: "localhost" })).toBe("localhost");
    expect(isLoopbackAddress("localhost")).toBe(false);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects when HOST itself is not loopback", () => {
    process.env.HOST = "0.0.0.0";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    const { nextCalled } = run(allowedRequest({
      [SOURCE_INSPECTOR_HEADER]: SECRET,
    }));
    expect(nextCalled).toBe(false);
  });

  it("accepts the inspector header from a loopback peer on a loopback bind", () => {
    process.env.HOST = "::1";
    process.env.VOXIS_LOCAL = "true";
    process.env.VOXIS_INTERNAL_SECRET = "sidecar-secret-value";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    for (const remoteAddress of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const { nextCalled, res } = run({
        headers: { [SOURCE_INSPECTOR_HEADER]: `  ${SECRET}  ` },
        socket: { remoteAddress },
        ip: "10.0.0.8",
      });
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    }
  });
});

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(port, { path: urlPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method: "POST",
      headers: {
        ...(payload
          ? {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
          }
          : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        resolve({ status: res.statusCode, body: parsed, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("source inspector routes", () => {
  it("mounts the gate on its own router, separate from the internal sidecar", () => {
    expect(sourceInspectorRoutes.stack[0].handle).toBe(requireSourceInspectorAuth);
    const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
    const internalSource = fs.readFileSync(new URL("../routes/internalChatRoutes.js", import.meta.url), "utf8");
    expect(serverSource).toContain('app.use("/api/source-inspector", sourceInspectorRoutes);');
    expect(serverSource).not.toContain('app.use("/api/internal", sourceInspectorRoutes)');
    expect(internalSource).not.toContain("sourceInspector");
    expect(serverSource).not.toContain("app.use(councilRoutes)");
  });

  it("rejects unauthenticated HTTP calls, query secrets, and body secrets", async () => {
    process.env.HOST = "127.0.0.1";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    let called = false;
    const app = express();
    app.use(express.json());
    app.use("/api/source-inspector", createSourceInspectorRouter({
      discover: () => {
        called = true;
        return { files: [], truncated: false, limit: 1 };
      },
    }));
    const server = await listen(app);
    try {
      const port = server.address().port;
      const missing = await request(port, { path: "/api/source-inspector/discover", body: {} });
      const fromQuery = await request(port, {
        path: `/api/source-inspector/discover?${SOURCE_INSPECTOR_HEADER}=${encodeURIComponent(SECRET)}`,
        body: { secret: SECRET, root: "C:\\Windows" },
      });

      expect(missing.status).toBe(401);
      expect(fromQuery.status).toBe(401);
      expect(fromQuery.text).not.toContain(SECRET);
      expect(called).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("passes a picked request to the handler only after the inspector header matches", async () => {
    process.env.HOST = "127.0.0.1";
    process.env.VOXIS_LOCAL = "true";
    process.env[SOURCE_INSPECTOR_SECRET_ENV] = SECRET;
    let received = null;
    const app = express();
    app.use(express.json());
    app.use("/api/source-inspector", createSourceInspectorRouter({
      discover: (request) => {
        received = request;
        return { files: [], truncated: false, limit: request.limit };
      },
    }));
    const server = await listen(app);
    try {
      const port = server.address().port;
      const response = await request(port, {
        path: "/api/source-inspector/discover",
        headers: { [SOURCE_INSPECTOR_HEADER]: SECRET },
        body: { dir: "src", limit: 1, root: "C:\\Windows", secret: SECRET },
      });

      expect(response.status).toBe(200);
      expect(received).toEqual({ dir: "src", limit: 1 });
      expect(response.text).not.toContain(SECRET);
      expect(response.text).not.toContain("C:\\\\Windows");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
