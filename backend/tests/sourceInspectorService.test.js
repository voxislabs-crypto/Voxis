import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_REPO_ROOT,
  InspectorError,
  LIMITS,
  createSourceInspector,
  redactSensitiveText,
} from "../services/sourceInspectorService.js";

function fileSymlinksAllowed() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-symlink-"));
  const target = path.join(probe, "target.txt");
  try {
    fs.writeFileSync(target, "x");
    fs.symlinkSync(target, path.join(probe, "link.txt"), "file");
    return true;
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") return false;
    throw error;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

const FILE_SYMLINKS = fileSymlinksAllowed();
const cleanups = [];

function track(root, outside = "", linkPath = "") {
  cleanups.push(() => {
    if (linkPath) fs.rmSync(linkPath, { recursive: false, force: true });
    if (root) fs.rmSync(root, { recursive: true, force: true });
    if (outside) fs.rmSync(outside, { recursive: true, force: true });
  });
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-"));
  track(root);
  return root;
}

function expectError(fn, status) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InspectorError);
    expect(error.statusCode).toBe(status);
    return error;
  }
  throw new Error(`expected InspectorError ${status}`);
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

describe("source inspector", () => {
  it("defaults to the Voxis repository root", () => {
    expect(fs.existsSync(path.join(DEFAULT_REPO_ROOT, "backend", "package.json"))).toBe(true);
  });

  it("discovers eligible source files and omits secrets, caches, and vendor trees", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "mcps", "tools"), { recursive: true });
    fs.mkdirSync(path.join(root, "voice-samples"), { recursive: true });
    fs.mkdirSync(path.join(root, "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "app.js"), "export const ready = true;\n");
    fs.writeFileSync(path.join(root, ".env"), "API_KEY=super-secret\nNEEDLE\n");
    fs.writeFileSync(path.join(root, "nested", ".env.local"), "TOKEN=also-secret\n");
    fs.writeFileSync(path.join(root, "data.sqlite"), "not-a-database");
    fs.writeFileSync(path.join(root, "mcps", "tools", "tool.json"), "{\"name\":\"tool\"}\n");
    fs.writeFileSync(path.join(root, "voice-samples", "clip.txt"), "sample\n");
    fs.writeFileSync(path.join(root, "id_rsa"), "private-key\n");
    fs.writeFileSync(path.join(root, "cert.pem"), "-----BEGIN CERT-----\n");
    fs.writeFileSync(path.join(root, "credentials.json"), "{\"key\":\"x\"}\n");
    fs.writeFileSync(path.join(root, "photo.png"), "png");

    const inspector = createSourceInspector({ root });
    const found = inspector.discover({}).files.map((file) => file.path);

    expect(found).toEqual(["src/app.js"]);
    expect(JSON.stringify(found)).not.toContain(":\\");
  });

  it("caps discovery results without marking an exact fit as truncated", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "a.js"), "a\n");
    fs.writeFileSync(path.join(root, "b.js"), "b\n");
    const inspector = createSourceInspector({ root });

    expect(inspector.discover({ limit: 1 }).truncated).toBe(true);
    expect(inspector.discover({ limit: 2 }).truncated).toBe(false);
    expect(inspector.discover({ limit: 2 }).files).toHaveLength(2);
  });

  it("returns accurate line numbers and preserves CRLF boundaries", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "sample.js"), "alpha\r\nbeta\r\ngamma\r\n");
    const inspector = createSourceInspector({ root });

    expect(inspector.read({ path: "sample.js", startLine: 2, endLine: 3 })).toEqual({
      path: "sample.js",
      startLine: 2,
      endLine: 3,
      totalLines: 3,
      truncated: false,
      content: "beta\ngamma",
    });
  });

  it("truncates reads at the line cap", () => {
    const root = makeRoot();
    const lines = Array.from({ length: LIMITS.maxReadLines + 5 }, (_, index) => `L${index + 1}`);
    fs.writeFileSync(path.join(root, "long.js"), `${lines.join("\n")}\n`);
    const inspector = createSourceInspector({ root });
    const result = inspector.read({ path: "long.js" });

    expect(result.totalLines).toBe(LIMITS.maxReadLines + 5);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(LIMITS.maxReadLines);
    expect(result.truncated).toBe(true);
    expect(result.content.split("\n")).toHaveLength(LIMITS.maxReadLines);
    expect(result.content.endsWith(`L${LIMITS.maxReadLines}`)).toBe(true);
  });

  it("rejects files over the size limit without reading them into the result", () => {
    const root = makeRoot();
    const file = path.join(root, "big.js");
    fs.writeFileSync(file, Buffer.alloc(LIMITS.maxFileBytes + 1, 97));
    const before = fs.readFileSync(file);
    const inspector = createSourceInspector({ root });

    const error = expectError(() => inspector.read({ path: "big.js" }), 413);
    expect(error.message).toBe("File exceeds the source inspector size limit.");
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(inspector.discover({}).files.map((entry) => entry.path)).toContain("big.js");
  });

  it("rejects path traversal, absolute paths, and null bytes", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-parent-"));
    const root = path.join(parent, "repo");
    fs.mkdirSync(root);
    const outside = path.join(parent, "secret.txt");
    fs.writeFileSync(outside, "OUTSIDE-SECRET");
    fs.writeFileSync(path.join(root, "ok.js"), "inside\n");
    track(parent);

    const inspector = createSourceInspector({ root });
    for (const relativePath of ["../secret.txt", "..\\secret.txt", "ok.js/../../secret.txt", "/etc/passwd", "C:\\Windows\\win.ini", "ok.js\0.js"]) {
      const error = expectError(() => inspector.read({ path: relativePath }), 400);
      expect(error.message).not.toContain("OUTSIDE-SECRET");
    }
    expect(fs.readFileSync(outside, "utf8")).toBe("OUTSIDE-SECRET");
  });

  it("rejects a directory junction that points outside the root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-out-"));
    const linkPath = path.join(root, "escape");
    fs.writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE-SECRET");
    fs.symlinkSync(outside, linkPath, "junction");
    track(root, outside, linkPath);

    const inspector = createSourceInspector({ root });
    const error = expectError(() => inspector.read({ path: "escape/secret.txt" }), 400);
    expect(error.message).toBe("Path is outside the repository root.");
    expect(error.message).not.toContain("OUTSIDE-SECRET");
    expect(inspector.discover({}).files.map((file) => file.path)).not.toContain("escape/secret.txt");
    expect(JSON.stringify(inspector.search({ query: "OUTSIDE-SECRET" }))).not.toContain("OUTSIDE-SECRET");
    expect(fs.readFileSync(path.join(outside, "secret.txt"), "utf8")).toBe("OUTSIDE-SECRET");
  });

  it.skipIf(!FILE_SYMLINKS)("rejects a symlink whose real target is a sensitive file inside the root", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, ".env"), "API_KEY=super-secret\n");
    fs.symlinkSync(path.join(root, ".env"), path.join(root, "alias.txt"), "file");

    const inspector = createSourceInspector({ root });
    expectError(() => inspector.read({ path: "alias.txt" }), 403);
  });

  it("refuses explicit reads of environment, key, database, voice, and mcp paths", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "mcps"), { recursive: true });
    fs.mkdirSync(path.join(root, "voice-samples"), { recursive: true });
    fs.writeFileSync(path.join(root, ".env"), "API_KEY=super-secret\n");
    fs.writeFileSync(path.join(root, "mcps", "tool.json"), "{\"ok\":true}\n");
    fs.writeFileSync(path.join(root, "voice-samples", "clip.txt"), "sample\n");
    fs.writeFileSync(path.join(root, "data.sqlite"), "db");
    const inspector = createSourceInspector({ root });

    for (const relativePath of [".env", "mcps/tool.json", "voice-samples/clip.txt", "data.sqlite"]) {
      const error = expectError(() => inspector.read({ path: relativePath }), 403);
      expect(error.message).not.toContain("super-secret");
    }
  });

  it("redacts secret-shaped values in source excerpts", () => {
    const root = makeRoot();
    const raw = 'const apiKey = "sk-testsecretvalue";\nconst password = "hunter2hunter2";\n';
    fs.writeFileSync(path.join(root, "keys.js"), raw);
    const inspector = createSourceInspector({ root });
    const result = inspector.read({ path: "keys.js" });

    expect(result.content).toContain("[redacted]");
    expect(result.content).not.toContain("sk-testsecretvalue");
    expect(result.content).not.toContain("hunter2hunter2");
    expect(redactSensitiveText("Authorization: Bearer abcdefghijklmnop")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("caps search results and skips oversized or excluded files", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, "a.js"), "nope\nrepeat-needle\n");
    fs.writeFileSync(path.join(root, "b.js"), "repeat-needle\n");
    fs.writeFileSync(path.join(root, "c.js"), "repeat-needle\n");
    fs.writeFileSync(path.join(root, ".env"), "repeat-needle\nAPI_KEY=super-secret\n");
    fs.writeFileSync(path.join(root, "big.js"), Buffer.concat([
      Buffer.from("repeat-needle\n"),
      Buffer.alloc(LIMITS.maxFileBytes, 97),
    ]));
    const inspector = createSourceInspector({ root });
    const result = inspector.search({ query: "repeat-needle", limit: 2 });

    expect(result.matches).toEqual([
      { path: "a.js", line: 2, text: "repeat-needle" },
      { path: "b.js", line: 1, text: "repeat-needle" },
    ]);
    expect(result.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("ignores a caller-supplied root and does not modify files", () => {
    const root = makeRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-inspector-other-"));
    track("", outside);
    const file = path.join(root, "ok.js");
    fs.writeFileSync(file, "inside\n");
    fs.writeFileSync(path.join(outside, "ok.js"), "OUTSIDE-SECRET\n");
    const before = fs.readFileSync(file);
    const inspector = createSourceInspector({ root });

    const result = inspector.read({ path: "ok.js", root: outside });
    inspector.discover({ root: outside });
    inspector.search({ query: "inside", root: outside });

    expect(result.content).toBe("inside");
    expect(result.content).not.toContain("OUTSIDE-SECRET");
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(inspector.write).toBeUndefined();
    expect(inspector.apply).toBeUndefined();
    expect(inspector.commit).toBeUndefined();
  });
});
