# Mobile API v1 Contracts

## Scope

Estos contratos son estables desde Fase 1 y no deben romperse sin version nueva.

Base path: `/v1/mobile`

## Endpoints

### `GET /v1/mobile/health`

Uso: healthcheck del plano movil.

Response `200`:

```json
{
  "ok": true,
  "service": "wms-mobile-edge",
  "apiVersion": "v1",
  "timestamp": "2026-04-07T19:00:00.000Z"
}
```

### `GET /v1/mobile/version`

Uso: version de contrato, build y flags publicas.

Response `200`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "build": "2026.04.07",
  "releaseDate": "2026-04-07",
  "flags": {
    "mobile_enabled": true,
    "inventory_search_enabled": false,
    "assembly_requests_enabled": false,
    "product_drafts_enabled": false
  },
  "timestamp": "2026-04-07T19:00:00.000Z"
}
```

### `GET /v1/mobile/me/permissions`

Uso: contexto del usuario movil autenticado.

Auth: JWT valido de Cognito (HTTP API JWT authorizer).

Response `200`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "userId": "cognito-sub",
  "displayName": "Manager WMS",
  "roleCodes": [
    "MANAGER"
  ],
  "permissionCodes": [
    "mobile.profile.read",
    "inventory.search",
    "assembly_requests.create",
    "product_drafts.create"
  ],
  "preferredWarehouseCode": "WH-MAIN",
  "timestamp": "2026-04-07T19:00:00.000Z"
}
```

Response `401`:

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

### `GET /v1/mobile/inventory/search`

Uso: consulta cloud de inventario (read model) para experiencia movil.

Auth: JWT valido de Cognito (HTTP API JWT authorizer).

Response `200`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "query": "manguera",
  "items": [
    {
      "sku": "HOS-0001",
      "name": "Manguera industrial 1/2",
      "availableQty": 24,
      "warehouseCode": "WH-MAIN",
      "updatedAt": "2026-04-07T19:00:00.000Z"
    }
  ],
  "timestamp": "2026-04-07T19:00:00.000Z"
}
```

### `POST /v1/mobile/assembly-requests`

Uso: intake cloud de solicitud de ensamble.

Auth: JWT valido de Cognito (HTTP API JWT authorizer).

Response `201`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "requestId": "52ecdf5d-d2ca-4608-a4b5-3579207394f8",
  "status": "PENDING_LOCAL_SYNC",
  "createdAt": "2026-04-07T19:00:00.000Z"
}
```

### `GET /v1/mobile/assembly-requests/{requestId}`

Uso: consulta del estado de una solicitud de ensamble.

Auth: JWT valido de Cognito (HTTP API JWT authorizer).

Response `200`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "requestId": "52ecdf5d-d2ca-4608-a4b5-3579207394f8",
  "status": "PENDING_LOCAL_SYNC",
  "warehouseCode": "WH-MAIN",
  "createdAt": "2026-04-07T19:00:00.000Z",
  "updatedAt": "2026-04-07T19:00:00.000Z",
  "payload": {
    "warehouseCode": "WH-MAIN",
    "items": []
  },
  "timestamp": "2026-04-07T19:00:00.000Z"
}
```

### `POST /v1/mobile/product-drafts`

Uso: intake cloud de borradores de productos nuevos.

Auth: JWT valido de Cognito (HTTP API JWT authorizer).

Response `201`:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "draftId": "6206708b-f9fb-4f90-99fd-b64797def17b",
  "status": "PENDING_LOCAL_SYNC",
  "createdAt": "2026-04-07T19:00:00.000Z"
}
```

## Compatibility rules

- No eliminar campos existentes en `v1`.
- Campos nuevos solo opcionales en `v1`.
- Cambios incompatibles requieren `v2`.
- Toda funcionalidad nueva debe respetar feature flags.
