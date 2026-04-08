import { describe, expect, it } from "vitest";
import { handler as mePermissionsHandler } from "@/mobile/functions/handlers/me-permissions.mjs";

describe("mobile me/permissions contract", () => {
  it("returns required response shape", async () => {
    const previousMode = process.env.MOBILE_AUTH_MODE;
    const previousMockUserId = process.env.MOBILE_MOCK_USER_ID;
    const previousMobileEnabled = process.env.MOBILE_ENABLED;
    const previousInventoryEnabled = process.env.INVENTORY_SEARCH_ENABLED;
    const previousAssemblyEnabled = process.env.ASSEMBLY_REQUESTS_ENABLED;
    const previousDraftsEnabled = process.env.PRODUCT_DRAFTS_ENABLED;

    try {
      process.env.MOBILE_AUTH_MODE = "mock";
      process.env.MOBILE_MOCK_USER_ID = "mock-manager";
      process.env.MOBILE_ENABLED = "true";
      process.env.INVENTORY_SEARCH_ENABLED = "true";
      process.env.ASSEMBLY_REQUESTS_ENABLED = "true";
      process.env.PRODUCT_DRAFTS_ENABLED = "true";

      const response = await mePermissionsHandler({});
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body).toEqual(
        expect.objectContaining({
          ok: true,
          apiVersion: "v1",
          userId: expect.any(String),
          displayName: expect.any(String),
          roleCodes: expect.any(Array),
          permissionCodes: expect.any(Array),
          preferredWarehouseCode: expect.any(String),
          timestamp: expect.any(String),
        }),
      );
    } finally {
      process.env.MOBILE_AUTH_MODE = previousMode;
      process.env.MOBILE_MOCK_USER_ID = previousMockUserId;
      process.env.MOBILE_ENABLED = previousMobileEnabled;
      process.env.INVENTORY_SEARCH_ENABLED = previousInventoryEnabled;
      process.env.ASSEMBLY_REQUESTS_ENABLED = previousAssemblyEnabled;
      process.env.PRODUCT_DRAFTS_ENABLED = previousDraftsEnabled;
    }
  });
});
