# Nuevo Pedido: design QA

## Comparison target

- Source visual truth: `C:\Users\raul_\.codex\generated_images\019f4972-ff37-78d2-8e44-584018200b61\exec-cde10b25-3115-4851-96be-d1cf053491a0.png`
- Implementation: browser-rendered `http://localhost:3002/production/requests/new`
- Implementation screenshots: in-app browser captures on 2026-07-10 (desktop default viewport and 390 x 844 mobile). Captures were reviewed directly and not exported as repository assets.
- Auth/state: `SALES_EXECUTIVE`, empty new order, Paso 1 Cliente.

The reference is a direction for the interaction model (one task at a time), not a pixel-for-pixel theme target. The application preserves its existing dark operational theme and token system.

## Full-view comparison evidence

- Desktop: one centered capture card, one active step, two visibly unavailable later steps, one question, one input, and one disabled primary action.
- Mobile 390 x 844: `scrollWidth` = `clientWidth` = `390`; the three steps stack vertically without horizontal overflow or clipped controls.
- Focused region comparison was not required: the reference contains no product imagery, logos, or detailed icon assets that must be reproduced. The implementation uses the established app iconography and no generated image asset.

## Required fidelity surfaces

- Fonts and typography: the page hierarchy is clear: page title, current task question, field label, then action. Step labels remain readable on mobile. The source's larger light-theme display type is intentionally adapted to the WMS dark theme.
- Spacing and layout rhythm: removing the duplicated right-side summary leaves a single, centered working area. On mobile the step controls stack with clear tap separation.
- Colors and visual tokens: the active step uses the existing accent token; inactive steps are visually subdued and remain labeled, so state is not color-only. Disabled primary action remains distinguishable from the active step.
- Image quality and asset fidelity: no image asset is needed for this flow and none was substituted with CSS art or placeholder imagery.
- Copy and content: instructions were reduced to the current question, a concise field label, and the minimum search hint. Product categories use the business vocabulary: Manguera, Conexión o acople, and Ensamble.

## Comparison history

1. Initial implementation showed a three-step control plus a legacy, static five-step sidebar. This created duplicated progress and could not reflect client-side selection.
   - Fix: removed the sidebar from the page and made the three-step control the sole progress surface.
2. Initial client capture repeated the required-customer message in three places.
   - Fix: retained one concise search hint and removed duplicate warning/support copy.
3. Revised desktop and mobile captures show no actionable P0, P1, or P2 differences against the intended one-task-at-a-time interaction model.
4. The sales-entry screen was extended with the configured-assembly path after this capture. A new browser-rendered capture is required before visual QA can pass again.

## Findings

No actionable P0, P1, or P2 findings remain for the reviewed empty-state desktop and mobile screens.

## Open questions

- Catalog family links currently open the common catalog handoff. A later catalog enhancement can prefilter each link by family once the authoritative catalog family attributes are confirmed.

## Implementation checklist

- [x] Present a single current task and lock later steps until their prerequisite is complete.
- [x] Keep product selection mandatory before the create action can be enabled.
- [x] Use industry-specific product-family vocabulary.
- [x] Verify 390 px mobile width without horizontal overflow.
- [x] Verify the focused no-AWS unit/contract suite, typecheck, and lint.

## Follow-up polish

- [P3] Add actual category imagery only if approved product photography or manufacturer assets are available; do not use decorative placeholders.

final result: blocked
