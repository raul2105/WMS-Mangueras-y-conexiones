import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOBILE_FEATURE_FLAGS,
  isMobileCapabilityEnabled,
  parseEnvBoolean,
  readMobileFeatureFlags,
} from "@/lib/mobile/feature-flags";

describe("mobile feature flags", () => {
  it("uses safe defaults when env vars are missing", () => {
    const flags = readMobileFeatureFlags({});
    expect(flags).toEqual(DEFAULT_MOBILE_FEATURE_FLAGS);
  });

  it("parses env booleans safely", () => {
    expect(parseEnvBoolean("true", false)).toBe(true);
    expect(parseEnvBoolean("1", false)).toBe(true);
    expect(parseEnvBoolean("false", true)).toBe(false);
    expect(parseEnvBoolean("0", true)).toBe(false);
    expect(parseEnvBoolean("maybe", true)).toBe(true);
  });

  it("requires mobile_enabled before enabling any capability", () => {
    const flags = {
      mobile_enabled: false,
      inventory_search_enabled: true,
      assembly_requests_enabled: true,
      product_drafts_enabled: true,
    };

    expect(isMobileCapabilityEnabled("base", flags)).toBe(false);
    expect(isMobileCapabilityEnabled("inventory_search", flags)).toBe(false);
    expect(isMobileCapabilityEnabled("assembly_requests", flags)).toBe(false);
    expect(isMobileCapabilityEnabled("product_drafts", flags)).toBe(false);
  });

  it("accepts legacy env aliases for backwards compatibility", () => {
    const flags = readMobileFeatureFlags({
      MOBILE_ENABLED: "true",
      MOBILE_INVENTORY_READ_ENABLED: "true",
      MOBILE_ASSEMBLY_REQUESTS_ENABLED: "false",
      MOBILE_PRODUCT_DRAFTS_ENABLED: "true",
    });

    expect(flags).toEqual({
      mobile_enabled: true,
      inventory_search_enabled: true,
      assembly_requests_enabled: false,
      product_drafts_enabled: true,
    });
  });
});
