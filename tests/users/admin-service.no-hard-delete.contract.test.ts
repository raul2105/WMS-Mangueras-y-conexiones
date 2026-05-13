import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("users admin service no hard delete contract", () => {
  it("does not call prisma.user.delete or prisma.user.deleteMany", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/users/admin-service.ts"), "utf8");

    expect(source).not.toContain(".user.delete(");
    expect(source).not.toContain(".user.deleteMany(");
    expect(source).toContain("isActive");
  });
});
