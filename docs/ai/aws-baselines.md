# AWS Baselines (Local Mirror)

## Enfoque de uso
- Usar este baseline como guia operativa para implementar, configurar, operar, validar y desplegar.
- Priorizar instrucciones secuenciales y accionables sobre explicaciones teoricas.

## Postura low-cost por defecto
- Diseñar para costo minimo: simple, apagable y medible.
- Asumir riesgo de cobro hasta validar elegibilidad real de cuenta.

## Recomendado
- S3 + CloudFront para estaticos.
- Lambda + API Gateway para cargas intermitentes.
- Monitoreo basico con retencion acotada.

## Evitar por defecto
- Recursos always-on no criticos.
- NAT Gateway permanente en prototipos.
- Servicios sobredimensionados sin demanda comprobada.

## Controles obligatorios
- Budgets y billing alerts activos.
- Tagging minimo: `project`, `env`, `owner`, `cost-center`.
- Limites/cuotas configurados y apagado programado en entornos no productivos.

## Checklist pre-deploy
1. Elegibilidad de Free Tier/creditos confirmada.
2. Presupuesto y alertas configurados.
3. Estimacion de costo mensual base documentada.
4. Plan de rollback y cleanup definido.
5. Entorno objetivo confirmado (dev/staging/prod sin ambiguedad).
6. Validacion posterior definida (salud, disponibilidad, respuesta esperada).

## Cleanup / kill switch
- Rutina de apagado para dev/staging.
- Revision periodica de recursos huérfanos.
- Lifecycle/TTL para datos temporales.

## Validacion post-deploy
- Confirmar estado del servicio y endpoint principal.
- Revisar errores visibles y logs criticos iniciales.
- Verificar señales basicas de costo anomalo (picos, recursos always-on inesperados).

## Bloqueos para no desplegar
- Entorno no claro.
- Riesgo alto en datos, IAM, billing o red critica.
- Costo relevante incierto.
- Falta de evidencia para validar resultado.

## Nota
Guia operativa de costo; no garantiza costo cero ni resultado financiero.
