# GCP Baselines (Local Mirror)

## Enfoque de uso
- Usar este baseline como guia operativa para implementar, configurar, operar, validar y desplegar.
- Priorizar instrucciones secuenciales y accionables sobre explicaciones teoricas.

## Postura low-cost por defecto
- Priorizar Free Trial/Free Tier con controles estrictos.
- Diseñar arquitectura simple, serverless-first y apagable.

## Recomendado
- Cloud Run para cargas variables.
- Cloud Storage para estaticos/archivos.
- Logging con retencion limitada.

## Evitar por defecto
- Recursos permanentes de alto costo en prototipos.
- Configuraciones de red costosas sin necesidad validada.
- Observabilidad sin limites de retencion/cuota.

## Controles obligatorios
- Budgets y alerts por umbrales.
- Quotas definidas para servicios criticos.
- Etiquetas minimas: `project`, `env`, `owner`, `cost-center`.

## Checklist pre-deploy
1. Estado real de Free Trial y creditos confirmado.
2. Elegibilidad Free Tier por servicio validada.
3. Presupuesto/alertas/cuotas activos.
4. Estimacion de costo base y plan de rollback documentados.
5. Entorno objetivo confirmado (dev/staging/prod sin ambiguedad).
6. Validacion posterior definida (salud, disponibilidad, respuesta esperada).

## Cleanup / kill switch
- Proceso de apagado/eliminacion de entornos no productivos.
- Revision periodica de recursos huérfanos.
- Policies lifecycle para artefactos y datos temporales.

## Validacion post-deploy
- Confirmar estado del servicio y endpoint principal.
- Revisar errores visibles y logs criticos iniciales.
- Verificar señales basicas de costo anomalo (picos, recursos encendidos no esperados).

## Bloqueos para no desplegar
- Entorno no claro.
- Riesgo alto en datos, IAM, billing o red critica.
- Costo relevante incierto.
- Falta de evidencia para validar resultado.

## Nota
Guia operativa de costo; no garantiza costo cero ni resultado financiero.
