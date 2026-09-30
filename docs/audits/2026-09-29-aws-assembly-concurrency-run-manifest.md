# Manifiesto de prueba PostgreSQL AWS: concurrencia de ensamble

Estado: completada; las tres pruebas pasaron y el runner verificó la limpieza del esquema.

## Identidad y destino

- Run ID: **awsasm20260929_7fe680fa9a**
- Perfil AWS: **Raul_ITsupport**
- Identidad AWS verificada: cuenta **904891391424**, arn:aws:iam::904891391424:user/Raul_ITsupport
- Host PostgreSQL verificado sin leer ni registrar credenciales: **wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com:5432**
- Base: **wms**
- Retención reportada para el entorno: un día; la prueba no la modifica.
- Esquema esperado para el único archivo: **t_awsasm20260929_7fe680fa9a_f6d1cc0af30ed714d**

## Casos autorizados

Se ejecutará únicamente **tests/assembly/concurrency.integration.test.ts** mediante **npm run test:postgres -- --maxWorkers=1 tests/assembly/concurrency.integration.test.ts**.

1. Dos transacciones reservan desde la misma lectura inicial del inventario. Debe quedar una reserva y un movimiento.
2. Dos solicitudes confirman la misma tarea de surtido. Debe quedar una confirmación y una transferencia.
3. Dos solicitudes confirman tareas distintas del mismo work order. Un conflicto puede requerir reintento; inventario, movimientos y estado agregado deben coincidir con la operación que se confirmó.

## Efectos y limpieza

- El runner consulta pg_namespace en public antes de ejecutar y aborta si ya existe un esquema con este Run ID.
- La preparación crea un esquema derivado del hash estable del path del archivo y ejecuta prisma db push --skip-generate --accept-data-loss exclusivamente contra ese esquema recién creado.
- Los casos insertan temporalmente filas de almacén, ubicaciones, productos, inventario, órdenes, líneas, pick lists, tareas, movimientos y datos de trazabilidad/etiquetas dentro de ese esquema.
- El runner elimina únicamente esquemas que coincidan con ^t_awsasm20260929_7fe680fa9a_f[0-9a-f]{16}$ y verifica que no quede ninguno.
- El esquema public solo se consulta para validar el Run ID y para localizar el catálogo de esquemas durante la limpieza. No se ejecutan migraciones, seeds, truncados ni escrituras en public.
- No se cambia la retención del entorno. No se reutiliza el esquema si falla el preflight; debe elegirse otro Run ID para un nuevo intento.

## Resultado

- Ejecutado con el perfil AWS **Raul_ITsupport** y el Run ID registrado arriba.
- Resultado: **3/3 pruebas aprobadas**; una reserva, un movimiento en la carrera de reserva, un pick/transfer en la carrera de la misma tarea, y un solo pick confirmado con estado agregado parcial en la carrera entre tareas diferentes.
- El runner informó la limpieza de un esquema aislado y verificó que no quedaran esquemas con el patrón de este Run ID.
- No se modificaron esquemas públicos ni la política de retención.
