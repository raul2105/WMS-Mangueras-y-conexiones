export type ReservationRequirement = {
  productId: string;
  locationId: string;
  reservedQty: number;
  pickedQty: number;
  shortQty: number;
};

export type ReservationInventory = {
  productId: string;
  locationId: string;
  reserved: number;
};

export type ReservationDelta = {
  productId: string;
  locationId: string;
  expected: number;
  actual: number;
  delta: number;
};

function keyOf(productId: string, locationId: string) {
  return `${productId}:${locationId}`;
}

/**
 * Calculates the reservation invariant without touching persistence.
 * A task contributes only its still-pending reservation.
 */
export function calculateReservationDeltas(
  requirements: ReservationRequirement[],
  inventory: ReservationInventory[],
): ReservationDelta[] {
  const expectedByKey = new Map<string, ReservationDelta>();
  const actualByKey = new Map<string, number>();

  for (const requirement of requirements) {
    const expected = Math.max(0, requirement.reservedQty - requirement.pickedQty - requirement.shortQty);
    const key = keyOf(requirement.productId, requirement.locationId);
    const current = expectedByKey.get(key);
    if (current) {
      current.expected += expected;
      current.delta = current.expected - current.actual;
    } else {
      expectedByKey.set(key, {
        productId: requirement.productId,
        locationId: requirement.locationId,
        expected,
        actual: 0,
        delta: expected,
      });
    }
  }

  for (const row of inventory) {
    actualByKey.set(keyOf(row.productId, row.locationId), row.reserved);
  }

  for (const [key, actual] of actualByKey) {
    const current = expectedByKey.get(key);
    if (current) {
      current.actual = actual;
      current.delta = current.expected - actual;
    } else if (actual !== 0) {
      const [productId, locationId] = key.split(":");
      expectedByKey.set(key, { productId, locationId, expected: 0, actual, delta: -actual });
    }
  }

  return Array.from(expectedByKey.values()).sort((left, right) =>
    `${left.productId}:${left.locationId}`.localeCompare(`${right.productId}:${right.locationId}`),
  );
}
