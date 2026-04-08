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
  "catalog.view",
  "inventory.search",
  "sales.view",
  "assembly_requests.create",
  "product_drafts.create",
  "mobile.admin",
]);
export type MobilePermissionCode = z.infer<typeof mobilePermissionCodeSchema>;

export const mobileFeatureFlagsSchema = z.object({
  mobile_enabled: z.boolean(),
  catalog_enabled: z.boolean(),
  inventory_search_enabled: z.boolean(),
  sales_requests_enabled: z.boolean(),
  availability_enabled: z.boolean(),
  equivalences_enabled: z.boolean(),
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
  effectiveRoleCode: mobileRoleCodeSchema,
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

export const mobileCatalogInventoryRowSchema = z.object({
  warehouseCode: z.string(),
  quantity: z.number(),
  reserved: z.number(),
  available: z.number(),
});
export type MobileCatalogInventoryRow = z.infer<typeof mobileCatalogInventoryRowSchema>;

export const mobileCatalogItemSchema = z.object({
  productId: z.string(),
  sku: z.string().nullable(),
  referenceCode: z.string().nullable(),
  name: z.string(),
  type: z.string().nullable(),
  brand: z.string().nullable(),
  categoryName: z.string().nullable(),
  subcategory: z.string().nullable(),
  price: z.number().nullable(),
  totalStock: z.number(),
  inventory: z.array(mobileCatalogInventoryRowSchema),
  updatedAt: z.string().nullable(),
});
export type MobileCatalogItem = z.infer<typeof mobileCatalogItemSchema>;

export const mobileCatalogListResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  query: z.string(),
  items: z.array(mobileCatalogItemSchema),
  total: z.number(),
  timestamp: z.string(),
});
export type MobileCatalogListResponse = z.infer<typeof mobileCatalogListResponseSchema>;

export const mobileCatalogGetResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  item: mobileCatalogItemSchema,
  timestamp: z.string(),
});
export type MobileCatalogGetResponse = z.infer<typeof mobileCatalogGetResponseSchema>;

export const mobileSalesRequestSummarySchema = z.object({
  total: z.number(),
  draft: z.number(),
  confirmed: z.number(),
  cancelled: z.number(),
});
export type MobileSalesRequestSummary = z.infer<typeof mobileSalesRequestSummarySchema>;

export const mobileSalesRequestItemSchema = z.object({
  requestId: z.string(),
  code: z.string(),
  status: z.string(),
  customerName: z.string().nullable(),
  warehouseCode: z.string().nullable(),
  dueDate: z.string().nullable(),
  requestedBy: z.string().nullable(),
  lineCount: z.number(),
  linkedAssemblyCount: z.number(),
  directPickActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  syncStatus: z.string(),
  notes: z.string().nullable(),
});
export type MobileSalesRequestItem = z.infer<typeof mobileSalesRequestItemSchema>;

export const mobileSalesRequestListResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  statusFilter: z.string(),
  items: z.array(mobileSalesRequestItemSchema),
  summary: mobileSalesRequestSummarySchema,
  timestamp: z.string(),
});
export type MobileSalesRequestListResponse = z.infer<typeof mobileSalesRequestListResponseSchema>;

export const mobileSalesRequestGetResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  item: mobileSalesRequestItemSchema,
  timestamp: z.string(),
});
export type MobileSalesRequestGetResponse = z.infer<typeof mobileSalesRequestGetResponseSchema>;

export const mobileSalesRequestCreateResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  requestId: z.string(),
  code: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type MobileSalesRequestCreateResponse = z.infer<typeof mobileSalesRequestCreateResponseSchema>;

export const mobileAvailabilityItemSchema = z.object({
  productId: z.string(),
  sku: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  total: z.number(),
  reserved: z.number(),
  available: z.number(),
  byWarehouse: z.array(mobileCatalogInventoryRowSchema),
});
export type MobileAvailabilityItem = z.infer<typeof mobileAvailabilityItemSchema>;

export const mobileAvailabilityResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  query: z.string(),
  warehouseCode: z.string(),
  items: z.array(mobileAvailabilityItemSchema),
  total: z.number(),
  timestamp: z.string(),
});
export type MobileAvailabilityResponse = z.infer<typeof mobileAvailabilityResponseSchema>;

export const mobileEquivalenceRowSchema = z.object({
  productId: z.string(),
  sku: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  categoryName: z.string().nullable(),
  totalAvailable: z.number(),
  locations: z.array(
    z.object({
      warehouseCode: z.string(),
      available: z.number(),
    }),
  ),
});
export type MobileEquivalenceRow = z.infer<typeof mobileEquivalenceRowSchema>;

export const mobileEquivalenceGroupSchema = z.object({
  productId: z.string(),
  sku: z.string().nullable(),
  name: z.string(),
  totalAvailable: z.number(),
  equivalents: z.array(mobileEquivalenceRowSchema),
});
export type MobileEquivalenceGroup = z.infer<typeof mobileEquivalenceGroupSchema>;

export const mobileEquivalencesResponseSchema = z.object({
  ok: z.literal(true),
  apiVersion: z.literal(MOBILE_API_VERSION),
  query: z.string(),
  items: z.array(mobileEquivalenceGroupSchema),
  timestamp: z.string(),
});
export type MobileEquivalencesResponse = z.infer<typeof mobileEquivalencesResponseSchema>;
