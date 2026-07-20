# Wireframes UX de baja fidelidad: Sales → Almacén

Fecha: 2026-07-09
Estado: propuesta; no implementada.

## Reglas de diseño

- Una acción primaria por pantalla.
- La siguiente acción aparece antes que la explicación.
- Estados y bloqueos se expresan con texto, icono y color; nunca solo con color.
- Evidencia, notas y auditoría permanecen disponibles mediante divulgación progresiva.
- El lenguaje cambia según el rol, pero los estados conservan la misma semántica.

## Wireframe 1 — Nuevo Pedido / Ventas

```text
+------------------------------------------------------------------+
| Nuevo pedido                         [Borrador]                  |
| Cliente > Producto > Promesa > Confirmación                     |
+------------------------------------------------------------------+
| SIGUIENTE ACCIÓN                                                 |
| Selecciona el cliente                                            |
| [Buscar cliente...............................................]  |
+------------------------------------------------------------------+
| Contexto del pedido                                               |
| Cliente: pendiente        Almacén: pendiente                     |
| Fecha compromiso: pendiente                                      |
+------------------------------------------------------------------+
| Línea de producto                                                 |
| [Buscar producto]   [Usar equivalencia]                          |
| Sin línea seleccionada — no se puede confirmar                   |
+------------------------------------------------------------------+
| [Cancelar]                         [Completa datos requeridos]   |
+------------------------------------------------------------------+
| Detalles opcionales v                                             |
| Notas | herramientas | evidencia                                  |
+------------------------------------------------------------------+
```

Decisión UX: el resumen persistente se reduce a un estado compacto; solo el primer requisito pendiente se muestra como instrucción principal.

## Wireframe 2 — Promesa de disponibilidad / Ventas

```text
+------------------------------------------------------------------+
| Validar disponibilidad                 [Promesa pendiente]       |
+------------------------------------------------------------------+
| Producto: MANG-001     Cantidad: [ 10 ]   Almacén: [ Central v ] |
| [Consultar disponibilidad]                                       |
+------------------------------------------------------------------+
| Resultado                                                         |
| Disponible para vender: 12                                       |
| Estado: Promesa segura       Revisado: hace 3 min                |
|                                                                  |
| [Continuar al pedido]   [Revisar equivalencias]                  |
+------------------------------------------------------------------+
| Detalle técnico v                                                |
| Reservas | ubicaciones | reglas | historial                      |
+------------------------------------------------------------------+
```

Decisión UX: el resultado debe responder si se puede prometer, no obligar a Ventas a interpretar inventario técnico.

## Wireframe 3 — Cola física / Operador

```text
+------------------------------------------------------------------+
| Ejecución de almacén                         Turno / Almacén     |
+------------------------------------------------------------------+
| [Por surtir 12] [En proceso 4] [Bloqueados 2] [Verificar 3]      |
| [Listos para entrega 5]                                         |
+------------------------------------------------------------------+
| PRIORIDAD                                                        |
| PI-2026-0004   Cliente prueba       Vence hoy                   |
| Surtido directo | Central | 3 líneas | Sin responsable           |
| [Tomar tarea]                                      [Ver detalle] |
|                                                                  |
| PI-2026-0005   Cliente industrial   Bloqueado: faltante         |
| [Resolver faltante]                               [Ver detalle] |
+------------------------------------------------------------------+
```

Decisión UX: reemplazar `Mis pedidos` por buckets físicos y hacer que cada tarjeta exponga la acción del operador, no una explicación del proceso.

## Wireframe 4 — Recepción rápida / Operador

```text
+------------------------------------------------------------------+
| Registrar entrada                         [Recepción]           |
+------------------------------------------------------------------+
| 1. Artículo                                                       |
| [Escanear]  [SKU / referencia.................................]  |
| Cantidad [     ]                                                 |
+------------------------------------------------------------------+
| 2. Destino                                                        |
| Almacén [ Central v ]      Ubicación [ Rack-A-01 v ]             |
+------------------------------------------------------------------+
| 3. Confirmar                                                      |
| MANG-001 · 10 piezas · Central / Rack-A-01                       |
| [Registrar entrada]                                               |
+------------------------------------------------------------------+
| Evidencia y notas v                                               |
| OC/factura | archivo | alias | notas operativas                   |
+------------------------------------------------------------------+
```

Decisión UX: documento y evidencia dejan de competir con los tres datos necesarios para registrar físicamente la entrada.

## Wireframe 5 — Excepciones / Gerencia

```text
+------------------------------------------------------------------+
| Control operativo                         Actualizado 08:42       |
+------------------------------------------------------------------+
| 12 Por surtir    4 En riesgo    2 Bloqueados    5 Listos entrega |
+------------------------------------------------------------------+
| ATENCIÓN PRIORITARIA                                             |
| 1. PI-2026-0004  Vencido sin liberar       [Reasignar]           |
| 2. PI-2026-0005  Surtido sin movimiento    [Abrir bloqueo]      |
| 3. PI-2026-0006  Ensamble pendiente        [Ver ensamble]       |
+------------------------------------------------------------------+
| Análisis v                                                        |
| Por almacén | Por cliente | Antigüedad | Capacidad               |
+------------------------------------------------------------------+
```

Decisión UX: las métricas deben ser enlaces a excepciones concretas; `Ver reportes` queda como acción secundaria.

## Responsive móvil

En móvil se conservará esta estructura:

1. Encabezado y estado actual.
2. Una única acción primaria de ancho completo.
3. Filtros en carrusel horizontal accesible o menú desplegable, sin desbordamiento.
4. Tarjetas verticales con cliente, estado, ubicación y próxima acción.
5. Detalles secundarios colapsados.

No se debe trasladar literalmente la cuadrícula desktop a móvil.

## Componentes compartidos a considerar en la futura implementación

- `FlowStatusBadge`: estado textual, variante y descripción accesible.
- `NextActionCard`: acción primaria, causa y responsable.
- `OperationalQueueTabs`: buckets físicos responsive.
- `ProgressRail`: progreso compacto para Ventas.
- `EvidenceDisclosure`: evidencia y notas fuera del primer plano.
- `ExceptionList`: priorización gerencial con severidad y antigüedad.

## Fuera de alcance de este documento

- Cambios en componentes React/CSS.
- Cambios de tokens o tema.
- Cambios en enums Prisma o migraciones.
- Reglas nuevas de autorización.
- Deploy o validación contra AWS.
