# Configuración de base de datos (dev local + AWS web)

## Modo recomendado para desarrollo diario

- `dev-local-launcher.cmd` usa PostgreSQL AWS (misma data de pruebas en tiempo real).
- Requiere `DATABASE_URL` PostgreSQL en `.env`.
- Prisma client esperado en launcher: `prisma/postgresql/schema.prisma`.
- `DATABASE_URL` en `.env` puede declararse con o sin comillas (`DATABASE_URL=...` o `DATABASE_URL="..."`).

### Inicio rápido (AWS DB)

```powershell
dev-local-launcher.cmd
```

Si `DATABASE_URL` no apunta a `postgresql://` el launcher se detiene por seguridad.
Si falta o es invalida, el launcher ejecuta `maintenance\setup-aws.cmd`, reintenta lectura de `.env` y luego prueba `DATABASE_URL` de entorno de maquina antes de detenerse.

## AWS web runtime

- Schema: `prisma/postgresql/schema.prisma`.
- Deploy/migraciones: `scripts/deploy/aws-web.ps1`.
- El deploy ejecuta `prisma migrate deploy` y valida tablas base.

## Modo SQLite (solo compatibilidad local)

Se mantiene para pruebas aisladas o escenarios offline, pero no es el flujo principal de pruebas integradas.

- Schema SQLite: `prisma/schema.prisma`.
- Comandos manuales:

```powershell
npx prisma generate --schema prisma/schema.prisma
npx prisma db push --schema prisma/schema.prisma
```
