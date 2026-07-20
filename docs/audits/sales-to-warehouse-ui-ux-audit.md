# Sales-to-Warehouse UI/UX Audit

## Executive Summary

Verdict: partially ready, with medium-high confidence from code and test inspection, but not ready to close the full sales-to-warehouse process as a market-grade WMS flow.

The recently merged Sales Home and guided Nuevo Pedido work improved the commercial entry point and gives sales a clearer starting surface. However, the end-to-end flow still has material gaps before KAN-130 should be treated as validated: sales home metrics are inconsistent, recent-order links can point to a non-resolving detail route, order readiness can imply a warehouse-ready handoff without a resolved product line, availability promise accuracy is not enforced, and warehouse staging / ready-for-delivery is represented as eligibility rather than an operational surface.

Runtime browser validation was attempted against `http://localhost:3002` with the local AWS dev launcher. The app started, but role login with the seeded E2E credentials failed with `No se pudo iniciar sesion`, so the role-based browser pass could not be completed in this audit. Findings below are therefore grounded in source inspection, route/RBAC inspection, existing tests, subagent review, and the failed login result.

## Scope Audited

Routes inspected:

- `/sales`
- `/catalog`
- `/production/availability`
- `/production/equivalences`
- `/production/requests/new`
- `/production/requests`
- `/production/requests/[id]`
- `/production/fulfillment/[id]`
- `/production/orders/[id]`
- Sales wrapper routes under `/sales/orders`, `/sales/availability`, and `/sales/equivalences`

Components and modules inspected:

- `app/(shell)/sales/page.tsx`
- `app/(shell)/sales/sales-home-client.tsx`
- `app/(shell)/catalog/page.tsx`
- `app/(shell)/production/availability/page.tsx`
- `app/(shell)/production/equivalences/page.tsx`
- `app/(shell)/production/requests/new/page.tsx`
- `app/(shell)/production/requests/page.tsx`
- `app/(shell)/production/requests/[id]/page.tsx`
- `app/(shell)/production/fulfillment/[id]/page.tsx`
- `app/(shell)/production/orders/[id]/page.tsx`
- `components/NewOrderForm.tsx`
- `components/OrderSummary.tsx`
- `components/CustomerSearchField.tsx`
- `components/ProductSearchField.tsx`
- `lib/rbac/route-access-map.ts`
- `components/layout/nav-config.ts`
- `lib/sales/console.ts`
- `lib/sales/internal-orders.ts`
- `lib/sales/request-service.ts`
- `lib/sales/visibility.ts`
- `lib/dashboard/fulfillment-dashboard.ts`
- `lib/dashboard/fulfillment-operational-presets.ts`

Roles inspected:

- `SALES_EXECUTIVE`
- `WAREHOUSE_OPERATOR`
- `MANAGER`
- `SYSTEM_ADMIN` only where RBAC/admin supervision affects the flow

Tests inspected:

- `tests/e2e/sales-home-console.spec.ts`
- `tests/e2e/sales-new-order-guided-summary.spec.ts`
- `tests/e2e/kan74-catalog-commercial-mode.spec.ts`
- `tests/e2e/sales-commercial-flow.spec.ts`
- `tests/e2e/commercial-toolkit-flow.spec.ts`
- `tests/e2e/product-aware-handoff.spec.ts`
- `tests/e2e/product-aware-line-capture.spec.ts`
- `tests/e2e/sales-equivalences-clutter-cleanup.spec.ts`
- `tests/e2e/full-role-matrix.spec.ts`
- `tests/e2e/dashboard-consistency.spec.ts`
- `tests/e2e/a11y-smoke.spec.ts`
- `tests/e2e/mobile-smoke.spec.ts`
- `tests/e2e/theme-light-mode.spec.ts`
- `tests/production/requests-cockpit.contract.test.ts`
- `tests/production/availability-page.contract.test.ts`
- `tests/sales-internal-order-flow.test.ts`
- `tests/sales-request-service.test.ts`
- `tests/dashboard/fulfillment-signals.unit.test.ts`
- `tests/dashboard/fulfillment-operational-presets.unit.test.ts`
- `tests/rbac/route-access.integration.test.ts`
- `tests/rbac/route-access-map-coverage.test.ts`

