import { z } from "zod";

export const MOBILE_API_VERSION = "v1" as const;

export const mobileRoleCodeSchema = z.enum([
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
]);
export type MobileRoleCode = z.infer<typeof mobileRoleCodeSchema>;

export const mobilePermissionCodeSchema = z.enum([
  "mobile.profile.read",
  "inventory.search",
  "assembly_requests.create",
  "product_drafts.create",
  "mobile.admin",
]);
export type MobilePermissionCode = z.infer<typeof mobilePermissionCodeSchema>;

export const mobileFeatureFlagsSchema = z.object({
  mobile_enabled: z.boolean(),
  inventory_search_enabled: z.boolean(),
  assembly_requests_enabled: z.boolean(),
  product_drafts_enabled: z.boolean(),
});
export type MobileFeatureFlags = z.infer<typeof mobileFeatureFlagsSchema>;

export const mobileHealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  apiVersion: z.literal(MOBILE_API_VERSION),
  timestamp: z.string(),
});
export type MobileHealthResponse = z.infer<typeof mobileHealthResponseSchema>;

export const mobileVersionResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  build: z.string(),
  releaseDate: z.string(),
  flags: mobileFeatureFlagsSchema,
  timestamp: z.string(),
});
export type MobileVersionResponse = z.infer<typeof mobileVersionResponseSchema>;

export const mobileMePermissionsResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  userId: z.string(),
  displayName: z.string(),
  roleCodes: z.array(mobileRoleCodeSchema).min(1),
  permissionCodes: z.array(mobilePermissionCodeSchema),
  preferredWarehouseCode: z.string().nullable(),
  timestamp: z.string(),
});
export type MobileMePermissionsResponse = z.infer<typeof mobileMePermissionsResponseSchema>;

export const mobileInventorySearchItemSchema = z.object({
  sku: z.string().nullable(),
  name: z.string().nullable(),
  availableQty: z.number(),
  warehouseCode: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type MobileInventorySearchItem = z.infer<typeof mobileInventorySearchItemSchema>;

export const mobileInventorySearchResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  query: z.string(),
  items: z.array(mobileInventorySearchItemSchema),
  timestamp: z.string(),
});
export type MobileInventorySearchResponse = z.infer<typeof mobileInventorySearchResponseSchema>;

export const mobileAssemblyRequestCreateResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  requestId: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type MobileAssemblyRequestCreateResponse = z.infer<typeof mobileAssemblyRequestCreateResponseSchema>;

export const mobileAssemblyRequestGetResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  requestId: z.string(),
  status: z.string(),
  warehouseCode: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  payload: z.unknown(),
  timestamp: z.string(),
});
export type MobileAssemblyRequestGetResponse = z.infer<typeof mobileAssemblyRequestGetResponseSchema>;

export const mobileProductDraftCreateResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  draftId: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type MobileProductDraftCreateResponse = z.infer<typeof mobileProductDraftCreateResponseSchema>;
