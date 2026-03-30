# Importación de productos desde CSV

El proyecto incluye un importador que hace upsert de productos y categorías, y reemplaza el inventario por SKU usando ubicaciones.

## Uso rápido

1. Coloca el archivo CSV dentro del repo. Recomendado: `data/products.csv`.
2. Ejecuta:

```powershell
npm run import:products -- --file data/products.csv
```

Simulación sin escribir en base:

```powershell
npm run import:products -- --file data/products.csv --dry-run
```

## Encabezados esperados

El archivo debe traer fila de encabezado.

Columnas soportadas:

- `sku` obligatorio y único.
- `name` obligatorio.
- `type` obligatorio: `HOSE`, `FITTING`, `ASSEMBLY`, `ACCESSORY`.
- `description` opcional.
- `brand` opcional.
- `base_cost` opcional numérico.
- `price` opcional numérico.
- `category` opcional; crea o vincula `Category`.
- `quantity` opcional; si falta usa `0`.
- `location` opcional; si el SKU se repite, la cantidad se agrupa por ubicación.
- `attributes` opcional; acepta JSON y se guarda como cadena JSON.
- `referenceCode` opcional.
- `imageUrl` opcional.

Consulta la plantilla en `data/products.sample.csv`.

## Comportamiento

- Los productos se actualizan por `sku`.
- Las categorías se actualizan por nombre.
- Si una ubicación no existe, se crea en el almacén `DEFAULT`.
- Si el CSV no trae ubicación, se usa `STAGING-DEFAULT`.
- El inventario se reemplaza por SKU en cada importación, así que el proceso es idempotente.
- La importación usa `InventoryService.adjustStock` para mantener consistencia en movimientos y cantidades.

## Validaciones relevantes

- Si falta `sku`, `name` o `type`, la importación falla.
- Si `type` no coincide con los valores permitidos, falla.
- Si un mismo SKU trae conflictos de datos base entre filas, falla.
- Si `attributes` no es JSON válido, se conserva como texto dentro de un objeto JSON.

## Troubleshooting

- Si el CSV trae comas dentro de campos, usa comillas.
- Si trabajas con separador decimal por coma, el importador intenta normalizarlo.
- Si quieres validar estructura sin tocar base, usa `--dry-run`.
