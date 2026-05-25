# KAN-77 – Orden genérica (GENERIC) – Estado no reconciliado

## Veredicto

Este archivo **no debe usarse como evidencia de cierre técnico** de `KAN-77`.

Al corte del `2026-05-25`, la reconciliación entre Jira, GitHub y el estado visible del producto no sostiene un cierre defendible de punta a punta.

## Hechos observables

- La única señal nueva visible en `main` asociada a `KAN-77` es el commit documental `dacf079` (`docs: add KAN-77 closed summary`) del `2026-05-20`.
- El propio documento anterior dejaba `Pull Request #<PR_NUMBER>` sin completar y todavía pedía hacer merge del PR en `main`.
- No apareció en la evidencia pública del repositorio un PR, commit o archivo de implementación verificable que respalde las rutas citadas por el documento anterior.
- El archivo vivo `app/(shell)/production/orders/[id]/page.tsx` todavía muestra para órdenes genéricas: `la edición manual permanece en ruta de mantenimiento temporal`.
- Jira mantiene `KAN-77` en estado `En curso`.

## Interpretación operativa

La mejor lectura sustentada es que existió una intención de cierre o un borrador de cierre documental, pero **no una reconciliación técnica completa**.

Hoy no hay paridad suficiente entre:

- ticket operativo,
- evidencia ejecutable en GitHub,
- pruebas o checks verificables,
- y estado funcional consolidado.

## Condición mínima para volver a cerrarlo

`KAN-77` solo debería tratarse como cerrado cuando exista, en la misma ventana de trabajo:

1. PR o commit verificable en `main` con implementación real.
2. Evidencia explícita de pruebas o checks.
3. Actualización del documento canónico `docs/WMS_CAPABILITIES_STATUS.md`.
4. Transición consistente del ticket en Jira.

## Nota

Este archivo se conserva solo como registro de que hubo una narrativa de cierre no reconciliada y para evitar que la corrida siguiente vuelva a asumir ese cierre por error.
