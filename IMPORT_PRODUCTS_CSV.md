# Import products from CSV

This project includes a CSV importer that upserts products/categories and replaces inventory per SKU.

## Quick start

1. Put your CSV file somewhere in the repo (recommended: `data/products.csv`).
2. Run:

```powershell
npm run import:products -- --file data/products.csv
```

Dry-run (validates + shows counts, no DB writes):

```powershell
npm run import:products -- --file data/products.csv --dry-run
```

## CSV format

A header row is required.

Columns:
- `sku` (required, unique key)
- `name` (required)
- `type` (required): `HOSE` | `FITTING` | `ASSEMBLY` | `ACCESSORY`
- `description` (optional)
- `brand` (optional)
- `base_cost` (optional number)
- `price` (optional number)
- `category` (optional; creates/links `Category` by name)
- `quantity` (optional number; defaults to 0)
- `location` (optional; if multiple rows share the same sku, quantities are summed by location)
- `attributes` (optional; JSON string; stored into `Product.attributes`)

See the template at `data/products.sample.csv`.

## Behavior

- Products are **upserted** by `sku`.
- Categories are **upserted** by `name`.
- Inventory is **replaced per SKU** on each import (so imports are idempotent).

## Troubleshooting

- If your CSV uses commas inside fields, ensure those fields are quoted.
- If you get type errors, verify `type` matches exactly one of the allowed values.
- If a SKU appears multiple times with conflicting `name/type/brand/category`, the importer will fail validation.
