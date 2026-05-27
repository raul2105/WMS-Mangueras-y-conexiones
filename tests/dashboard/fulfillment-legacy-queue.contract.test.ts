import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("fulfillment legacy queue contract (KAN-56)", () => {
  it("keeps legacy queue matcher wiring in requests page", () => {
    const content = readWorkspaceFile("app/(shell)/production/requests/page.tsx");

    expect(content).toContain("isFulfillmentQueueFilter");
    expect(content).toContain("matchQueueFilter(signals, queueFilter)");
    expect(content).toContain("queueFilter ? matchQueueFilter(signals, queueFilter) : true");
  });
});
