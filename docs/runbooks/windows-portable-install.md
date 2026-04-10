# Manual de Instalacion WMS-SCMayher en Otra Computadora

**Version:** 2026-03-31

## 1. Objetivo
Este manual explica como instalar y operar WMS-SCMayher en otra computadora Windows usando el paquete **release portable** (sin instalar Node.js en el equipo destino).

## 2. Alcance
- Flujo principal: release portable
- Primera instalacion
- Arranque y parada diaria
- Mantenimiento basico
- Solucion de fallas comunes
- Migracion de datos desde equipo anterior

## 3. Prerrequisitos
- Windows 10/11 x64
- Acceso a la carpeta del release `wms-scmayher-<version>-windows-x64` (o su `.zip`)
- Permisos para ejecutar archivos `.cmd`

## 4. Estructura Esperada del Release
En la carpeta release deben existir, entre otros:
- `launcher.cmd`
- `stop.cmd`
- `uninstall.cmd`
- `maintenance\init-local.cmd`
- `maintenance\healthcheck.cmd`
- `maintenance\backup-db.cmd`
- `maintenance\restore-db.cmd`
- `app\server.js`
- `runtime\node\node.exe`
- `bootstrap\initial.db`

## 5. Instalacion en PC Nueva (Primera Vez)
### Paso 1. Copiar release al equipo destino
- Recomendado: `C:\WMS-SCMayher\`
- Si recibes `.zip`, extraelo completo

### Paso 2. Configurar base compartida AWS (obligatorio en modo aws)
Antes de iniciar, configurar variables de entorno:

```powershell
$env:WMS_DB_MODE = "aws"
$env:DATABASE_URL = "postgresql://<user>:<password>@<host>:5432/<db>?schema=public"
```

### Paso 3. Inicializar base local (solo si se usa modo local)
1. Abrir la carpeta del release
2. Ejecutar:
```cmd
maintenance\init-local.cmd
```
3. Resultado esperado:
	- Modo `local`: `Inicializacion completada.`
	- Modo `aws`: `inicializacion local omitida`

### Paso 4. Iniciar la aplicacion
Ejecutar:
```cmd
launcher.cmd
```
Resultado esperado: `WMS listo.` y apertura de navegador.

### Paso 5. Verificar acceso web
- `http://127.0.0.1:3002`
- (tambien funciona `http://localhost:3002`)

## 6. Operacion Diaria
Iniciar WMS:
```cmd
launcher.cmd
```

Detener WMS:
```cmd
stop.cmd
```

Validar salud:
```cmd
maintenance\healthcheck.cmd
```

## 7. Rutas Importantes de Datos y Logs
La informacion operativa no vive dentro de la carpeta release. Se guarda en:
- Base compartida (modo `aws`): PostgreSQL remota en `DATABASE_URL`
- Base SQLite local (modo `local`): `%LOCALAPPDATA%\wms-scmayer\data\wms.db`
- Respaldos: `%LOCALAPPDATA%\wms-scmayer\backups\`
- Logs: `%LOCALAPPDATA%\wms-scmayer\logs\`
- Estado/PID: `%LOCALAPPDATA%\wms-scmayer\run\`

## 8. Mantenimiento Basico
Crear respaldo manual:
```cmd
maintenance\backup-db.cmd
```

Restaurar respaldo:
```cmd
maintenance\restore-db.cmd
```

Nota: en modo `aws`, backup/restore SQLite se omiten porque la informacion esta en PostgreSQL compartida.

Chequeo rapido:
```cmd
maintenance\healthcheck.cmd
```

## 9. Fallas Comunes y Solucion
### Caso A: "No se encontro la base de datos..."
**Causa:** no se ejecuto la inicializacion.

**Solucion:**
1. Ejecutar `maintenance\init-local.cmd`
2. Volver a lanzar `launcher.cmd`

### Caso A2: "WMS_DB_MODE=aws requiere DATABASE_URL"
**Causa:** falta configurar `DATABASE_URL` para la base compartida.

**Solucion:**
1. Definir `WMS_DB_MODE=aws`
2. Definir `DATABASE_URL` PostgreSQL valida
3. Ejecutar `launcher.cmd` nuevamente

### Caso B: "El puerto 3002 ya esta en uso..."
**Causa:** otro proceso ocupa ese puerto.

**Solucion:**
1. Cerrar el proceso que usa el puerto 3002
2. Ejecutar `launcher.cmd` nuevamente

### Caso C: WMS no abre o cierra al iniciar
**Solucion:**
1. Ejecutar `maintenance\healthcheck.cmd`
2. Revisar logs en `%LOCALAPPDATA%\wms-scmayer\logs\`
3. Intentar `stop.cmd` y luego `launcher.cmd`

### Caso D: Permisos o bloqueo de archivos
**Solucion:**
1. Cerrar ventanas del WMS
2. Ejecutar `stop.cmd`
3. Reintentar accion

## 10. Anexo - Migracion de Datos desde Equipo Anterior
Objetivo: conservar inventario e historial al mover WMS a otra PC.

### En equipo anterior
1. Ejecutar:
```cmd
stop.cmd
```
2. Ejecutar:
```cmd
maintenance\backup-db.cmd
```
3. Localizar respaldo mas reciente en `%LOCALAPPDATA%\wms-scmayer\backups\`
4. Copiar la carpeta del respaldo a un medio seguro

### En equipo nuevo
1. Instalar release (seccion 5)
2. Ejecutar `maintenance\init-local.cmd` (si no se ha ejecutado antes)
3. Copiar respaldo al equipo nuevo
4. Restaurar con:
```cmd
maintenance\restore-db.cmd
```
5. Iniciar con:
```cmd
launcher.cmd
```
6. Validar datos en la aplicacion

## 11. Actualizacion de Version (Sin Perder Datos)
1. Ejecutar:
```cmd
stop.cmd
```
2. Reemplazar carpeta release por la nueva version
3. No borrar `%LOCALAPPDATA%\wms-scmayer\`
4. Ejecutar:
```cmd
launcher.cmd
```

Persistencia esperada:
- `%LOCALAPPDATA%\wms-scmayer\data\wms.db`
- `%LOCALAPPDATA%\wms-scmayer\backups\`

## 12. Desinstalacion
Ejecutar:
```cmd
uninstall.cmd
```

Modos:
- Conservando datos
- Limpieza completa

En limpieza completa se puede eliminar base y respaldos. Usar solo cuando sea intencional.

## 13. Exportar a PDF
Opcion recomendada (sin herramientas extra):
1. Abrir este archivo `.md` en Word o Edge
2. Imprimir
3. Seleccionar **Guardar como PDF**
4. Guardar como `docs\MANUAL_INSTALACION_WMS.pdf`
