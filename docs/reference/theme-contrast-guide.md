# Guía de contraste y tokens

Esta base usa `data-theme="dark|light"` en `html` como fuente única de verdad. Todo componente nuevo debe tomar color desde tokens semánticos y no desde combinaciones rígidas pensadas solo para fondo oscuro.

## Texto

- `var(--text-primary)`: títulos, métricas, contenido principal.
- `var(--text-secondary)`: descripciones, breadcrumbs, labels secundarios, tablas.
- `var(--text-muted)`: placeholders, hints, metadata y estados vacíos.
- `var(--text-inverse)`: texto sobre botones o fondos de acento.

## Superficies

- `var(--bg-app)`: fondo general de página.
- `var(--bg-surface)`: tarjetas, inputs, toolbars y superficies estándar.
- `var(--bg-elevated)`: paneles destacados o cards más pesadas.
- `var(--bg-interactive)`: chips, pills, tags y botones secundarios.
- `var(--surface-hover)` / `var(--surface-selected)`: hover y selección.

## Bordes y tablas

- `var(--border-default)`: contorno principal.
- `var(--border-strong)`: componentes activos o con mayor énfasis.
- `var(--border-soft)`: divisores suaves y filas.
- `var(--table-header)`, `var(--table-stripe)`, `var(--table-hover)`: tablas legibles en ambos temas.

## Estados

- `status-neutral`, `status-info`, `status-success`, `status-warning`, `status-danger`: usar estas clases o sus tokens equivalentes para badges y estados.
- No introducir badges con `text-white`, `bg-white/10` o `border-white/10` si expresan estado; deben ser semánticos.

## Reglas prácticas

- Evitar `text-white`, `text-slate-*`, `bg-white/5`, `border-white/10` en componentes nuevos.
- Si un componente requiere compatibilidad con Tailwind utilitario existente, mapearlo a tokens o encapsularlo en un componente UI.
- El modo claro debe revisarse explícitamente en: título, texto secundario, inputs, placeholders, tablas, badges, empty states y acciones destructivas.