Jira checked:

- Attempted Atlassian search for KAN-125, KAN-126, KAN-128, KAN-129, KAN-130, KAN-131, KAN-132, KAN-133, and KAN-134.
- The available search returned unrelated Confluence results, so live Jira issue contents were not verified in this audit. Jira mapping below uses the ticket themes supplied in the task.

## Current Strengths

- `/sales` is now a dedicated commercial console with a primary `Nuevo pedido` CTA, quick actions to catalog / availability / equivalences / customers, active work cards, and a recent orders section.
- `/catalog` is sales-aware: sales users get a commercial search-first mode, product result CTAs carry `productId`, `sku`, `q`, and `source`, and mobile cards exist for narrow screens.
- `/production/availability` is compact and mostly tokenized. It gives sales a clear product / warehouse search, commercial availability status, warehouse-level availability, and recovery CTAs.
- `/production/requests/new` has a real guided capture structure with customer, suggested line, order data, support tools, disabled submit, and persistent summary.
- `/production/requests` is the most mature operational surface: role-aware title, quick filters, operational presets, card-first layout, administrative details for managers, and visible flow narratives.
- Request detail exposes order actions, line details, direct fulfillment link, configured assembly link, timeline, audit trail, and blocked-action reasons.
- Service-level tests already cover important direct-pick, partial, assembly, and delivered states.
- RBAC mapping is centralized and explicitly includes sales access to the commercial production surfaces and warehouse access to execution surfaces.

## Critical Findings

### Finding 1: Sales Home metrics and recent-order links can mislead or break the flow

- Severity: Critical
- Area: Sales Home
- Evidence: `app/(shell)/sales/page.tsx` counts `capturaOrders` as confirmed unassigned orders while the card says `En captura`; `porAsignarOrders` counts orders already assigned to the sales user; `listoEntregaOrders` and `entregadoOrders` both use `deliveredToCustomerAt != null`. `app/(shell)/sales/sales-home-client.tsx` links recent orders to `/production/requests/${order.code}`, while the detail route queries by `id`.
- Why it matters: Sales can see inaccurate stage totals and click a recent order that does not resolve to the actual order detail. That breaks trust in the new dedicated console and can hide urgent orders.
- Recommendation: Use the shared flow helpers from `lib/sales/internal-orders.ts` / `lib/sales/console.ts` for counts and recent rows, pass `id` to `SalesHomeClient`, and link recent rows by id. Add seeded E2E coverage for each Sales Home stage.
- Suggested Jira ticket if needed: KAN-126 follow-up or KAN-130.

### Finding 2: Nuevo Pedido can imply readiness without a resolved product line

- Severity: Critical
- Area: Nuevo Pedido / warehouse handoff
- Evidence: `components/NewOrderForm.tsx` treats generic commercial context as enough for `hasProductContext`, while `app/(shell)/production/requests/new/page.tsx` only persists an initial line when `lineProductId` exists. A query-only context can appear ready if customer, warehouse, and date are present.
- Why it matters: Sales can create a header that feels commercially ready but gives warehouse no concrete sellable line to pick, assemble, or stage.
- Recommendation: Either require at least one resolved product / configured assembly before the primary create action says the order is ready, or explicitly label the result as a header-only draft and route the next step to add lines before confirmation.
- Suggested Jira ticket if needed: KAN-129 follow-up or KAN-130.

### Finding 3: Availability promise accuracy is not enforced at commitment time

- Severity: High
- Area: Availability / commitment prevention
- Evidence: `/production/availability` shows `available` and commercial statuses, but `/production/requests/new` does not require an availability check, does not persist a checked-at promise snapshot, and allows future commitment based only on required form fields.
- Why it matters: Sales can commit a delivery date or quantity without the UI proving stock, reservation, substitute choice, or assembly feasibility. This is the core risk covered by KAN-128.
- Recommendation: Add a promise state to the guided flow: checked product, warehouse, available quantity, shortage/substitute state, and timestamp. Block or warn on order confirmation when the promise is stale, insufficient, or unresolved.
- Suggested Jira ticket if needed: KAN-128.

