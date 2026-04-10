const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    dir: path.join(process.cwd(), "public", "uploads", "products"),
    baseUrl: "/uploads/products",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dir") args.dir = argv[++i];
    else if (token === "--base-url") args.baseUrl = argv[++i];
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") args.help = true;
  }

  return args;
}

function usage() {
  return [
    "Link local image files to products by SKU or referenceCode.",
    "",
    "Usage:",
    "  node scripts/data/link-product-images-from-folder.cjs --dir public/uploads/products",
    "  node scripts/data/link-product-images-from-folder.cjs --dir public/uploads/products --dry-run",
    "",
    "Rules:",
    "  - Supported extensions: .jpg .jpeg .png .webp",
    "  - File name without extension must match Product.sku or Product.referenceCode",
    "  - imageUrl is stored as <baseUrl>/<filename>",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!fs.existsSync(args.dir)) {
    throw new Error(`Image directory not found: ${args.dir}`);
  }

  const supported = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const files = fs
    .readdirSync(args.dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && supported.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);

  let linked = 0;
  let missing = 0;

  for (const fileName of files) {
    const stem = path.basename(fileName, path.extname(fileName));
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ sku: stem }, { referenceCode: stem }],
      },
      select: { id: true, sku: true, imageUrl: true },
    });

    if (!product) {
      missing++;
      console.warn(`[images] no product match for ${fileName}`);
      continue;
    }

    const imageUrl = `${args.baseUrl.replace(/\/$/, "")}/${fileName}`;
    if (!args.dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl },
      });
    }

    linked++;
    console.log(`[images] ${args.dryRun ? "would link" : "linked"} ${fileName} -> ${product.sku}`);
  }

  console.log(`Done. ${linked} linked, ${missing} without match, dryRun=${args.dryRun}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
