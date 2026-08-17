# Auditoría de esquemas aislados de pruebas — 2026-08-17

## Alcance

Auditoría read-only del PostgreSQL AWS dev para evaluar la retención de esquemas `t_run_*`. No se ejecutó `DROP SCHEMA`, no se modificó la base de datos operativa y no se eliminó evidencia.

## Evidencia observada

- 271 esquemas con patrón válido `t_run_<timestamp>_<runId>_w<worker>`.
- 264 esquemas contienen tablas y 7 están vacíos.
- 56,465 objetos y 10,901 tablas en el conjunto auditado.
- El catálogo estima aproximadamente 383 MB en páginas de tablas e índices; la medición exacta de un esquema representativo fue 5.9 MB.
- Antigüedad observada: 2026-06-18 a 2026-08-05.
- Con retención de 30 días y corte generado el 2026-08-17: 260 candidatos, 29 grupos de ejecución y 11 esquemas conservados.
- No se detectaron foreign keys cruzadas, funciones o vistas externas que referencien `t_run_*`.
- No había sesiones externas no-idle usando esos esquemas durante la consulta final.

Un esquema representativo sí contiene datos de prueba: auditorías, sincronizaciones, inventario, movimientos y órdenes. Por eso la acción sigue siendo destructiva aunque no sea productiva.

## Corrección aplicada al pipeline

El wrapper de PostgreSQL ya elimina los esquemas de su propia corrida, pero antes sólo registraba un error de limpieza y permitía que el proceso terminara con el resultado de las pruebas. Ahora:

1. Verifica que no queden esquemas de la corrida.
2. Reporta cuántos esquemas limpió.
3. Devuelve código de salida fallido si la limpieza falla.

La allowlist de retención se genera con:

```text
npm run db:test-schemas:list
```

o con otro corte explícito:

```text
node scripts/db/list-stale-test-schemas.cjs --retention-days 30 --json
```

## Plan de limpieza propuesto

1. Renovar la sesión AWS y crear un snapshot RDS verificable.
2. Congelar ejecuciones PostgreSQL y confirmar que no existan sesiones activas.
3. Generar y revisar la allowlist exacta.
4. Eliminar un solo grupo histórico aprobado.
5. Validar `/api/health`, conexión, pruebas básicas y Jira/GitHub.
6. Continuar en lotes de 10–20 esquemas.
7. Comparar conteo esperado contra conteo real y conservar el manifest.

La fase destructiva requiere autorización separada. Hasta entonces, los 271 esquemas permanecen intactos.