### Finding 4: Warehouse handoff lacks true warehouse ownership semantics

- Severity: High
- Area: Warehouse/operator handoff
- Evidence: Warehouse operators can see confirmed undelivered requests through visibility rules and can operate direct fulfillment, but ownership fields and labels are still sales-style (`assignedToUserId`, `Mis pedidos`, `Tomar pedido`). `Tomar pedido` is not a warehouse claim action.
- Why it matters: Warehouse can see work, but the queue does not answer "who owns this next physical step?" cleanly. That increases missed handoffs and duplicate work risk.
- Recommendation: Define warehouse claim/assignment separately from sales ownership, or rename the operator queue into work buckets that do not imply sales assignment. Make the primary CTA for operators the exact next physical action.
- Suggested Jira ticket if needed: KAN-131.

### Finding 5: Staging / ready-for-delivery is represented as eligibility, not an operational process

- Severity: High
- Area: Staging / delivery readiness
- Evidence: Direct-pick tasks move stock toward staging/shipping locations and the UI can show `Listos para entrega`, but there is no ready bay, packaging/loading checklist, staged quantity view, customer pickup/carrier handoff state, or warehouse terminal action distinct from sales delivery confirmation.
- Why it matters: The system can say an order is eligible for delivery, but warehouse does not have a dedicated surface to confirm what is physically staged, where it is, and what remains.
- Recommendation: Add a staging / ready-for-delivery surface that shows staged lines, staging location, shortages, packaging/loading status, and owner of final handoff.
- Suggested Jira ticket if needed: KAN-132 or KAN-134 depending on ticket ownership.

### Finding 6: UI theme consistency is still uneven across the flow

- Severity: Medium
- Area: UI consistency / accessibility
- Evidence: `NewOrderForm`, `OrderSummary`, `CustomerSearchField`, `/production/equivalences`, fulfillment, and production order detail still use hard-coded dark classes such as `text-white`, `text-slate-*`, `bg-white/5`, `border-white/10`, `text-cyan-*`, and `glass-card`, while newer surfaces such as availability and requests use more tokenized primitives.
- Why it matters: The experience reads as stitched together across commercial, request, and warehouse execution steps. Light mode and accessibility are more fragile when component styling bypasses tokens.
- Recommendation: Tokenize the remaining sales-to-warehouse surfaces and add a contract test or light-mode smoke to prevent hard-coded dark styling from returning.
- Suggested Jira ticket if needed: New ticket: "Normalize sales-to-warehouse UI tokens and light-mode parity."

### Finding 7: Existing tests cover screens but not the full KAN-130 journey

- Severity: High
- Area: Test coverage
- Evidence: There are screen-specific E2E tests for sales home, catalog, equivalences, guided summary, product handoff, and role matrix, plus service tests for fulfillment. There is no browser-level proof of sales home -> catalog/availability/equivalences -> create order with line -> confirm -> warehouse queue -> direct pick/assembly -> staged/ready -> delivered.
- Why it matters: Individual surfaces can pass while the actual sales-to-warehouse process still fails at handoff points.
- Recommendation: Add one seeded KAN-130 happy-path browser test and smaller seeded tests for live sales-home counts, readiness transition, equivalence result handoff, and warehouse queue ownership.
- Suggested Jira ticket if needed: KAN-130.

## Flow-by-Flow Review

### Sales Home

- User intent: Start new customer order, find products, monitor active orders, and continue work.
- First action clarity: Good. `Nuevo pedido` is visible and quick actions are scannable.
- Process continuity: Partial. The page starts well but sends users into `/production/*` surfaces and may link recent orders by code instead of id.
- Terminology: Mixed. `Pedidos`, `surtido`, `por asignar`, and `todos los pedidos` blend commercial and warehouse language.
- Decision support: Weak until counts are corrected. Current stage counts can misrepresent the actual work state.
- Error prevention: Weak for wrong-stage metrics and broken recent-order links.
- Recovery: Good empty state with `Nuevo pedido` and `Buscar producto`.
- Role fit: Good for a sales-only starting console, but manager/admin expectations conflict with older tests that still expect `/sales` to redirect.
- Mobile usability: Existing tests assert no overflow; code uses responsive grids.
- Visual hierarchy: Good, but two badges showing similar status in recent rows can be noisy.
- Market-grade WMS feel: Partial due to metric/link correctness risks.

