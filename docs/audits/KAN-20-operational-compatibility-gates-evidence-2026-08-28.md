# KAN-20 — Evidencia PostgreSQL de gates operativos

Fecha: 2026-08-28  
Rama: `codex/kan19-136-5w2h-waves-0-1`  
Entorno de prueba: PostgreSQL AWS mediante esquemas aislados `t_run_*`

## Alcance ejecutado

La suite `tests/assembly/compatibility-operational-gates.integration.test.ts` verifica la revalidación fail-closed en los tres puntos operativos que pueden convertir una decisión técnica en movimiento físico:

1. liberación de lista de surtido;
2. confirmación del surtido y traslado a WIP;
3. cierre y consumo del ensamble.

## Escenarios y resultados

| Escenario | Resultado esperado | Resultado observado |
|---|---|---|
| Regla vigente cambia a `BLOCKED` antes de liberar | Rechazo técnico sin cambiar estados ni auditar liberación | Aprobado |
| Regla gobernada ausente | `COMPATIBILITY_REVIEW_REQUIRED` y rollback | Aprobado |
| Regla gobernada retirada | `COMPATIBILITY_REVIEW_REQUIRED` y rollback | Aprobado |
| Sustitución de componente sin regla vigente | Sin tarea surtida ni movimiento de inventario | Aprobado |
| Override documentado y snapshot vigente | Liberación permitida con `overrideReused=true` | Aprobado |
| Revisión de regla posterior al override | Override invalidado antes de mover inventario | Aprobado |
| Regla retirada después del surtido y antes del cierre | Sin consumo, sin cierre y sin movimiento `OUT` | Aprobado |

## Ejecución

Comando:

```powershell
npm run test:postgres -- run tests/assembly/compatibility-operational-gates.integration.test.ts --reporter=verbose
```

Resultado:

- 6 pruebas nuevas de compatibilidad operacional aprobadas;
- 11 pruebas aprobadas en los tres archivos seleccionados por Vitest;
- 0 fallas;
- 3 esquemas aislados eliminados por el runner: `cleaned 3 isolated schemas`;
- duración total: 77.47 s.

## Criterio de cierre

Esta evidencia cubre la capa de servicio y persistencia PostgreSQL. No constituye por sí sola aceptación operativa humana ni cierre de KAN-20. Permanece pendiente la evidencia browser de los mensajes y acciones para cada rol, además del checklist UAT/PM correspondiente.
