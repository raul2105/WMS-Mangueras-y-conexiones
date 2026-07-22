import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "app", "(shell)", "production", "requests", "page.tsx");

describe("production requests list action contract", () => {
  it("uses the canonical flow narrative for the visible next action", () => {
    const source = fs.readFileSync(pagePath, "utf8");

    expect(source).toContain("Siguiente:</span> {flowNarrative.nextRecommendedAction.label}");
    expect(source).not.toContain("Siguiente:</span> {operationalState.nextAction}");
  });
});
