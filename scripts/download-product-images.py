#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import re
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import requests
from ddgs import DDGS
from PIL import Image, UnidentifiedImageError

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "public" / "product-images"
DEFAULT_CSV = Path(
    r"C:\Users\raul_\Desktop\Rigentec  Soluciones de ingenieria y Tecnológicas\06_Recursos\01_Catalogos_Proveedores\wms_catalogo_import.csv"
)
REQUEST_TIMEOUT = 25
MIN_BYTES_DEFAULT = 20_000


def log(message: str) -> None:
    print(message, flush=True)


def sanitize_image_key(value: str) -> str:
    return re.sub(r'[<>:"/\\\\|?*]', "_", value)


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def extract_series(row: dict[str, str]) -> str:
    brand = (row.get("brand") or "").strip().lower()
    reference = (row.get("referenceCode") or "").strip().upper()
    sku = (row.get("sku") or "").strip().upper()

    if brand == "strobbe":
        match = re.match(r"^(\d+\.\d+)", reference or sku)
        if match:
            return match.group(1)

    if reference:
        if "-" in reference:
            return reference.split("-", 1)[0]
        if brand == "gates":
            match = re.match(r"^\d+([A-Z].+)$", reference)
            if match:
                return match.group(1)
        if "." in reference:
            return reference.split(".", 1)[0]
        return reference

    parts = [part for part in sku.split("-") if part]
    if len(parts) >= 3:
        token = parts[2]
        if brand == "gates":
            match = re.match(r"^\d+([A-Z].+)$", token)
            if match:
                return match.group(1)
        if brand == "strobbe":
            match = re.match(r"^(\d+\.\d+)", token)
            if match:
                return match.group(1)
        return token

    return sku or "UNKNOWN"


