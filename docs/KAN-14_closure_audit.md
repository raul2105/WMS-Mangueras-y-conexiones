# KAN-14: Reservation Policy Closure Audit

## Status: ✅ CLOSED & RECONCILED
**Date:** 2026-05-29
**Verdict:** The WMS Reservation Policy is fully implemented, verified in `main`, and reconciled across all operational paths.

---

## 1. The Reservation Policy (The Rules)

The system follows a **Reconciled Reservation Model**. The state of inventory is governed by the following invariants:

### A. The Fundamental Equation
For every inventory record:
$$\text{available} = \text{quantity} - \text{reserved}$$
- **Quantity**: Total physical stock on hand.
- **Reserved**: Stock committed to active orders.
- **Available**: Stock that can be newly reserved or consumed.

### B. Reservation Lifecycle
1. **Creation**: Reservations are created when a `ProductionOrder` (Sales or Production) transitions to `ABIERTA` or `EN_PROCESO`.
2. **Validation**: The `assertCanSetOrderInProcess` guard ensures that the sum of existing reservations + the new request $\le$ total physical quantity.
3. **Consumption**: When stock is picked/consumed (`OUT`), both `quantity` and `available` are decremented.
4. **Release**: When an order is `CANCELADA` or `COMPLETADA`, the associated reservations are released.

### C. Drift Correction (Reconciliation)
To prevent "orphan reservations" (reserved stock for orders that no longer exist or are closed), the system implements a **Desired State** pattern:
- The system calculates the sum of all `ProductionOrderItem` quantities for all active orders.
- It forces `inventory.reserved` to match this sum.
- This is triggered during order cancellation, closure, and can be run as a maintenance task.

---

## 2. Evidence Mapping

| Invariant | Implementation Path | Verification Evidence |
| :--- | :--- | :--- |
| **Equation Integrity** | `lib/inventory-service.ts` | All `update` calls recalculate `available` based on `quantity - reserved`. |
| **Over-Reservation Guard** | `lib/reservation-policy.ts` $\rightarrow$ `assertCanSetOrderInProcess` | Logic checks `competingMap` (other active orders) before allowing transition. |
| **Transactional Safety** | `lib/inventory-service.ts` $\rightarrow$ `reserveStock` | Uses optimistic locking via `updateMany` to prevent race conditions. |
| **Orphan Cleanup** | `lib/reservation-policy.ts` $\rightarrow$ `reconcileProductionReservations` | Logic aligns DB state with active `ProductionOrderItem` sums. |
| **Generic Order Support** | `lib/production/generic-order-service.ts` | Full lifecycle (Draft $\rightarrow$ Active $\rightarrow$ Closed) with scoped reservations. |
| **Assembly Support** | `lib/assembly/work-order-service.ts` | Integration with `reconcileProductionReservations` on cancel/close. |

---

## 3. Traceability Matrix

| Component | Jira Ticket | GitHub PR / Commit | Status |
| :--- | :--- | :--- | :--- |
| **Transactional Core** | `KAN-69` | Verified in `lib/sales/request-service.ts` | ✅ Done |
| **Orphan Reconciliation** | `KAN-68` | PR #25 (Merge commit `3dafa47`) | ✅ Done |
| **Generic Order Path** | `KAN-77` | Commit `776f069` / `b30e8ac` | ✅ Done |
| **Policy Definition** | `KAN-14` | This Document | ✅ Done |

## 4. Final Verdict
The implementation is robust. The system no longer relies on simple increments/decrements alone but uses a reconciliation loop to ensure the database never drifts from the operational reality of the orders.

**`KAN-14` is now technically and operationally closed.**
