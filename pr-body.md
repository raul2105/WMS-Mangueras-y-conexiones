## Summary
- Hide generic commercial-flow clutter from the SALES_EXECUTIVE catalog/equivalences flow.
- Remove premature `Siguiente acción`, `+ Nuevo pedido`, and `Crear pedido` entry points before product context exists.
- Preserve product-scoped commercial actions and equivalence handoff context.
- Preserve manager/admin behavior where broader toolkit actions are still useful.

## Scope
- KAN-74 / KAN-81 sales UX cleanup.
- Does not close KAN-54.
- Does not close KAN-125.
- Email work is out of scope.

## Files changed
- `app/(shell)/catalog/page.tsx`
- `app/(shell)/production/equivalences/page.tsx`
- `tests/e2e/kan74-catalog-commercial-mode.spec.ts`
- `tests/e2e/sales-equivalences-clutter-cleanup.spec.ts`

## Validation
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npx playwright test tests/e2e/kan74-catalog-commercial-mode.spec.ts tests/e2e/sales-equivalences-clutter-cleanup.spec.ts --project=chromium --reporter=list`