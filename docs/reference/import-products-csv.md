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
- `subcategory` (optional; stored directly on `Product.subcategory`)
- `quantity` (optional number; defaults to 0)
- `location` (optional; if multiple rows share the same sku, quantities are summed by location)
- `attr_*` (optional; flat technical attribute columns such as `attr_pressure_psi`, `attr_inner_diameter`, `attr_thread`, `attr_material`)
- `attributes` (optional legacy/advanced JSON object; stored into `Product.attributes`)
- `referenceCode` (optional; alias for scans/OCR)
- `imageUrl` (optional; local path or URL for the product image)

See the template at `data/products.sample.csv`.

### Flat attributes convention

Normal operation should use flat `attr_*` columns. The importer collects every non-empty `attr_*` column into the internal attributes object.

Examples:

- HOSE: `attr_norm`, `attr_pressure_psi`, `attr_working_pressure_bar`, `attr_inner_diameter`, `attr_outer_diameter`
- FITTING: `attr_norm`, `attr_thread`, `attr_angle`, `attr_material`
- ASSEMBLY: `attr_norm`, `attr_length_mm`, `attr_components`

Rules:

- Empty `attr_*` values are ignored.
- Numeric-looking `attr_*` values are converted to numbers only when safe and unambiguous.
- `attr_components` can use pipe-separated values in the template, and the importer stores them as a list.
- Do not mix legacy `attributes` JSON with any populated `attr_*` columns in the same row.
- If you still use `attributes`, it must be a valid JSON object only.

## Behavior

- Products are **upserted** by `sku`.
- Categories are **upserted** by `name`.
- Subcategory is updated directly on the product row.
- Inventory is **replaced per SKU** on each import (so imports are idempotent).
- Flat `attr_*` columns are converted to the internal attributes object automatically.
- Legacy `attributes` JSON remains supported for compatibility, but it must not be combined with `attr_*` columns on the same row.

## Images

- You can set `imageUrl` directly in the CSV, for example `/uploads/products/PKR-HOS-201-4.jpg`.
- You can also drop image files into `public/uploads/products` and link them in bulk:

```powershell
npm run link:product-images -- --dir public/uploads/products --dry-run
npm run link:product-images -- --dir public/uploads/products
```

- The file name without extension must match `sku` or `referenceCode`.

## Strict Validation Summary

The CSV importer now enforces strict validation with no permissive escape hatches:

 - **Numeric Fields**: Empty values become `null` (for `base_cost`/`price`) or `0` (for `quantity`). Non-empty values must be plain non-negative numbers matching `/^[0-9]+(\.[0-9]+)?$/` (no currency symbols, commas, units, or letters)
 - **Attributes**: Flat `attr_*` columns are supported; legacy `attributes` must be a JSON object if provided; mixing both on the same row is rejected
 - **Location**: Must reference an existing location code; no auto-creation or fallback to `STAGING-DEFAULT`
 - **CLI Flags Removed**: `--allow-raw-attributes` and `--allow-create-locations` are no longer supported
 - **Error Format**: All validation errors include line numbers (e.g., `Line 4: invalid quantity "10 pzas" (must be a finite non-negative number)`)

## Troubleshooting

	- If your CSV uses commas inside fields, ensure those fields are quoted.
	- If you get type errors, verify `type` matches exactly one of the allowed values.
	- If a SKU appears multiple times with conflicting `name/type/brand/category/subcategory`, the importer will fail validation.