### Catalog

- User intent: Find the sellable item and continue to availability, equivalences, or order creation.
- First action clarity: Good. Search and product actions are clear.
- Process continuity: Good link context preservation, but the "Flujo comercial" guidance is hidden from `SALES_EXECUTIVE`, the role that most needs it.
- Terminology: Mostly commercial, with product-level technical fields still visible as needed.
- Decision support: Good product table/cards with stock and price, but stock is aggregate and not the same as promise-safe availability.
- Error prevention: Partial. The page encourages availability check but does not enforce it downstream.
- Recovery: Good empty state actions.
- Role fit: Sales gets simplified filters; manager/warehouse get technical controls.
- Mobile usability: Mobile cards exist and avoid the desktop table.
- Visual hierarchy: Good. CTAs are attached to rows/cards.
- Market-grade WMS feel: Mostly ready as a search/discovery surface.

### Availability

- User intent: Check whether a product can be promised from a warehouse.
- First action clarity: Good. Product and warehouse fields are obvious.
- Process continuity: Good handoff links to equivalences and new order.
- Terminology: Stronger commercial language than older production surfaces.
- Decision support: Partial. It shows available count and warehouse breakdown, but does not expose reserved/shortage reasoning, freshness, or promise snapshot.
- Error prevention: Weak at commitment boundary because results are advisory only.
- Recovery: Good contextual empty-state actions.
- Role fit: Good for sales/manager/admin; not exposed to warehouse by RBAC.
- Mobile usability: Mobile cards exist.
- Visual hierarchy: Mostly good; pagination still has hard-coded dark styling.
- Market-grade WMS feel: Partially ready pending KAN-128 promise semantics.

### Equivalences

- User intent: Find a substitute and continue to availability or order.
- First action clarity: Partial. Search is obvious, but continuation guidance is hidden for sales in some states.
- Process continuity: Product/equivalent context is preserved in links, but the page visually differs from availability/catalog.
- Terminology: Mostly commercial, though result details are operational/technical.
- Decision support: Good when equivalents exist; weak when sales needs an explicit substitute decision trail.
- Error prevention: Partial. It does not force sales to select/confirm the exact substitute before order readiness.
- Recovery: Good empty states.
- Role fit: Manager/admin get more guidance than sales; this should be reversed or equalized.
- Mobile usability: Existing clutter-cleanup test covers overflow; code still uses hard-coded dark classes.
- Visual hierarchy: Behind availability; cyan/glass cards make it feel like a separate tool.
- Market-grade WMS feel: Needs normalization before it feels like part of the same flow.

### Nuevo Pedido

- User intent: Create a customer order with product, warehouse, date, notes, and optional configured assembly.
- First action clarity: Good for customer-first capture.
- Process continuity: Improved with persistent summary and support links, but product context can be unresolved.
- Terminology: Mixed. Sales sees `almacén/origen`, `línea`, `surtido`, and `ensamble` terms.
- Decision support: Good summary scaffolding; weak enforcement of availability and product resolution.
- Error prevention: Required fields block submit, but the readiness model can overstate warehouse readiness.
- Recovery: Good support links and product change/remove actions.
- Role fit: Sales can create, manager/admin can manage customers; copy promises quick customer registration even when sales lacks permission.
- Mobile usability: Mobile summary exists, but desktop summary disappears below `lg` into a collapsible section.
- Visual hierarchy: Strong, but hard-coded dark styling differs from tokenized pages.
- Market-grade WMS feel: Partially ready as a guided draft tool; not yet ready as a promise-safe order commitment tool.

### Order Confirmation / Request Detail

