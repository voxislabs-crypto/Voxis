import { describe, expect, it } from "vitest";

const loopRoutes = (await import("../routes/loopRoutes.js")).default;
const sfxRoutes = (await import("../routes/sfxRoutes.js")).default;

function findRoute(router, path, method) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route.methods?.[method]);
}

describe("edge mutation route authentication", () => {
  it("requires authentication and administration for loop cache control", () => {
    for (const path of ["/api/loops/status", "/api/loops/refresh", "/api/loops/refresh/:mood"]) {
      const route = findRoute(loopRoutes, path, path === "/api/loops/status" ? "get" : "post");
      expect(route.route.stack[0].handle.name).toBe("requireAuth");
      expect(route.route.stack[1].handle.name).toBe("requireAdmin");
    }
  });

  it("requires authentication before SFX prefetch can perform cache work", () => {
    for (const path of ["/api/sfx/prefetch", "/sfx/prefetch"]) {
      const route = findRoute(sfxRoutes, path, "post");
      expect(route.route.stack[0].handle.name).toBe("requireAuth");
    }
  });
});
