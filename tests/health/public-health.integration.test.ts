import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { $queryRaw: database.query },
  prismaReady: Promise.resolve(),
  resolvedDatabasePath: "private-database-path",
}));

import { GET } from "@/app/api/health/route";

describe("public health response", () => {
  beforeEach(() => {
    database.query.mockReset();
  });

  it("checks the database without exposing connection details", async () => {
    database.query.mockResolvedValue([{ value: 1 }]);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, db: "up", dbInfo: "PostgreSQL" });
    expect(database.query).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("private-database-path");
    expect(body).toHaveProperty("commitSha");
    expect(body).toHaveProperty("releaseId");
  });

  it("returns a stable failure without leaking provider errors or credentials", async () => {
    database.query.mockRejectedValue(new Error("postgresql://user:secret@private-host:5432/wms"));
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, db: "down", error: "Database unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/secret|private-host|postgresql:\/\//);
  });
});
