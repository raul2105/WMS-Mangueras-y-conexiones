# AWS DEV Schedule Control

Automatizacion de ahorro en `DEV` para `WmsWebDevStack`:

- Lunes a viernes: `08:00` start, `20:00` stop
- Sabado: `08:00` start, `16:00` stop
- Zona horaria: `America/Mexico_City`

## Recursos controlados

- RDS: `wms-web-dev-pg` (`start/stop`)
- Lambda server: `wms-web-dev-server` (concurrency `0` en stop)
- Lambda image: `wms-web-dev-image` (concurrency `0` en stop)
- Regla warmer: `wms-web-dev-warmer-every-5m` (`disable` en stop, `enable` en start)

## Override manual inmediato

Requiere perfil AWS correcto (`wms-mobile-dev` o el que uses en DEV).

### Encender ahora

```powershell
aws lambda invoke `
  --function-name start-dev-services `
  --payload "{}" `
  --cli-binary-format raw-in-base64-out `
  out-start.json
```

### Apagar ahora

```powershell
aws lambda invoke `
  --function-name stop-dev-services `
  --payload "{}" `
  --cli-binary-format raw-in-base64-out `
  out-stop.json
```

## Verificacion rapida

```powershell
aws rds describe-db-instances --db-instance-identifier wms-web-dev-pg --query "DBInstances[0].DBInstanceStatus" --output text
aws lambda get-function-concurrency --function-name wms-web-dev-server
aws lambda get-function-concurrency --function-name wms-web-dev-image
aws events describe-rule --name wms-web-dev-warmer-every-5m --query "State" --output text
```

## Notas operativas

- En `stop`, CloudFront sigue activo, pero backend queda sin servicio por diseno.
- Tras `start`, RDS puede tardar varios minutos en quedar `available`.
