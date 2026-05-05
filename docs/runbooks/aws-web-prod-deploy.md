# Deploy AWS web `prod-ready`

Runbook para desplegar la app web remota en AWS con OpenNext, Lambda, CloudFront y CDK.

## Prerrequisitos

- AWS CLI funcional con el perfil objetivo.
- Node.js 22.x.
- `npm install` ejecutado en el repo.
- `infra/cdk/config/prod.json` o `dev.json` completo.
- En `prod`, `officeIpCidr` debe estar restringido; no puede ser `0.0.0.0/0` ni `CHANGE_ME/32`.

## Comandos recomendados

Validación previa:

```bash
aws sts get-caller-identity --profile <tu-perfil>
npm run env:postgres:check
npm run env:postgres:tcp
npm run prisma:validate
npm run prisma:generate
npm run test:regression:postgres
npm run typecheck
npm run build
```

Deploy `dev`:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy\aws-web.ps1 -Environment dev -Profile wms-mobile-dev
```

Smoke web post-deploy (reproducible, fuera del script):

```bash
npm run smoke:web -- --base-url <cloudfront-dev-url>
```

Deploy `prod`:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy\aws-web.ps1 -Environment prod -Profile <perfil-prod>
```

Deploy con smoke de auth:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy\aws-web.ps1 -Environment prod -Profile <perfil-prod> -SmokeAuthEmail <usuario> -SmokeAuthPassword <password>
```

## Qué hace el script

1. Valida credenciales AWS y configuración del ambiente.
2. Genera Prisma client para PostgreSQL.
3. Construye `.open-next/` salvo que se use `-SkipBuild`.
4. Limpia engines de Prisma no compatibles con Lambda ARM64.
5. Corre `prisma migrate deploy` si ya existen outputs del stack.
6. Despliega el stack CDK para el ambiente objetivo.
7. Si era bootstrap inicial, corre migraciones después del primer deploy.
8. Actualiza `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_BASE_URL` y `AUTH_TRUST_HOST` en Lambda.
9. Verifica `AUTH_SECRET` / `NEXTAUTH_SECRET` en Lambda cuando falten.
10. Ejecuta smoke check contra `CloudFrontUrl/api/health`.
11. Si se proporcionan `-SmokeAuthEmail` y `-SmokeAuthPassword`, valida `login -> ruta protegida -> logout`.

## Overrides útiles

- `-StackName`: fuerza stack distinto al del config.
- `-LambdaFunctionName`: fuerza nombre de Lambda server.
- `-SkipBuild`: reutiliza `.open-next/`.
- `-SkipMigrate`: omite migraciones; solo usar de forma excepcional.
- `-SmokeAuthEmail` y `-SmokeAuthPassword`: ejecutan smoke real de autenticación al final del deploy.

## Checklist post-release

- Confirmar `CloudFrontUrl` en la salida del script.
- Verificar `GET /api/health`.
- Validar login, una ruta protegida y logout. Si el script no corrió auth smoke, hacerlo manualmente.
- Ejecutar `npm run smoke:web -- --base-url <cloudfront-url>` y conservar salida como evidencia.
- Confirmar que `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_BASE_URL` en Lambda apuntan al dominio de CloudFront.
- Confirmar que `AUTH_SECRET`/`NEXTAUTH_SECRET` estén presentes en Lambda.
- Revisar que el stack `prod` conserve IP restringida y protección contra borrado.

Si no hay credenciales de auth smoke (`WMS_SMOKE_AUTH_EMAIL/WMS_SMOKE_AUTH_PASSWORD`), registrar explícitamente `auth smoke SKIPPED`; no marcar como validación completa de login.

## Ruta KAN-29 (entorno y migración confiable)

Para KAN-29, la ruta recomendada de validación en DEV es:

1. `env:postgres:check` y `env:postgres:tcp`
2. `prisma:validate` + `prisma:generate`
3. `test:regression:postgres` + `build`
4. `deploy:aws:web`
5. `smoke:web` sobre URL real de CloudFront

Nota: `mobile staging` es un entorno intermedio móvil y no reemplaza esta validación web.

## Rollback operativo

- Si el problema es solo de runtime/config, re-ejecutar el mismo deploy con la corrección.
- Si el problema viene de migración, revisar el historial Prisma antes de redeployar.
- Si el problema viene del frontend, reconstruir `.open-next/` desde el commit estable y volver a ejecutar el script.
