# KAN-20 — Evidencia UX del gate técnico en AWS DEV

## Identidad de la ejecución

- Entorno: AWS DEV, sin producción habilitada.
- URL validada: `https://d2b1ltxtvypxr4.cloudfront.net`.
- SHA desplegado: `028a3c49a133a37735815fcf861d32feb5724fd5`.
- Release: `dev-028a3c49a133-20260904T024836Z`.
- Cabeza del PR al ejecutar la prueba: `e75a85cdba51e6789f5c2d5b61cdd7c78feb5514`.
- Diferencia intencional: `e75a85c` sólo corrige la prueba E2E para respetar los límites RBAC; el código de aplicación desplegado sigue siendo `028a3c4`.
- Resultado Playwright: `1 passed (29.4s)`; escenario funcional completado en 22.9 s.

## Recorrido y evidencia

1. Ventas abrió la orden configurada con reglas aprobadas. La pantalla mostró presión, temperatura, medio, aplicación, método, explicación y siguiente acción. El rol no recibió el control de almacén para liberar materiales.
   - `evidence/KAN-20/aws-dev-sales-technical-approved-028a3c4-1440.png`
2. La orden comercial controlada se confirmó y el operador de almacén abrió la misma orden. Con decisión `APROBADO`, el control `Liberar materiales` estuvo disponible.
   - `evidence/KAN-20/aws-dev-warehouse-technical-approved-028a3c4-1440.png`
3. La regla controlada se cambió a `BLOCKED` y la página se revalidó. El estado cambió a `BLOQUEADO`, se mostró causa y siguiente acción, y desapareció `Liberar materiales`.
   - `evidence/KAN-20/aws-dev-warehouse-technical-blocked-028a3c4-1440.png`
4. El mismo bloqueo se verificó a 390 px. Las tarjetas, campos y mensaje de recuperación se reacomodaron sin desbordamiento horizontal visible.
   - `evidence/KAN-20/aws-dev-warehouse-technical-blocked-028a3c4-390.png`

## Validaciones posteriores

- `/api/health`: HTTP 200, `ok=true`, `environment=dev`, `db=up` y SHA `028a3c4` a las `2026-09-04T03:06:16.036Z`.
- Limpieza de datos controlados en RDS: 0 productos `TSA*`, 0 almacenes `TSA*`, 0 clientes `TSA*` y 0 fuentes `FICHA-TSA*`.
- Trace durable: `output/evidence/KAN-20/aws-ux-028a3c4/trace.zip`.
- SHA-256 del trace: `C8B81D22CF393DD5499E47B985D17D7EFEB987ADD28D6C65F346C8F65E0A9E9B`.

## Auditoría UX/UI

### Comprobado visualmente

- Jerarquía clara: orden, configuración, seguridad técnica y trabajo operativo aparecen en el orden de decisión.
- Estados semánticos consistentes: verde para aprobado y rojo para bloqueado, ambos con texto explícito.
- El mensaje de bloqueo incluye causa y una acción siguiente, sin depender sólo del color.
- La acción crítica se concede por rol y se retira preventivamente cuando la decisión técnica cambia.
- El diseño móvil conserva el contenido esencial y transforma los campos operativos en tarjetas verticales.

### Hallazgos que siguen abiertos

- Traducir etiquetas internas como `ENTRY_FITTING`, `HOSE`, `EXIT_FITTING`, `REQ` y `WIP` a vocabulario operativo en español.
- Reducir la longitud vertical móvil y mantener la siguiente acción crítica más cercana al contexto que la habilita.
- Capturar el tercer estado `REQUIRES_REVIEW` en navegador, además de aprobado y bloqueado.
- Ejecutar axe, recorrido exclusivo por teclado, foco visible, zoom 200 % y validación con lector de pantalla. Las capturas no certifican por sí solas WCAG 2.2 AA.
- Completar UAT/aceptación PM separada para ventas, almacén, manager y administración.

## Decisión de cierre

La evidencia demuestra en AWS DEV el comportamiento `APPROVED` y `BLOCKED`, la separación de acciones por rol, la revalidación contra persistencia y la recuperación de datos de prueba. KAN-20 debe permanecer abierta hasta cubrir `REQUIRES_REVIEW`, accesibilidad ejecutable y aceptación operativa de los roles aplicables. El PR #108 permanece en borrador y no debe fusionarse mientras existan checks requeridos pendientes o fallidos.
