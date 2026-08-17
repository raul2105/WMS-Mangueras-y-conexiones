# Evidencia E2E autenticada AWS dev — 2026-08-17

Entorno validado: `https://d2b1ltxtvypxr4.cloudfront.net` (AWS dev, no producción).

Las credenciales usadas fueron las cuentas controladas del seed, configuradas en AWS dev y en GitHub Actions. No se documentan contraseñas, hashes ni URLs de base de datos.

## Corridas browser

| Corrida | Resultado | Evidencia |
| --- | --- | --- |
| RBAC por rol | 7/7 passed | SYSTEM_ADMIN, MANAGER, WAREHOUSE_OPERATOR y SALES_EXECUTIVE autenticaron y respetaron rutas/menú/permisos |
| Continuidad directa, ensamble y mixta | 3/3 passed | Creación, confirmación, asignación, toma de tareas, escaneo, surtido, ensamble, preparación, entrega y descarga documental |
| KAN-128 read-only | 1/1 passed | Promesa comercial y handoff preservado hacia la bandeja de almacén |
| Sales commercial flow | 5/5 passed | Worklist, captura guiada, filtros, vista móvil y supervisión |

Las capturas, videos y trazas quedan en los artefactos locales ignorados de Playwright (`test-results/`) y el reporte HTML en `playwright-report/aws-controlled/`.

## Matriz V1–V8

| Escenario | Estado | Evidencia actual | Pendiente para cierre total |
| --- | --- | --- | --- |
| V1 Promesa con reserva existente | Parcial verificado | Browser read-only KAN-128 + validación de servicio/persistencia | Browser write controlado que fuerce la revalidación de inventario y capture antes/después |
| V2 Pedido directo | Verificado | E2E browser AWS; persistencia y documentos descargables | Aceptación operativa humana |
| V3 Pedido sólo configurado | Verificado | E2E browser AWS; orden de producción, consumo y retorno al pedido | Aceptación operativa humana |
| V4 Pedido mixto | Verificado | E2E browser AWS; directo y ensamble independientes hasta entrega | Aceptación operativa humana |
| V5 Ownership físico | Parcial verificado | Pruebas PostgreSQL de asignación `MANAGER_REQUIRED` y bloqueo de toma | E2E browser con operador asignado y segundo operador bloqueado |
| V6 Preparado para entrega | Verificado | E2E browser AWS; ubicación, notas, usuario físico y entrega | Aceptación operativa humana |
| V7 Excepción/faltante | Parcial verificado | Pruebas PostgreSQL de faltante, rollback y bloqueo | E2E browser con intento bloqueado y resolución auditada |
| V8 Idempotencia/concurrencia | Parcial verificado | Pruebas PostgreSQL de retry, doble entrega y sobre-entrega | E2E browser con dos sesiones y evidencia visual de resultado |

## Estado de aceptación

La aceptación operativa humana no se infiere de una prueba automatizada. Deben confirmar explícitamente los responsables de:

- Ventas: promesa, captura, seguimiento y entrega.
- Almacén: toma, escaneo, surtido, faltante y preparación.
- Manager: confirmación, asignación, supervisión y excepciones.
- Administración: usuarios, auditoría, compras y control de accesos.

Jira no debe cerrarse mientras V1, V5, V7, V8 y la aceptación por rol no cuenten con evidencia completa.

## Higiene de datos

Los 271 esquemas históricos `t_run_*` no fueron eliminados. Su limpieza sigue requiriendo autorización destructiva separada.
