# Mobile Edge Rearchitecture Proposal

## Objetivo

Llevar la experiencia AWS móvil a paridad real con el WMS local para flujos comerciales y de catálogo sin romper la arquitectura híbrida.

La PWA actual en `mobile-web/` sirve como base funcional mínima, pero no es la forma ideal de sostener crecimiento de UX, módulos y contratos.

## Dirección recomendada

La solución ideal es migrar de `mobile-web/` como shell HTML/JS estático a una app dedicada de Next.js, manteniendo el plano cloud separado del monolito local.

Propuesta objetivo:

- `apps/mobile-edge`
  - app Next.js para la experiencia AWS móvil
  - consume exclusivamente `/v1/mobile/*`
- `shared/ui`
  - topbar, sidebar, cards, tables, badges, filtros, page headers
- `shared/navigation`
  - mapa único de módulos, labels, perfiles efectivos y rutas
- `shared/contracts`
  - contratos Zod y tipos compartidos para mobile/local cuando aplique
- `domain/mobile-read-models`
  - modelos consultables cloud para catálogo, pedidos, disponibilidad y equivalencias
- `domain/mobile-intake`
  - modelos outbound como `assembly-requests` y `product-drafts`
- `workers/integration`
  - sincronización cloud -> local y local -> cloud

## Principios

- El WMS local sigue siendo `source of truth`.
- AWS móvil no se conecta directo al backend local.
- La paridad visual debe lograrse reutilizando primitives y mapa funcional, no duplicando pantallas de forma divergente.
- Toda operación cloud debe expresar estado de sincronización real.

## Módulos objetivo

Primera meta de paridad:

- Dashboard/inicio comercial
- Catálogo
- Pedidos de surtido
- Disponibilidad
- Equivalencias
- Alta de nuevos productos vía intake

Fuera de esta fase inicial:

- compras
- almacenes
- auditoría
- labels
- inventario operativo completo

## Cambios estructurales propuestos

### 1. Frontend móvil

- Reemplazar la PWA estática por una app Next dedicada.
- Reusar layout y patrones visuales del local.
- Mantener PWA installability desde el nuevo frontend.

### 2. Contratos

- Mantener `/v1/mobile/*` como frontera estable.
- Versionar por contrato, no por implementación visual.
- Centralizar schemas en una sola capa compartida.

### 3. Navegación y RBAC

- Definir un solo mapa funcional para local y mobile.
- Resolver perfil efectivo con precedencia explícita.
- Filtrar por:
  - módulo soportado en cloud,
  - permisos efectivos,
  - feature flags.

### 4. Datos cloud

- Read models para:
  - catálogo,
  - sales requests,
  - disponibilidad,
  - equivalencias.
- Intake models para:
  - assembly requests,
  - product drafts.

### 5. Integración

- Local publica cambios hacia read models cloud.
- Mobile cloud publica intakes hacia colas/workers de integración.
- UI debe mostrar:
  - `PENDING_LOCAL_SYNC`
  - `SYNCED`
  - `REJECTED`
  - u otros estados equivalentes de negocio/sync.

## Beneficios

- Menor deriva entre local y AWS móvil.
- Menor duplicación visual.
- Mejor mantenibilidad que crecer `mobile-web/app.js`.
- Camino más claro para abrir nuevos módulos móviles.

## Tradeoffs

- Inversión inicial mayor.
- Requiere reorganización del repo.
- Cambia pipeline de build/deploy del frontend móvil.
- Exige disciplina clara entre UI compartida y lógicas específicas de cada plano.

## Secuencia sugerida

1. Upgrade técnico a Node 22.x y runtime móvil.
2. Extensión de contratos `/v1/mobile/*` para ventas + catálogo.
3. Read models cloud necesarios.
4. Homologación visual mínima de la PWA actual.
5. Migración controlada a `apps/mobile-edge`.
6. Extracción de UI y navegación compartidas.
