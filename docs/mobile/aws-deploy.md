# AWS Mobile Deployment Guide (No Deploy by Default)

## Objetivo

Preparar la capa movil AWS sin afectar al WMS local y sin costos altos.

Arquitectura activa en este paquete:

- PWA en S3 + CloudFront
- Cognito para auth
- API Gateway HTTP API + Lambda
- DynamoDB on-demand
- SQS + DLQ
- CloudWatch logs con retencion corta

## Requisitos

- AWS CLI con perfil `Rigentec-SCMayer`
- Node.js 22+
- NPM

Verificacion:

```bash
aws sts get-caller-identity --profile Rigentec-SCMayer
```

## Ambientes

El entorno se define con `MOBILE_ENV`:

- `dev`
- `staging`
- `prod`

Archivos de configuracion:

- `mobile/infra/cdk/config/dev.json`
- `mobile/infra/cdk/config/staging.json`
- `mobile/infra/cdk/config/prod.json`

## Comandos de preparacion

```bash
cd mobile/infra/cdk
npm install
set AWS_PROFILE=Rigentec-SCMayer
set MOBILE_ENV=dev
npm run synth
npm run diff
```

No ejecutar `npm run deploy` hasta autorizacion explicita.

## Runtime objetivo

- Desarrollo local del repo: `Node 22.x`
- CI: `Node 22.x`
- Lambda runtime objetivo: `NODEJS_22_X`

Si el runtime Lambda `Node 22` no estuviera habilitado temporalmente en la cuenta/región objetivo, el fallback operativo permitido es:

- repo, CI y tooling en `Node 22.x`;
- Lambdas temporalmente en `Node 20.x` solo hasta cerrar compatibilidad operativa.

## Convencion de nombres

Prefijo por ambiente:

- `rigentec-wms-mobile-dev`
- `rigentec-wms-mobile-staging`
- `rigentec-wms-mobile-prod`

Recursos principales:

- `{prefix}-api`
- `{prefix}-users`
- `{prefix}-web-client`
- `{prefix}-inventory`
- `{prefix}-assembly-requests`
- `{prefix}-product-drafts`
- `{prefix}-integration`
- `{prefix}-integration-dlq`

## IAM minimo runtime (Lambdas)

- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`
- `dynamodb:GetItem`
- `dynamodb:Query`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `sqs:SendMessage`

Se asignan por tabla/cola especifica, no con `*`.

## Rollback operativo

- Mantener o volver `MOBILE_ENABLED=false`
- Mantener `INVENTORY_SEARCH_ENABLED=false`
- Mantener `ASSEMBLY_REQUESTS_ENABLED=false`
- Mantener `PRODUCT_DRAFTS_ENABLED=false`

Con esos flags, la capa movil queda desactivada sin tocar el sistema local.
