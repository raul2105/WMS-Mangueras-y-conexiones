import { describe, expect, it } from "vitest";
import { resolveUserProfile } from "@/mobile/functions/shared/user-profile-resolver.mjs";

describe("mobile user profile resolver", () => {
  it("returns normalized profile for valid role codes", () => {
    const result = resolveUserProfile({
      userId: "u-1",
      displayName: "User One",
      roleCodes: ["MANAGER", "UNKNOWN_ROLE"],
      preferredWarehouseCode: "WH-MAIN",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).toEqual({
      userId: "u-1",
      displayName: "User One",
      roleCodes: ["MANAGER"],
      preferredWarehouseCode: "WH-MAIN",
    });
  });

  it("rejects missing valid role codes", () => {
    const result = resolveUserProfile({
      userId: "u-2",
      displayName: "User Two",
      roleCodes: ["INVALID"],
      preferredWarehouseCode: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.statusCode).toBe(403);
  });
});
