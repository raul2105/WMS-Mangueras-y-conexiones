# WMS Mobile Web Shell

> **⚠️ DEPRECATED** — This standalone PWA shell is deprecated in favor of the responsive Next.js app.
> All mobile functionality is now integrated into the main application via `ResponsiveDataView`,
> `MobileActionBar`, and `CollapsibleFilters` components. This directory is kept for reference
> only and will be removed in a future release.

PWA shell minima para Fase 1.

## Config local

1. Copiar `config.template.js` como `config.js`.
2. Ajustar `apiBaseUrl`.
3. Elegir modo de auth:
   - `authMode: "mock"` para desarrollo rapido.
   - `authMode: "cognito"` para Hosted UI real.

`config.js` contiene solo configuracion publica y esta ignorado por git.

## Run local

```bash
npx serve mobile-web
```

## Deploy

Subir contenido de `mobile-web/` al bucket S3 y servir por CloudFront.

## Alcance fase actual

- Login/logout + restauracion basica de sesion.
- `GET /v1/mobile/health` y `GET /v1/mobile/version` publicos.
- `GET /v1/mobile/me/permissions` con token de sesion.
- `GET /v1/mobile/inventory/search` con token de sesion.
- `POST /v1/mobile/assembly-requests` y `GET /v1/mobile/assembly-requests/{requestId}`.
- `POST /v1/mobile/product-drafts`.
