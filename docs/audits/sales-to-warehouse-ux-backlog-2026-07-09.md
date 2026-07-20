# Backlog priorizado de mejora Sales → Almacén

Fecha: 2026-07-09  
Estado: propuesta derivada del levantamiento; requiere validación funcional con AWS antes de cerrar alcance.

| Prioridad | Lote | Resultado | Alcance | Dependencia |
|---|---|---|---|---|
| P0 | Validación funcional del handoff | Evidencia completa desde pedido hasta entrega | E2E por rol, cantidades, estados, staging y entrega | DB AWS disponible |
| P1 | Contrato de estados compartidos | Lenguaje único para pendiente, bloqueado, listo y entregado | Helpers, badges, narrativa y pruebas de contrato | Confirmar estados persistidos |
| P1 | Cola física de almacén | Operador ve buckets y siguiente acción física | Filtros, ownership operativo, vacíos y acciones | Confirmar ownership físico |
| P1 | Nuevo Pedido compacto | Menos instrucciones y una sola fuente de progreso | Captura, promesa, línea y confirmación | Mantener guardas funcionales |
| P2 | Recepción progresiva | Registrar entrada con foco en artículo/cantidad/destino | Evidencia y notas bajo divulgación | Validar requisitos de auditoría |
| P2 | Staging operativo | Confirmar ubicación y preparación física | Bahía, cantidades, responsable, faltantes | Confirmar modelo existente o necesidad de ticket |
| P2 | Excepciones gerenciales | Priorizar por impacto y antigüedad | Dashboard, bloqueos, reasignación | Datos reales de operación |
| P3 | Responsive y accesibilidad | Operación usable en móvil y teclado | Overflow, focus, contraste, lectura de estados | Pruebas browser disponibles |

## Orden recomendado

1. Validar funcionalmente con AWS el flujo completo y los permisos.
2. Cerrar el contrato de estados y ownership.
3. Implementar la cola física y el componente de siguiente acción.
4. Simplificar Nuevo Pedido y Recepción usando los componentes compartidos.
5. Añadir staging operativo si la validación confirma que hoy solo existe elegibilidad.
6. Ejecutar regresión E2E desktop, móvil, RBAC y accesibilidad.

## Criterio de no expansión

Si la validación AWS demuestra que staging, ownership físico o entrega no tienen persistencia suficiente, se debe abrir un ticket funcional separado antes de modificar la UI. No se debe resolver una ausencia de modelo de datos solo con cambios visuales.

