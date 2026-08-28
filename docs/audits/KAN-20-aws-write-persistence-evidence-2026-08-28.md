# KAN-20 — E2E AWS DEV de escritura y persistencia

Fecha: 2026-08-28 (America/Mexico_City)

## Trazabilidad

- Entorno: AWS DEV
- Aplicación: `https://d2b1ltxtvypxr4.cloudfront.net`
- Rol browser: `SALES_EXECUTIVE`
- Commit desplegado y probado: `3f84606e5e0e429c34b5a52ab36dd04fdb08abb5`
- Release: `dev-3f84606e5e0e-20260828T162821Z`
- Health posterior: `ok=true`, `db=up`, ambiente `dev`
- CI del commit: `33189829999`
- Configuración: `playwright.aws-write.config.ts`
- Prueba: `tests/e2e/sales-configured-assembly.spec.ts`

## Hallazgo y corrección

La primera ejecución contra el release anterior detectó que el formulario sí
capturaba el contexto operativo, pero `createSalesRequestWithLines()` omitía
esos cinco campos al transformar líneas múltiples. Backend actuó correctamente
en modo fail-closed y rechazó la creación por contexto faltante.

El commit probado agrega el mapeo de presión, temperatura, medio, aplicación y
método de ensamble, además de un contrato de regresión que exige reenviar los
cinco valores.

## Ejecución aprobada

El E2E creó datos controlados con prefijo único `TSA*`:

- un almacén y ubicaciones de prueba;
- un cliente;
- cuatro productos e inventario controlado;
- una fuente técnica y dos reglas vigentes `APPROVED`;
- un pedido mixto con un producto directo y dos ensambles configurados.

La prueba autenticada terminó **1/1 verde en 23.2 s**. La relectura directa de
PostgreSQL confirmó en ventas y producción:

- presiones `180` y `160` bar;
- temperaturas `60` y `50` °C;
- medio `Aceite hidráulico`;
- aplicación `Línea de retorno`;
- método `Prensado según ficha técnica`;
- decisión de producción `compatibilityStatus=APPROVED`.

## Evidencia y limpieza

- Captura final: `evidence/KAN-20/aws-dev-write-persistence-3f84606.png`
- Trace Playwright local: `output/evidence/KAN-20/aws-write-3f84606/trace.zip`
- SHA-256 del trace: `57AA18F96B1554735313D352A22BDAFFE055433C8D133E4892E1AAB15A8449BB`

Después de `afterAll`, la consulta de control confirmó:

- productos `TSA*`: `0`;
- almacenes `TSA*`: `0`;
- clientes `TSA*`: `0`.

## Alcance pendiente

Esta evidencia cierra el hallazgo de serialización y demuestra escritura,
persistencia, relectura y cleanup para creación de pedido. KAN-20 debe seguir
abierta hasta completar las matrices BLOCKED/REQUIRES_REVIEW, regla
ausente/retirada, sustitución y los gates de liberación, surtido y cierre, más
la aceptación PM/UAT.
