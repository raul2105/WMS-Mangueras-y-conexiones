const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

function parseArgs(argv) {
  return {
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeNorm(normRaw, nameRaw) {
  const norm = normalize(normRaw);
  const name = normalize(nameRaw);
  const source = `${norm} ${name}`;

  if (!source) return null;
  if (source.includes("PUSH-LOK") || source.includes("PUSH LOK")) return "Push-Lok / baja presión";
  if (source.includes("GLOBALCORE")) return "GlobalCore / alta presión";
  if (source.includes("100R1") || source.includes("1SN") || source.includes("1SC")) return "SAE 100R1 / 1SN";
  if (source.includes("100R2") || source.includes("2SN") || source.includes("2SC")) return "SAE 100R2 / 2SN";
  if (source.includes("100R12") || source.includes("4SP") || source.includes("4SH")) return "SAE 100R12 / EN 856 4SH";
  if (source.includes("100R13")) return "SAE 100R13 / EN 856";
  if (source.includes("100R15")) return "SAE 100R15 / EN 856 4SP";
  if (source.includes("100R16")) return "SAE 100R16 / EN 857 2SC";
  if (source.includes("100R17")) return "SAE 100R17 / EN 857 1SC";
  if (source.includes("100R19")) return "SAE 100R19 / ISO 11237";
  if (source.includes("100R14")) return "SAE 100R14";
  if (source.includes("100R7")) return "SAE 100R7";
  if (source.includes("100R6")) return "SAE 100R6";
  if (source.includes("100R5")) return "SAE 100R5";
  if (source.includes("100R4")) return "SAE 100R4";
  if (source.includes("SAE J1405")) return "SAE J1405";
  if (source.includes("ISO 16028")) return "ISO 16028";
  return (normRaw || nameRaw || null);
}

function inferParkerConnectionSubcategory(attributes, name) {
  const description = normalize(attributes.descripcion || name);
  const code = normalize(attributes.codigo_desglosado);
  const source = `${description} ${code}`;

  if (source.includes("JIC")) return "JIC 37°";
  if (source.includes("NPT")) return "NPTF";
  if (source.includes("FERULOK") || source.includes("24° CONE") || source.includes("24 DEG")) return "Ferulok 24°";
  if (source.includes("SAE 45")) return "SAE 45°";
  if (source.includes("ASIENTO PLANO") || source.includes("FLAT FACE") || source.includes("ORFS")) return "ORFS / Cara Plana";
  if (source.includes("O-RING") || source.includes("ORB")) return "SAE O-Ring";
  if (source.includes("BSP")) return "BSP";
  if (source.includes("METRIC") || source.includes("METRICA")) return "Métrica";
  if (source.includes("FLANGE") || source.includes("BRIDA")) return "Brida";
  if (source.includes("LATON")) return "Latón";
  if (source.includes("ACCESORIO HIDRAULICO PARKER")) {
    if (source.includes("LATON")) return "Latón";
    return "Roscada";
  }
  if (source.includes("ROSCADA")) return "Roscada";
  return "Conexión hidráulica";
}

function inferDixonSubcategory(attributes, name) {
  const threadType = normalize(attributes.tipo_rosca);
  const description = normalize(attributes.tipo || name);
  const source = `${threadType} ${description}`;

  if (source.includes("JIC")) return "JIC 37°";
  if (source.includes("NPT")) return "NPTF";
  if (source.includes("SAE O-RING") || source.includes("ORB")) return "SAE O-Ring";
  if (source.includes("CARA PLANA") || source.includes("FACE SEAL") || source.includes("ORFS")) return "ORFS / Cara Plana";
  if (source.includes("BSP")) return "BSP";
  if (source.includes("METRICA")) return "Métrica";
  if (source.includes("BARRIL")) return "Conexiones de Barril";
  if (source.includes("VALVULA")) return "Válvulas Hidráulicas";
  return "Adaptador hidráulico";
}

function inferStrobbeSubcategory(attributes, name) {
  const description = normalize(attributes.description || name);

  if (description.includes("PROTECTOR EN ESPIR") || description.includes("D-RING")) return "Protector en espiral";
  if (description.includes("FERRULA") || description.includes("FERRULA")) return "Férrola";
  if (description.includes("ESPIGA")) {
    if (description.includes("JIC")) return "Espiga JIC";
    if (description.includes("NPT")) return "Espiga NPT";
    if (description.includes("ASIENTO PLANO")) return "Espiga Asiento Plano";
    if (description.includes("BSP")) return "Espiga BSP";
    if (description.includes("METRICA")) return "Espiga Métrica DIN";
    if (description.includes("BRIDA CODE 61")) return "Espiga Brida Code 61";
    if (description.includes("BRIDA CODE 62")) return "Espiga Brida Code 62";
    return "Espiga";
  }
  if (description.includes("PRE.") || description.includes("XTRAFIT") || description.includes("MEGAFIT")) {
    if (description.includes("JIC")) return "Prensable JIC";
    if (description.includes("NPT")) return "Prensable NPT";
    if (description.includes("ASIENTO PLANO")) return "Prensable Asiento Plano";
    if (description.includes("BSP")) return "Prensable BSP";
    if (description.includes("METRICA")) return "Prensable Métrica DIN";
    if (description.includes("BRIDA CODE 61")) return "Prensable Brida Code 61";
    if (description.includes("BRIDA CODE 62")) return "Prensable Brida Code 62";
  }
  return attributes.serie || "Accesorio Strobbe";
}

function inferSpecialHoseSubcategory(attributes, name) {
  const tipo = attributes.tipo || name || null;
  return tipo ? String(tipo).trim() : "Manguera especial";
}

function inferSubcategory(product) {
  const attributes = safeJsonParse(product.attributes);
  const category = product.categoryName || "";

  if (category === "Mangueras Hidráulicas" || category === "Hidráulica") {
    return normalizeNorm(attributes.norm, product.name);
  }

  if (category === "Mangueras Especiales") {
    return inferSpecialHoseSubcategory(attributes, product.name);
  }

  if (category === "Conexiones Hidráulicas") {
    return inferParkerConnectionSubcategory(attributes, product.name);
  }

  if (category === "Adaptadores Hidráulicos Dixon") {
    return inferDixonSubcategory(attributes, product.name);
  }

  if (category === "Accesorios Hidráulicos") {
    return inferStrobbeSubcategory(attributes, product.name);
  }

  if (category === "Ensambles") {
    return product.name || "Ensamble";
  }

  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.join(process.cwd(), "prisma", "dev.db");
  const db = new DatabaseSync(dbPath);

  const rows = db.prepare(`
    SELECT p.id, p.sku, p.name, p.brand, p.type, p.subcategory, p.attributes, c.name AS categoryName
    FROM Product p
    LEFT JOIN Category c ON c.id = p.categoryId
  `).all();

  const update = db.prepare(`UPDATE Product SET subcategory = ? WHERE id = ?`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const counts = new Map();

  if (!args.dryRun) db.exec("BEGIN");

  try {
    for (const row of rows) {
      scanned++;
      if (!args.force && row.subcategory) {
        skipped++;
        continue;
      }

      const subcategory = inferSubcategory(row);
      if (!subcategory) {
        skipped++;
        continue;
      }

      if (!args.dryRun) {
        update.run(subcategory, row.id);
      }

      updated++;
      counts.set(subcategory, (counts.get(subcategory) || 0) + 1);
    }

    if (!args.dryRun) db.exec("COMMIT");
  } catch (error) {
    if (!args.dryRun) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  console.log(`Scanned: ${scanned}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log("Top subcategories:");
  for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`${count}\t${name}`);
  }
}

main();
