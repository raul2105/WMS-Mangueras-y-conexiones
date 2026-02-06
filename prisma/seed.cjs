const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Warehouse and Location seed data
const seedWarehouses = [
  {
    code: 'WH-01',
    name: 'Almacén Principal',
    description: 'Almacén central de Rigentec',
    address: 'Av. Industrial 1234, Ciudad',
    isActive: true,
  },
  {
    code: 'WH-02',
    name: 'Almacén Secundario',
    description: 'Bodega de respaldo',
    address: 'Calle Comercio 567',
    isActive: true,
  },
];

const seedLocations = [
  // Warehouse 1 locations
  { warehouseCode: 'WH-01', code: 'A-12-04', name: 'Pasillo A - Rack 12 - Nivel 04', zone: 'A', aisle: '12', rack: '04', level: '04' },
  { warehouseCode: 'WH-01', code: 'B-01-01', name: 'Pasillo B - Rack 01 - Nivel 01', zone: 'B', aisle: '01', rack: '01', level: '01' },
  { warehouseCode: 'WH-01', code: 'C-03-02', name: 'Pasillo C - Rack 03 - Nivel 02', zone: 'C', aisle: '03', rack: '02', level: '02' },
  { warehouseCode: 'WH-01', code: 'RECV-01', name: 'Zona de Recepción 01', zone: 'RECEIVING', isActive: true },
  { warehouseCode: 'WH-01', code: 'SHIP-01', name: 'Zona de Envío 01', zone: 'SHIPPING', isActive: true },
  // Warehouse 2 locations
  { warehouseCode: 'WH-02', code: 'A-01-01', name: 'Pasillo A - Rack 01 - Nivel 01', zone: 'A', aisle: '01', rack: '01', level: '01' },
];

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
    locationCode: 'A-12-04',
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
    locationCode: 'B-01-01',
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
    locationCode: 'C-03-02',
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Seed Warehouses
  console.log('📦 Creating warehouses...');
  const warehouseMap = {};
  for (const wh of seedWarehouses) {
    const warehouse = await prisma.warehouse.upsert({
      where: { code: wh.code },
      create: wh,
      update: wh,
    });
    warehouseMap[wh.code] = warehouse;
    console.log(`  ✓ Warehouse: ${wh.name}`);
  }

  // 2. Seed Locations
  console.log('📍 Creating locations...');
  const locationMap = {};
  for (const loc of seedLocations) {
    const warehouse = warehouseMap[loc.warehouseCode];
    if (!warehouse) {
      console.warn(`  ⚠️  Warehouse not found: ${loc.warehouseCode}`);
      continue;
    }
    const { warehouseCode, ...locData } = loc;
    const location = await prisma.location.upsert({
      where: { code: loc.code },
      create: {
        ...locData,
        warehouseId: warehouse.id,
      },
      update: {
        ...locData,
        warehouseId: warehouse.id,
      },
    });
    locationMap[loc.code] = location;
    console.log(`  ✓ Location: ${loc.code} - ${loc.name}`);
  }

  // 3. Seed Products with Inventory
  console.log('🔧 Creating products...');
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

    const location = locationMap[p.locationCode];
    const quantity = typeof p.stock === 'number' ? p.stock : 0;
    
    await prisma.inventory.create({
      data: {
        productId: product.id,
        locationId: location?.id ?? null,
        quantity,
        reserved: 0,
        available: quantity, // available = quantity - reserved
      },
    });

    console.log(`  ✓ Product: ${p.sku} - ${p.name} (Stock: ${quantity})`);
  }

  console.log('✅ Seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
