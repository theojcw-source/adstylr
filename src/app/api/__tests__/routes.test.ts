import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

function route(path: string) {
  return resolve(root, "app/api", path, "route.ts");
}

describe("API routes", () => {
  const routes = [
    "fal/[...path]",
    "fal/credits",
    "brand",
    "brand/atelier-overlay",
    "comfy/generate",
    "comfy/view",
    "generations",
    "higgsfield/generate",
    "images/[...path]",
    "loras",
    "loras/[id]",
    "prompts",
    "prompts/[id]",
    "render/variants",
    "replicate/train",
    "veille/ads",
    "veille/prompt",
    "workflows",
    "workflows/[id]",
  ];

  for (const r of routes) {
    it(`/api/${r} existe`, () => {
      expect(existsSync(route(r)), `route.ts manquant pour /api/${r}`).toBe(true);
    });
  }
});
