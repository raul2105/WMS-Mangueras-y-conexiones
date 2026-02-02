const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const seedProducts = [
  {
    sku: 'CON-R1AT-04',
    name: 'Manguera Hidráulica SAE 100 R1AT 1/4"',
    description: 'Manguera de alta presión con refuerzo de una malla de acero.',
    type: 'HOSE',
    brand: 'Continental',
    base_cost: 45.5,
    price: 85.0,
    attributes: {
      pressure_psi: 3263,
      inner_diameter: '1/4"',
      temp_range: '-40°C a +100°C',
      norm: 'SAE 100 R1AT',
    },
    categoryName: 'Hidráulica',
    stock: 150,
    location: 'A-12-04',
  },
  {
    sku: 'FIT-JIC-04-04',
    name: 'Conexión JIC Hembra Giratoria 1/4" x 1/4"',
    description: 'Conexión prensable acero al carbón.',
    type: 'FITTING',
    brand: 'Gates',
    base_cost: 12.0,
    price: 25.0,
    attributes: {
      material: 'Acero',
      thread: 'JIC',
      angle: 'Straight',
    },
    categoryName: 'Conexiones Hidráulicas',
    stock: 500,
    location: 'B-01-01',
  },
  {
    sku: 'ENS-EXCAV-001',
    name: 'Ensamble Manguera Brazo Excavadora',
    description: 'Ensamble 3/4" R12 con proteccion espiral.',
    type: 'ASSEMBLY',
    brand: 'Rigentec',
    base_cost: 450.0,
    price: 950.0,
    attributes: {
      length_mm: 1200,
      components: ['HOSE-R12-12', 'FIT-JIC-12', 'FIT-JIC-12-90'],
    },
    categoryName: 'Ensambles',
    stock: 5,
    location: 'C-03-02',
  },
];

async function main() {
  for (const p of seedProducts) {
    const category = p.categoryName
      ? await prisma.category.upsert({
          where: { name: p.categoryName },
          create: { name: p.categoryName },
          update: {},
        })
      : null;

    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        name: p.name,
        description: p.description ?? null,
        type: p.type,
        brand: p.brand ?? null,
        base_cost: p.base_cost ?? null,
        price: p.price ?? null,
        attributes: p.attributes ? JSON.stringify(p.attributes) : null,
        ...(category ? { category: { connect: { id: category.id } } } : {}),
      },
      update: {
        name: p.name,
        description: p.description ?? null,
        type: p.type,
        brand: p.brand ?? null,
        base_cost: p.base_cost ?? null,
        price: p.price ?? null,
        attributes: p.attributes ? JSON.stringify(p.attributes) : null,
        ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
      },
      select: { id: true },
    });

    // Keep seed idempotent: replace inventory rows for this product.
    await prisma.inventory.deleteMany({ where: { productId: product.id } });
    await prisma.inventory.create({
      data: {
        productId: product.id,
        quantity: typeof p.stock === 'number' ? p.stock : 0,
        location: p.location ?? null,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
