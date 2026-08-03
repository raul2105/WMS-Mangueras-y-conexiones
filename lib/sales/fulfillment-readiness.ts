/**
 * Ownership required to perform the physical handoff to staging.
 *
 * New orders use the warehouse ownership fields. The commercial owner fallback
 * keeps historical orders operable while the additive migration is rolled out.
 */
export function hasWarehouseFulfillmentOwnership(input: {
  warehouseAssigneeUserId?: string | null;
  warehouseClaimedByUserId?: string | null;
  assignedToUserId?: string | null;
  pulledAt?: unknown;
}) {
  return Boolean(
    input.warehouseClaimedByUserId
    || input.warehouseAssigneeUserId
    || (input.assignedToUserId && input.pulledAt),
  );
}
