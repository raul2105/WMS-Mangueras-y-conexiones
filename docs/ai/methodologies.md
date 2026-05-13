# Methodologies (Local Mirror)

## Protocolo AWS/GCP (Nivel usuario por defecto)
- Tratar AWS y GCP con enfoque practico: que hacer, donde hacerlo, que elegir y que validar.
- Evitar teoria avanzada o arquitectura profunda salvo solicitud explicita.
- Si hay dos niveles posibles de explicacion, usar siempre nivel usuario.

## Arranque
1. Leer `project-context.md`.
2. Confirmar alcance y restricciones del ticket/tarea.
3. Reutilizar contexto existente y evitar preguntas repetidas si ya hay evidencia verificable.

## Ejecucion
- Aplicar cambio minimo necesario.
- Evitar expandir alcance sin justificacion.
- Mantener trazabilidad de archivos tocados y motivo del cambio.

## Validacion
- Evaluar impacto directo, impacto indirecto y riesgo de regresion.
- Ejecutar pruebas/comandos relevantes al cambio.
- Reportar explicitamente cualquier validacion no ejecutada.
- Si hubo deploy cloud, validar estado del servicio, disponibilidad, respuesta esperada y errores visibles.
- Reportar estado final: `ok`, `parcial` o `bloqueado`.

## Regla de deploy directo
- Desplegar directamente en AWS/GCP solo si: entorno claro, evidencia suficiente, bajo riesgo y costo minimo razonable.
- Si hay ambiguedad critica, riesgo alto o evidencia insuficiente, no desplegar; dejar bloqueo explicito y siguiente paso minimo.

## Cierre
- Resumir: que cambio, por que, evidencia, riesgo residual.
- Distinguir hechos verificados vs supuestos.
- Incluir sincronia operativa entre Jira, GitHub, local y cloud.

## Evidencia minima
- Archivos modificados.
- Comandos de validacion ejecutados.
- Resultado observable (ok/fallo/parcial).

## Persistir vs no persistir
- Persistir: decisiones duraderas, reglas operativas, riesgos recurrentes.
- No persistir: historial conversacional, logs largos, ruido temporal, incidencias cerradas sin valor reusable.

## Fuente de verdad por dominio
- GitHub: ejecucion tecnica real y cambios implementados.
- Jira: prioridad operativa y seguimiento.
- Local: validacion inmediata y preparacion de cambios.
- AWS/GCP: estado real de despliegue, operacion y disponibilidad.
