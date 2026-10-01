# KAN-20 — Evidencia AWS DEV del contexto operativo

Fecha de captura: 2026-08-28 (America/Mexico_City)

## Trazabilidad

- Entorno: AWS DEV
- URL: `https://d2b1ltxtvypxr4.cloudfront.net`
- Rol: `SALES_EXECUTIVE`
- Ruta: `/production/requests/new`
- Commit desplegado: `192ef756e7beaead49f311fd85cb884510657682`
- Release: `dev-192ef756e7be-20260827T222640Z`
- Migración: `20260827221500_add_assembly_operating_context`

## Alcance verificado

Se autenticó una sesión real de ventas, se seleccionó un cliente existente y se
activó la opción **Ensamble**. No se agregó el ensamble, no se continuó a entrega
y no se envió el formulario; por lo tanto, esta captura no creó ni modificó
registros en AWS.

La pantalla desplegada muestra:

- presión de trabajo en bar;
- temperatura de operación en grados Celsius;
- medio o fluido;
- aplicación;
- método de ensamble;
- explicación visible de la validación fail-closed cuando una regla requiere
  datos faltantes.

## Evidencia visual

- Escritorio 1440 px: `evidence/KAN-20/aws-dev-sales-assembly-operating-context-1440.png`
- Móvil 390 px: `evidence/KAN-20/aws-dev-sales-assembly-operating-context-390.png`

## Resultado y límite de la evidencia

La composición es legible, conserva jerarquía y no genera desplazamiento
horizontal en 390 px. Los controles mantienen etiqueta visible y el flujo
explica la siguiente acción.

Esta evidencia prueba renderizado, RBAC de ventas y responsive en el SHA
desplegado. No sustituye el E2E de escritura/persistencia ni la aceptación
operativa de KAN-20. La tarea debe permanecer abierta hasta probar una orden
moderna configurada en los estados aprobado, bloqueado y requiere revisión,
incluyendo sustitución y revalidación en liberación, surtido y cierre.