- User intent: Review order, add lines/assembly while draft, confirm, assign/take, operate or track handoff, and close delivery.
- First action clarity: Good for detail pages with action cards and blocked reasons.
- Process continuity: Stronger than list pages; sales, warehouse, and manager can see the same entity.
- Terminology: Operational, appropriate for warehouse but heavy for sales.
- Decision support: Good line, pick, assembly, timeline, and audit data.
- Error prevention: Confirmation disabled when there are no lines; delivery action has eligibility checks.
- Recovery: Draft lines can be deleted; cancellation exists.
- Role fit: Write actions are role-aware, but sales and warehouse ownership are still conflated in labels/actions.
- Mobile usability: Tables may require horizontal scroll; cards exist mainly in list, not all detail sections.
- Visual hierarchy: Good action grouping but dense.
- Market-grade WMS feel: Good operational depth, but needs role-specific simplification.

### Warehouse / Operator Handoff

- User intent: Know what to pick, assemble, stage, or escalate next.
- First action clarity: Partial. `/production/requests` title becomes `Cockpit de ejecución` for operators and exposes filters, but primary ownership/action semantics remain sales-flavored.
- Process continuity: Good shared order visibility; weak handoff ownership.
- Terminology: Operational and mostly appropriate.
- Decision support: Good signals for direct pick, assembly, blocked, stale, and urgency.
- Error prevention: Service and UI checks prevent many invalid transitions.
- Recovery: Operators can inspect detail and fulfillment pages, but cannot claim a warehouse-specific stage.
- Role fit: Operators see execution detail but not a clean owned-work queue.
- Mobile usability: Card-first queue helps; detail and fulfillment forms still need mobile verification.
- Visual hierarchy: Good in cockpit; mixed in fulfillment and production order pages.
- Market-grade WMS feel: Partially ready for visibility, not ready for full execution queue closure.

### Production / Assembly Handoff

- User intent: Complete configured assemblies tied to sales requests.
- First action clarity: Partial. Request detail shows linked production order cards, but pending assembly CTA can route to request detail rather than the exact production order.
- Process continuity: Sales request and production order are linked, but operators may need to inspect cards to find the concrete work order.
- Terminology: Appropriate for warehouse.
- Decision support: Good component, WIP, pick, consumption, and trace fields in production order detail.
- Error prevention: Assembly release is blocked until the source sales order is confirmed.
- Recovery: Cancellation and status transitions exist with constraints.
- Role fit: Warehouse role can operate production execution; sales sees more operational detail than ideal.
- Mobile usability: Production order tables use wide layouts; needs KAN-130/KAN-134 mobile proof.
- Visual hierarchy: Dense and older visual style.
- Market-grade WMS feel: Operationally capable, UX still fragmented.

### Staging / Delivery Readiness

- User intent: Know what is physically ready, where it is staged, what remains, and who can hand off to the customer.
- First action clarity: Weak because there is no dedicated staging surface.
- Process continuity: Eligibility appears in request flow, but physical staging is buried in pick/task locations.
- Terminology: Uses staging/shipping in fulfillment copy; no consistent ready bay language.
- Decision support: Insufficient for loading/customer handoff.
- Error prevention: Delivery marking is eligibility-gated, but staging correctness is not a visible checklist.
- Recovery: Partial shortages exist for direct pick; staging correction UX is not clear.
- Role fit: Warehouse can stage but not terminally mark handed off; sales can mark customer delivery.
- Mobile usability: Not verified.
- Visual hierarchy: No dedicated hierarchy because no dedicated view exists.
- Market-grade WMS feel: Not ready.

## UX Gaps by Role

### SALES_EXECUTIVE

- Needs commercial guidance to remain visible from catalog and equivalences; do not hide the clearest process map from the main commercial role.
- Needs corrected `/sales` counts and recent-order links before the sales console can be trusted.
- Needs promise-safe availability status before committing quantity/date.
- Needs product resolution or explicit "draft header only" language before create.
- Should not need to understand `/production/requests` as the main mental model.
- Should see customer registration copy that matches actual permission.

### WAREHOUSE_OPERATOR

- Needs a warehouse-owned queue, not a sales-assignment mental model.
- Needs exact next-action CTAs from request cards/detail to direct fulfillment or the concrete assembly work order.
- Needs blocked/shortage/unreleased states separated so `blocked` means an actionable exception.
- Needs a staging / ready bay view with physical location and remaining work.
- Needs mobile validation for direct pick, shortage entry, assembly pick, and staging operations.