def clean_name_for_query(name: str) -> str:
    value = name.upper()
    value = re.sub(r"\b\d+(?:[./-]\d+)?(?:MM|CM|PSI|BAR|IN)\b", " ", value)
    value = re.sub(r'[\d/]+"', " ", value)
    value = re.sub(r"\bRAYAL[- ]?\d+\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:90]


def build_queries(row: dict[str, str], series: str) -> list[str]:
    brand = (row.get("brand") or "").strip()
    reference = (row.get("referenceCode") or "").strip()
    name = clean_name_for_query((row.get("name") or "").strip())
    category = (row.get("category") or "").strip()
    type_name = (row.get("type") or "").strip()

    queries = []
    if brand and series:
        queries.append(f"{brand} {series} {type_name} {category}".strip())
    if brand and reference:
        queries.append(f"{brand} {reference} {type_name}".strip())
    if brand and name:
        queries.append(f"{brand} {series} {name}".strip())
    if brand and category:
        queries.append(f"{brand} {series} {category}".strip())

    deduped: list[str] = []
    seen = set()
    for query in queries:
        compact = re.sub(r"\s+", " ", query).strip()
        if compact and compact not in seen:
            seen.add(compact)
            deduped.append(compact)
    return deduped


def is_existing_real_image(path: Path, min_existing_bytes: int) -> bool:
    return path.exists() and path.stat().st_size >= min_existing_bytes


def should_skip_group(targets: Iterable[Path], skip_existing: bool, min_existing_bytes: int) -> bool:
    if not skip_existing:
        return False
    target_list = list(targets)
    return bool(target_list) and all(is_existing_real_image(path, min_existing_bytes) for path in target_list)


def fetch_image_bytes(query: str) -> bytes | None:
    log(f"  buscando: {query}")
    with DDGS() as ddgs:
        try:
            results = list(ddgs.images(query, max_results=8))
        except Exception as error:  # pragma: no cover - network instability
            log(f"  error DDGS: {error}")
            return None

    for index, item in enumerate(results, start=1):
        url = (item.get("image") or item.get("thumbnail") or "").strip()
        if not url or not url.lower().startswith(("http://", "https://")):
            continue
        try:
            response = requests.get(
                url,
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0 WMS Rigentec Image Importer"},
            )
            response.raise_for_status()
            if len(response.content) < 5_000:
                continue
            log(f"  descargada opcion {index}: {url}")
            return response.content
        except Exception as error:  # pragma: no cover - network instability
            log(f"  fallo opcion {index}: {url} -> {error}")
            continue
    return None


def normalize_to_jpeg(image_bytes: bytes, destination: Path) -> bool:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            normalized = image.convert("RGB")
            normalized.thumbnail((1200, 1200))
            destination.parent.mkdir(parents=True, exist_ok=True)
            normalized.save(destination, format="JPEG", quality=90, optimize=True)
        return True
    except (UnidentifiedImageError, OSError) as error:
        log(f"  imagen invalida: {error}")
        return False


def copy_group_image(source: Path, targets: Iterable[Path], skip_existing: bool, min_existing_bytes: int) -> tuple[int, int]:
    copied = 0
    skipped = 0
    for target in targets:
        if skip_existing and is_existing_real_image(target, min_existing_bytes):
            skipped += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied += 1
    return copied, skipped


def run(args: argparse.Namespace) -> int:
    csv_path = Path(args.csv).expanduser()
    if not csv_path.exists():
        log(f"ERROR: CSV no encontrado: {csv_path}")
        return 1

    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = read_rows(csv_path)
    brand_rows = [row for row in rows if (row.get("brand") or "").strip().lower() == args.brand.lower()]
    if not brand_rows:
        log(f"ERROR: no hay filas para la marca {args.brand}")
        return 1

    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in brand_rows:
        groups[extract_series(row)].append(row)

    temp_dir = ROOT / ".tmp-product-images"
    temp_dir.mkdir(parents=True, exist_ok=True)

    total_groups = len(groups)
    downloaded_groups = 0
    skipped_groups = 0
    failed_groups = 0
    copied_files = 0

    log(f"Marca: {args.brand}")
    log(f"CSV: {csv_path}")
    log(f"Series detectadas: {total_groups}")
    log(f"Destino: {output_dir}")

    for index, (series, items) in enumerate(sorted(groups.items()), start=1):
        representative = items[0]
        targets = [output_dir / f"{sanitize_image_key(item['sku'])}.jpg" for item in items if item.get("sku")]
        log(f"[{index}/{total_groups}] serie={series} skus={len(targets)}")

        if should_skip_group(targets, args.skip_existing, args.min_existing_bytes):
            skipped_groups += 1
            log("  omitida por --skip-existing (todas las imagenes superan el umbral)")
            continue

        image_bytes = None
        for query in build_queries(representative, series):
            image_bytes = fetch_image_bytes(query)
            if image_bytes:
                break
            time.sleep(args.sleep_seconds)

        if not image_bytes:
            failed_groups += 1
            log("  sin resultado valido; se conserva placeholder/existente")
            continue

        temp_file = temp_dir / f"{args.brand.lower()}-{re.sub(r'[^A-Za-z0-9._-]+', '_', series)}.jpg"
        if not normalize_to_jpeg(image_bytes, temp_file):
            failed_groups += 1
            continue

        copied, skipped = copy_group_image(temp_file, targets, args.skip_existing, args.min_existing_bytes)
        copied_files += copied
        downloaded_groups += 1
        log(f"  serie actualizada: copiados={copied} omitidos={skipped}")
        time.sleep(args.sleep_seconds)

    log("")
    log("Resumen")
    log(f"  grupos descargados: {downloaded_groups}")
    log(f"  grupos omitidos: {skipped_groups}")
    log(f"  grupos sin imagen: {failed_groups}")
    log(f"  archivos copiados: {copied_files}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Descarga y replica imagenes de producto por serie.")
    parser.add_argument("--brand", required=True, help="Marca a procesar")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Ruta del CSV maestro")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directorio de salida")
    parser.add_argument("--skip-existing", action="store_true", help="Omite grupos cuya imagen existente supera el umbral")
    parser.add_argument(
        "--min-existing-bytes",
        type=int,
        default=MIN_BYTES_DEFAULT,
        help="Tamano minimo para considerar una imagen existente como valida",
    )
    parser.add_argument("--sleep-seconds", type=float, default=0.4, help="Pausa entre peticiones")
    return parser


if __name__ == "__main__":
    try:
        raise SystemExit(run(build_parser().parse_args()))
    except KeyboardInterrupt:
        log("Proceso interrumpido por el usuario.")
        raise SystemExit(130)
