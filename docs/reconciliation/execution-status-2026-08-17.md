# Estado de ejecución y reconciliación — 2026-08-17

## Línea base

- `origin/main`: `16513e5c94d0758d9812a60451a07fd764e1308e`.
- Rama de ejecución local: `codex/execute-wms-pending-gates`.
- Commit de correcciones WMS: `7692326`.
- PR #104 fue integrado localmente en la rama de ejecución; `main` y Jira no fueron modificados.
- Archivos de trabajo no rastreados preexistentes fueron preservados.

## Cambios ejecutados

### Auditoría obligatoria

- Las mutaciones críticas ya no silencian fallas de `AuditLog`.
- Se conservaron nombres legacy por compatibilidad, pero ahora propagan el error.
- La aprobación de fuentes técnicas registra su auditoría dentro de la misma transacción.
- Alta de OC, alta de proveedor y alta de orden de producción registran auditoría dentro de la transacción de creación.

### Compatibilidad técnica

- Las reglas activas solo se consultan si tienen una fuente técnica `APPROVED`.
- La configuración de ensamble conserva estado de compatibilidad, aprobación explícita y reglas aplicadas.
- Se agregó cobertura para fuente técnica aprobada y rechazo de fallas de auditoría.

### Compras y reabasto

- PR #104 quedó integrado localmente: riesgo, prioridad, fecha compromiso y siguiente acción son visibles en la cola de compras.
- Se agregó política min–max por producto y almacén.
- Se agregó generación persistente de propuestas considerando inventario disponible, entradas confirmadas/en tránsito, consumo, lead time, MOQ y unidad de compra.
- Se agregó endpoint protegido por `purchasing.manage` para generar propuestas.
- Cada propuesta accionable o bloqueada queda auditada.
- El dashboard de compras muestra propuestas activas con producto, almacén, disponible, cantidad sugerida y motivo.

## Validación ejecutada

- `npm run prisma:validate`: verde.
- `npm run lint`: verde.
- `npm run typecheck`: verde.
- `npm run test:unit`: 46 archivos, 144 pruebas, verde.
- `git diff --check`: verde.
- `npm run build`: verde.
- `npm run build:opennext`: terminó con código 0; Windows reportó una advertencia no bloqueante al instalar dependencias de image optimization.

## Gaps que siguen abiertos

1. Aplicar y verificar la migración `20260817100000_add_replenishment_governance` en un PostgreSQL controlado; no se aplicó a AWS.
2. Ejecutar pruebas PostgreSQL con esquema aislado y evidencia de rollback, concurrencia y persistencia de propuestas; requiere autorización para crear datos de prueba.
3. Completar el flujo de aprobación de propuestas y conversión a orden de compra; el dashboard ya muestra la worklist activa.
4. Revisar transaccionalidad de los formularios de catálogo y proveedores existentes que todavía usan el alias legacy de auditoría fuera de una transacción local.
5. Ejecutar E2E autenticado V1–V8 con credenciales Manager/System Admin y validar AWS desplegado; no se realizó en esta rama.
6. Realizar captura visual actual por rol en navegador elegido por el usuario; no se declara aceptación UX desde pruebas de contrato.
7. Reconciliar en Jira KAN-86/KAN-87 con la rama/PR que corresponda y no cerrar KAN-125, KAN-127, KAN-128, KAN-133 ni los tickets finalizados cuya evidencia actual aún no exista.