### MANAGER

- Needs a consistent supervisory route model. Current tests disagree on whether manager `/sales` should stay on the dedicated console or redirect to `/production/requests`.
- Needs admin table and operational filters, but should also see sales-facing gaps that can cause wrong commitments.
- Needs dashboard/count tests that compare counts against destination rows, not only navigation.

### SYSTEM_ADMIN

- Relevant mainly for RBAC bypass, route access, and diagnostics.
- Should have access to all surfaces but should not drive UX decisions that hide or expose controls differently for sales/warehouse.

## Mobile and Accessibility Notes

- Existing mobile tests cover `/sales`, `/production/requests`, and `/production/requests/new` overflow, but not the complete catalog -> availability -> equivalences -> request -> fulfillment chain.
- `/catalog` and `/production/availability` include mobile-specific card layouts.
- `/production/requests` uses card-first queue layout and labelled administrative table.
- `CustomerSearchField` needs keyboard/focus polish comparable to `ProductSearchField`; result buttons and clear/create controls rely too much on hover styling.
- `ProductSearchField` visually labels the input with text but should strengthen semantic association via a real `label`, `aria-label`, or `aria-labelledby`.
- New-order validation messages use visible `role="alert"` text but fields do not consistently wire `aria-invalid` / `aria-describedby`.
- Several disabled pagination controls are links with `pointer-events-none` / opacity, which is less clear for keyboard and assistive technology users.
- Hard-coded dark classes across new order, order summary, equivalences, fulfillment, and production order detail should be replaced with design tokens before relying on light-mode parity.

## Testing Gaps

Recommended additions for KAN-130:

1. Add `kan130-sales-home-live-counts.spec.ts`:
   - Seed one visible sales order per flow stage.
   - Login as `SALES_EXECUTIVE`.
   - Assert `/sales` counts and recent rows match the seeded DB state.
   - Assert recent row links open the correct `/production/requests/[id]` detail.

2. Extend `sales-new-order-guided-summary.spec.ts`:
   - Complete customer, warehouse, date, and resolved product line.
   - Assert the summary transitions to `Listo`.
   - Assert submit enables only with a resolved product or explicitly marked header-only draft.

3. Extend equivalences E2E:
   - Seed base product plus equivalent product.
   - Assert sales sees `Crear pedido` for a real equivalent result.
   - Assert href includes `source=equivalences`, `productId`, and `equivalentProductId`.

4. Add KAN-128 availability promise tests:
   - Assert insufficient stock / stale promise blocks or warns at confirmation.
   - Assert selected warehouse and available quantity are visible in the order summary.

5. Add warehouse queue ownership tests:
   - Seed confirmed request with product line.
   - Login as `WAREHOUSE_OPERATOR`.
   - Assert the queue shows the exact next action and no sales-only ownership language.

6. Add staging / ready-for-delivery tests:
   - Complete direct pick to staging.
   - Assert request shows staged location, staged quantity, remaining work, and ready/handoff state.

7. Add browser full-flow smoke:
   - Sales starts at `/sales`.
   - Finds product in catalog.
   - Checks availability/equivalence as needed.
   - Creates request with a resolved line.
   - Confirms request.
   - Warehouse completes direct pick and/or assembly.
   - System shows staged/ready state.
   - Authorized role completes delivery handoff.

8. Clean up stale or conflicting test expectations:
   - `sales-commercial-flow.spec.ts` still contains a manager `/sales` redirect expectation that conflicts with `sales-home-console.spec.ts` and KAN-126's dedicated `/sales` console behavior.

## Recommended Backlog Changes

### KAN-128: Commercial Availability Promise Accuracy

Recommended scope:

- Persist or display a promise snapshot with product, warehouse, checked quantity, available quantity, checked timestamp, substitute flag, and staleness.
- Warn/block when order creation or confirmation proceeds without a valid promise.
- Distinguish aggregate stock from sellable promise.

Acceptance criteria:

