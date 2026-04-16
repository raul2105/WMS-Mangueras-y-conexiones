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
npm run prisma:validate
npm run typecheck
npm run build
```

Deploy `dev`:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy\aws-web.ps1 -Environment dev -Profile wms-mobile-dev
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
- Confirmar que `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_BASE_URL` en Lambda apuntan al dominio de CloudFront.
- Confirmar que `AUTH_SECRET`/`NEXTAUTH_SECRET` estén presentes en Lambda.
- Revisar que el stack `prod` conserve IP restringida y protección contra borrado.

## Rollback operativo

- Si el problema es solo de runtime/config, re-ejecutar el mismo deploy con la corrección.
- Si el problema viene de migración, revisar el historial Prisma antes de redeployar.
- Si el problema viene del frontend, reconstruir `.open-next/` desde el commit estable y volver a ejecutar el script.
