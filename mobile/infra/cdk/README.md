# Mobile Infra (CDK)

Infra serverless minima para la capa movil AWS:

- S3 + CloudFront para PWA.
- Cognito User Pool + Client.
- API Gateway HTTP API.
- Lambda handlers de contratos `v1/mobile/*`.
- DynamoDB (read model + intake stores).
- SQS (cola de integracion + DLQ).
- CloudWatch logs.

## Configuracion por ambiente

Los ambientes se definen en:

- `mobile/infra/cdk/config/dev.json`
- `mobile/infra/cdk/config/staging.json`
- `mobile/infra/cdk/config/prod.json`

Seleccion del ambiente:

```bash
set MOBILE_ENV=dev
```

## Uso local (sin deploy)

```bash
cd mobile/infra/cdk
npm install
npm run synth
npm run diff
```

## Deploy (cuando sea autorizado)

```bash
cd mobile/infra/cdk
set AWS_PROFILE=Rigentec-SCMayer
set MOBILE_ENV=dev
npm run deploy
```

## Nota

- Este paquete es independiente del build del monolito local.
- El despliegue no enciende negocio movil por defecto: todos los flags inician en `false`.