- Sales sees whether the commitment is promise-safe before create/confirm.
- Stale or insufficient availability cannot be silently confirmed.
- KAN-130 E2E can assert promise state across availability -> new order -> detail.

### KAN-130: E2E Validation for Full Sales Client Journey and Warehouse Handoff

Recommended scope:

- Add the browser-level full-flow proof described above.
- Add seeded coverage for Sales Home counts and recent-order links.
- Add readiness transition coverage for guided Nuevo Pedido.
- Add role-specific assertions for sales vs warehouse action visibility.

Acceptance criteria:

- One test proves a real sales order reaches warehouse execution and ready/delivery state.
- The test fails if `/sales` counts or recent links are wrong.
- The test fails if warehouse cannot identify the next physical action.

### KAN-131: Warehouse Execution Queue

Recommended scope:

- Define warehouse assignment/claim semantics separately from sales ownership, or remove sales-ownership language from operator queues.
- Make operator cards answer: what to do, where, due by when, blocked by what, and who owns the next step.

Acceptance criteria:

- Warehouse operator sees work buckets with clear next action.
- Operator can reach direct pick or exact assembly work order in one click from the queue/detail.
- Sales-only actions are not presented as warehouse ownership actions.

### KAN-132: Staging / Ready-for-Delivery State

Recommended scope:

- Add visible staging state after direct pick and assembly completion.
- Show staged location, staged quantities, missing quantities, packaging/loading/handoff status.

Acceptance criteria:

- Warehouse can see what is physically staged and what remains.
- Sales can see ready-for-delivery without warehouse-only pick/WIP internals.
- Ready state is distinct from delivered state.

### KAN-133: Process Map

Recommended scope:

- Add a role-aware process map for sales and warehouse.
- Sales map: product -> availability/equivalence -> customer/order -> confirmation -> warehouse progress -> ready/delivered.
- Warehouse map: confirmed queue -> direct pick / assembly -> staging -> handoff.

Acceptance criteria:

- Sales sees the process map where decisions happen, especially catalog/equivalences/new order.
- Warehouse sees operational process map in cockpit/detail.
- Terminology changes by role.

### KAN-134: Production Assembly Completion Path

Recommended scope:

- Link pending assembly directly to the exact production order.
- Separate unreleased, shortage, blocked, WIP, and completion states.
- Surface completion back on the originating sales request.

Acceptance criteria:

- Operator can go from sales request to exact assembly work order without hunting.
- Assembly completion updates request readiness.
- Blocked assembly explains the actual reason and recovery path.

### New Ticket: Normalize Sales-to-Warehouse UI Tokens and Accessibility

Acceptance criteria:

- `NewOrderForm`, `OrderSummary`, `CustomerSearchField`, equivalences, fulfillment, and production order detail stop using hard-coded dark classes for core text/surfaces.
- Light-mode smoke covers `/catalog`, `/production/availability`, `/production/equivalences`, `/production/requests/new`, `/production/requests`, and request detail.
- Customer/product search controls have keyboard-visible focus and semantic labels.
- Form validation wires `aria-invalid` and `aria-describedby` for required fields.

### New Ticket: Repair Sales Home Stage Model

Acceptance criteria:

- `/sales` counts use shared flow helpers and match seeded DB stage expectations.
- `Listos para entregar` and `Entregados` are distinct.
- Recent-order links use order id and open the correct request detail.
- Stage labels and next actions are commercial-facing and consistent with `/production/requests`.

## Prioritized Next Actions

1. Fix `/sales` correctness first: stage count logic, distinct ready vs delivered state, and recent-order links by id.
2. Decide and implement the KAN-128 promise contract before expanding E2E claims: what makes an order promise-safe, stale, insufficient, or substitute-based.
3. Tighten Nuevo Pedido readiness so "Crear pedido" cannot imply warehouse-ready work without a resolved product/configured assembly, unless it is explicitly a header-only draft.
4. Define KAN-131/KAN-132 warehouse ownership and staging semantics before adding more warehouse UI polish.
5. Add KAN-130 browser proof after the above seams are stable, then clean up stale/conflicting tests.
