# Architecture Decision Records (ADRs)

Este directorio contiene los registros de decisiones arquitectónicas del proyecto WMS Rigentec.

## ¿Qué es un ADR?

Un ADR (Architecture Decision Record) documenta una decisión técnica importante junto con su contexto, alternativas consideradas y consecuencias.

## Estructura

Cada ADR sigue esta plantilla:
- **Estado:** Propuesto | Aceptado | Rechazado | Deprecado | Supersedido por [ADR-XXX]
- **Fecha:** Fecha de la decisión
- **Decisores:** Quién participó en la decisión
- **Contexto:** Por qué necesitamos tomar esta decisión
- **Decisión:** Qué decidimos hacer
- **Consecuencias:** Impacto positivo y negativo
- **Alternativas:** Qué otras opciones consideramos

## Índice de ADRs

| ID | Título | Estado | Fecha |
|----|--------|--------|-------|
| [001](./001-arquitectura-base.md) | Arquitectura Base del Sistema WMS | Aceptado | 2026-02-03 |

## Crear un nuevo ADR

1. Crea un archivo `XXX-titulo-descriptivo.md` (XXX = próximo número)
2. Usa la plantilla del ADR-001 como referencia
3. Documenta la decisión con el máximo contexto posible
4. Actualiza este README con la nueva entrada

## Cuándo crear un ADR

Crea un ADR cuando tomes decisiones que:
- Impacten la arquitectura del sistema
- Sean difíciles de revertir
- Afecten a múltiples módulos o equipos
- Tengan trade-offs significativos
- Establezcan patrones o convenciones

## Ejemplos de decisiones que merecen ADR

✅ Cambiar de SQLite a PostgreSQL  
✅ Implementar CQRS para inventario  
✅ Elegir NextAuth vs Clerk para autenticación  
✅ Agregar sistema de eventos para trazabilidad  
✅ Definir estrategia de testing (unit vs e2e)  

❌ Renombrar una variable  
❌ Cambiar un componente UI  
❌ Fix de bugs puntuales  

---

**Mantenedor:** Tech Lead  
**Última actualización:** 2026-02-03
