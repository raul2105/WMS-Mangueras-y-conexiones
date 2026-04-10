const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const { seedDemoData } = require('./seed-demo.cjs');

const DEV_ASSEMBLY_PREFIX = 'DEV-ASM-';

const RBAC_PERMISSIONS = [
  'users.manage',
  'roles.manage',
  'catalog.view',
  'catalog.edit',
  'inventory.view',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.receive',
  'inventory.pick',
  'kardex.view',
  'warehouse.manage',
  'location.manage',
  'production.view',
  'production.execute',
  'purchasing.view',
  'purchasing.manage',
  'sales.view',
  'sales.create_order',
  'audit.view',
  'labels.manage',
];

const RBAC_ROLES = [
  {
    code: 'SYSTEM_ADMIN',
    name: 'System Admin',
    description: 'Acceso total del sistema WMS',
    permissions: RBAC_PERMISSIONS,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Gestion operativa de catalogo, inventario, compras y produccion',
    permissions: [
      'catalog.view',
      'catalog.edit',
      'inventory.view',
      'inventory.adjust',
      'inventory.transfer',
      'inventory.receive',
      'inventory.pick',
      'kardex.view',
      'warehouse.manage',
      'location.manage',
      'production.view',
      'production.execute',
      'purchasing.view',
      'purchasing.manage',
      'sales.view',
      'sales.create_order',
      'audit.view',
      'labels.manage',
    ],
  },
  {
    code: 'WAREHOUSE_OPERATOR',
    name: 'Warehouse Operator',
    description: 'Operacion diaria de inventario y ensamble',
    permissions: [
      'catalog.view',
      'inventory.view',
      'inventory.adjust',
      'inventory.transfer',
      'inventory.receive',
      'inventory.pick',
      'kardex.view',
      'production.view',
      'production.execute',
      'purchasing.view',
      'labels.manage',
    ],
  },
  {
    code: 'SALES_EXECUTIVE',
    name: 'Sales Executive',
    description: 'Consulta comercial y captura de pedidos de venta',
    permissions: [
      'catalog.view',
      'inventory.view',
      'sales.view',
      'sales.create_order',
    ],
  },
];

const RBAC_USERS = [
  { email: 'admin@scmayher.com', name: 'Admin Principal', password: 'Admin123*', roles: ['SYSTEM_ADMIN'] },
  { email: 'admin2@scmayher.com', name: 'Admin Secundario', password: 'Admin123*', roles: ['SYSTEM_ADMIN'] },
  { email: 'manager@scmayher.com', name: 'Manager WMS', password: 'Manager123*', roles: ['MANAGER'] },
  { email: 'operator@scmayher.com', name: 'Operador Almacen', password: 'Operator123*', roles: ['WAREHOUSE_OPERATOR'] },
  { email: 'sales@scmayher.com', name: 'Ejecutivo Ventas', password: 'Sales123*', roles: ['SALES_EXECUTIVE'] },
];

async function seedRbac() {
  console.log('🔐 Seeding RBAC (users, roles, permissions)...');

  for (const permissionCode of RBAC_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permissionCode },
      create: {
        code: permissionCode,
        description: `Permission ${permissionCode}`,
      },
      update: {
        description: `Permission ${permissionCode}`,
      },
    });
  }

  for (const roleData of RBAC_ROLES) {
    await prisma.role.upsert({
      where: { code: roleData.code },
      create: {
        code: roleData.code,
        name: roleData.name,
        description: roleData.description,
        isActive: true,
      },
      update: {
        name: roleData.name,
        description: roleData.description,
        isActive: true,
      },
    });

    const role = await prisma.role.findUnique({
      where: { code: roleData.code },
      select: { id: true },
    });
    if (!role) continue;

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permissionCode of roleData.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { code: permissionCode },
        select: { id: true },
      });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
  }

  for (const userData of RBAC_USERS) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    await prisma.user.upsert({
      where: { email: userData.email },
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash,
        isActive: true,
      },
      update: {
        name: userData.name,
        passwordHash,
        isActive: true,
      },
    });

    const user = await prisma.user.findUnique({
      where: { email: userData.email },
      select: { id: true },
    });
    if (!user) continue;

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    for (const roleCode of userData.roles) {
      const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
      if (!role) continue;
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id,
          },
        },
        create: {
          userId: user.id,
          roleId: role.id,
        },
        update: {},
      });
    }
  }

  console.log('  ✓ RBAC roles, permissions and users seeded');
}

function normalizeTechnicalText(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toAttributeValues(input) {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) {
    return input.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof input === 'object') return [];
  const normalized = String(input).trim();
  return normalized ? [normalized] : [];
}

function extractProductTechnicalAttributes(attributesRaw) {
  if (!attributesRaw) return [];

  let parsed;
  try {
    parsed = JSON.parse(attributesRaw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const rows = [];
  const dedupe = new Set();

  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = String(rawKey).trim();
    const keyNormalized = normalizeTechnicalText(key);
    if (!key || !keyNormalized) continue;

    const values = toAttributeValues(rawValue);
    values.forEach((value) => {
      const valueNormalized = normalizeTechnicalText(value);
      if (!valueNormalized) return;

      const id = `${keyNormalized}::${valueNormalized}`;
      if (dedupe.has(id)) return;
      dedupe.add(id);

      rows.push({ key, keyNormalized, value, valueNormalized });
    });
  }

  return rows;
}

async function syncProductTechnicalAttributes(productId, attributesRaw) {
  const rows = extractProductTechnicalAttributes(attributesRaw);

  await prisma.productTechnicalAttribute.deleteMany({ where: { productId } });

  if (rows.length > 0) {
    await prisma.productTechnicalAttribute.createMany({
      data: rows.map((row) => ({
        productId,
        key: row.key,
        keyNormalized: row.keyNormalized,
        value: row.value,
        valueNormalized: row.valueNormalized,
      })),
    });
  }
}

// Warehouse and Location seed data
const seedWarehouses = [
  {
    code: 'WH-01',
    name: 'Almacén Principal',
    description: 'Almacén central de SCMayher',
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
  { warehouseCode: 'WH-01', code: 'A-12-04', name: 'Pasillo A - Rack 12 - Nivel 04', zone: 'A', aisle: '12', rack: '04', level: '04', usageType: 'STORAGE' },
  { warehouseCode: 'WH-01', code: 'B-01-01', name: 'Pasillo B - Rack 01 - Nivel 01', zone: 'B', aisle: '01', rack: '01', level: '01', usageType: 'STORAGE' },
  { warehouseCode: 'WH-01', code: 'C-03-02', name: 'Pasillo C - Rack 03 - Nivel 02', zone: 'C', aisle: '03', rack: '02', level: '02', usageType: 'STORAGE' },
  { warehouseCode: 'WH-01', code: 'D-05-01', name: 'Pasillo D - Rack 05 - Nivel 01', zone: 'D', aisle: '05', rack: '01', level: '01', usageType: 'STORAGE' },
  { warehouseCode: 'WH-01', code: 'E-02-03', name: 'Pasillo E - Rack 02 - Nivel 03', zone: 'E', aisle: '02', rack: '03', level: '03', usageType: 'STORAGE' },
  { warehouseCode: 'WH-01', code: 'RECV-01', name: 'Zona de Recepción 01', zone: 'RECEIVING', isActive: true, usageType: 'RECEIVING' },
  { warehouseCode: 'WH-01', code: 'SHIP-01', name: 'Zona de Envío 01', zone: 'SHIPPING', isActive: true, usageType: 'SHIPPING' },
  // Warehouse 2 locations
  { warehouseCode: 'WH-02', code: 'A-01-01', name: 'Pasillo A - Rack 01 - Nivel 01', zone: 'A', aisle: '01', rack: '01', level: '01', usageType: 'STORAGE' },
  { warehouseCode: 'WH-02', code: 'B-02-01', name: 'Pasillo B - Rack 02 - Nivel 01', zone: 'B', aisle: '02', rack: '01', level: '01', usageType: 'STORAGE' },
  { warehouseCode: 'WH-02', code: 'C-04-02', name: 'Pasillo C - Rack 04 - Nivel 02', zone: 'C', aisle: '04', rack: '02', level: '02', usageType: 'STORAGE' },
];

const seedProducts = [
  {
    sku: 'CON-R1AT-04',
    name: 'Manguera Hidráulica SAE 100 R1AT 1/4"',
    description: 'Manguera de alta presión con refuerzo de una malla de acero.',
    type: 'HOSE',
    unitLabel: 'm',
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
    inventoryRows: [{ locationCode: 'A-12-04', quantity: 150 }],
  },
  {
    sku: 'FIT-JIC-04-04',
    name: 'Conexión JIC Hembra Giratoria 1/4" x 1/4"',
    description: 'Conexión prensable acero al carbón.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'Gates',
    base_cost: 12.0,
    price: 25.0,
    attributes: {
      material: 'Acero',
      thread: 'JIC',
      angle: 'Straight',
    },
    categoryName: 'Conexiones Hidráulicas',
    inventoryRows: [{ locationCode: 'B-01-01', quantity: 500 }],
  },
  {
    sku: 'ENS-EXCAV-001',
    name: 'Ensamble Manguera Brazo Excavadora',
    description: 'Ensamble 3/4" R12 con proteccion espiral.',
    type: 'ASSEMBLY',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    base_cost: 450.0,
    price: 950.0,
    attributes: {
      length_mm: 1200,
      components: ['HOSE-R12-12', 'FIT-JIC-12', 'FIT-JIC-12-90'],
    },
    categoryName: 'Ensambles',
    inventoryRows: [{ locationCode: 'C-03-02', quantity: 5 }],
  },
];

// Casos manuales de ensamble en dev:
// 1. Exacto en WH-01: entrada DEV-ASM-FIT-IN-DN16-JIC + salida DEV-ASM-FIT-OUT-DN16-JIC-90 + manguera DEV-ASM-HOSE-DN16-TP-2SN con longitud 2 y cantidad 3.
// 2. Insuficiente por conexiones en WH-01: usar DEV-ASM-FIT-IN-DN10-JIC o DEV-ASM-FIT-OUT-DN10-RECTA con cantidad 3.
// 3. Insuficiente por manguera en WH-01: usar DEV-ASM-HOSE-DN10-R2AT con longitud 3 y cantidad 3.
// 4. Cambio por almacén: varios productos quedan suficientes solo al cambiar a WH-02.
const seedAssemblyProducts = [
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN16-TP-2SN`,
    name: 'Manguera termoplástica DN16 2SN 3/8"',
    description: 'Manguera termoplástica para ensamble DN16 con alta flexibilidad.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras termoplásticas',
    base_cost: 82,
    price: 145,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN16',
      rosca: 'JIC',
      material: 'Termoplástica',
      presion: '2SN',
      medida: '3/8"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'A-12-04', quantity: 4 },
      { locationCode: 'D-05-01', quantity: 5 },
      { locationCode: 'A-01-01', quantity: 10 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN10-R2AT`,
    name: 'Manguera hidráulica DN10 R2AT 1/4"',
    description: 'Manguera DN10 con doble malla para pruebas de insuficiencia por longitud.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras hidráulicas',
    base_cost: 64,
    price: 118,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN10',
      rosca: 'JIC',
      material: 'Hule sintético',
      presion: 'R2AT',
      medida: '1/4"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'B-01-01', quantity: 6 },
      { locationCode: 'B-02-01', quantity: 20 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN12-TP-1SN`,
    name: 'Manguera termoplástica DN12 1SN 5/16"',
    description: 'Manguera ligera DN12 para pruebas de búsqueda por DN y termoplástica.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras termoplásticas',
    base_cost: 58,
    price: 104,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN12',
      rosca: 'JIC',
      material: 'Termoplástica',
      presion: '1SN',
      medida: '5/16"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'E-02-03', quantity: 12 },
      { locationCode: 'C-04-02', quantity: 2 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN20-TP-4SP`,
    name: 'Manguera termoplástica DN20 4SP 1/2"',
    description: 'Manguera de mayor capacidad para búsqueda por diámetro y presión.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras termoplásticas',
    base_cost: 110,
    price: 188,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN20',
      rosca: 'JIC',
      material: 'Termoplástica',
      presion: '4SP',
      medida: '1/2"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'D-05-01', quantity: 3 },
      { locationCode: 'A-01-01', quantity: 18 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN08-TP-1TE`,
    name: 'Manguera termoplástica DN08 1TE 3/16"',
    description: 'Manguera compacta para pruebas de búsqueda por medida fraccional.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras compactas',
    base_cost: 41,
    price: 79,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN08',
      rosca: 'JIC',
      material: 'Termoplástica',
      presion: '1TE',
      medida: '3/16"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'C-03-02', quantity: 14 },
      { locationCode: 'B-02-01', quantity: 0.8 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}HOSE-DN25-R15`,
    name: 'Manguera hidráulica DN25 R15 5/8"',
    description: 'Manguera robusta para escenarios suficientes solo en almacén secundario.',
    type: 'HOSE',
    unitLabel: 'm',
    brand: 'SCMayher',
    subcategory: 'Mangueras hidráulicas',
    base_cost: 132,
    price: 220,
    categoryName: 'Mangueras de Ensamble',
    attributes: {
      diametro: 'DN25',
      rosca: 'JIC',
      material: 'Hule sintético',
      presion: 'R15',
      medida: '5/8"',
      uso: 'Ensamble 3 piezas',
    },
    inventoryRows: [
      { locationCode: 'E-02-03', quantity: 1 },
      { locationCode: 'C-04-02', quantity: 16 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-IN-DN16-JIC`,
    name: 'Conexión entrada recta DN16 JIC hembra 3/8"',
    description: 'Conexión de entrada para ensambles DN16 con rosca JIC.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones entrada',
    base_cost: 18,
    price: 36,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Entrada',
      diametro: 'DN16',
      rosca: 'JIC',
      angulo: 'Recta',
      medida: '3/8"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'B-01-01', quantity: 6 },
      { locationCode: 'A-01-01', quantity: 15 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-OUT-DN16-JIC-90`,
    name: 'Conexión salida 90° DN16 JIC macho 3/8"',
    description: 'Conexión de salida en 90 grados para ensambles DN16.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones salida',
    base_cost: 22,
    price: 42,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Salida',
      diametro: 'DN16',
      rosca: 'JIC',
      angulo: '90°',
      medida: '3/8"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'C-03-02', quantity: 5 },
      { locationCode: 'B-02-01', quantity: 14 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-IN-DN10-JIC`,
    name: 'Conexión entrada recta DN10 JIC hembra 1/4"',
    description: 'Conexión de entrada DN10 para casos con stock justo.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones entrada',
    base_cost: 14,
    price: 29,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Entrada',
      diametro: 'DN10',
      rosca: 'JIC',
      angulo: 'Recta',
      medida: '1/4"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'B-01-01', quantity: 2 },
      { locationCode: 'A-01-01', quantity: 9 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-OUT-DN10-RECTA`,
    name: 'Conexión salida recta DN10 JIC macho 1/4"',
    description: 'Conexión de salida DN10 recta para probar faltantes en WH-01.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones salida',
    base_cost: 15,
    price: 30,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Salida',
      diametro: 'DN10',
      rosca: 'JIC',
      angulo: 'Recta',
      medida: '1/4"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'C-03-02', quantity: 2 },
      { locationCode: 'A-01-01', quantity: 8 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-IN-DN12-NPT`,
    name: 'Conexión entrada recta DN12 NPT hembra 5/16"',
    description: 'Conexión NPT de entrada para filtrar por rosca.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones entrada',
    base_cost: 16,
    price: 31,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Entrada',
      diametro: 'DN12',
      rosca: 'NPT',
      angulo: 'Recta',
      medida: '5/16"',
      material: 'Latón',
    },
    inventoryRows: [
      { locationCode: 'D-05-01', quantity: 7 },
      { locationCode: 'C-04-02', quantity: 4 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-OUT-DN12-NPT-90`,
    name: 'Conexión salida 90° DN12 NPT macho 5/16"',
    description: 'Conexión NPT de salida en 90 grados.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones salida',
    base_cost: 19,
    price: 35,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Salida',
      diametro: 'DN12',
      rosca: 'NPT',
      angulo: '90°',
      medida: '5/16"',
      material: 'Latón',
    },
    inventoryRows: [
      { locationCode: 'E-02-03', quantity: 7 },
      { locationCode: 'C-04-02', quantity: 4 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-IN-DN20-BSP`,
    name: 'Conexión entrada recta DN20 BSP hembra 1/2"',
    description: 'Conexión BSP de entrada para ensambles de mayor diámetro.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones entrada',
    base_cost: 21,
    price: 39,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Entrada',
      diametro: 'DN20',
      rosca: 'BSP',
      angulo: 'Recta',
      medida: '1/2"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'A-12-04', quantity: 1 },
      { locationCode: 'B-02-01', quantity: 11 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-OUT-DN20-BSP-45`,
    name: 'Conexión salida 45° DN20 BSP macho 1/2"',
    description: 'Conexión BSP de salida para validar cambio de almacén.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones salida',
    base_cost: 23,
    price: 43,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Salida',
      diametro: 'DN20',
      rosca: 'BSP',
      angulo: '45°',
      medida: '1/2"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'D-05-01', quantity: 1 },
      { locationCode: 'C-04-02', quantity: 11 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-IN-DN08-JIC`,
    name: 'Conexión entrada recta DN08 JIC hembra 3/16"',
    description: 'Conexión compacta de entrada para búsquedas por 3/16.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones entrada',
    base_cost: 11,
    price: 24,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Entrada',
      diametro: 'DN08',
      rosca: 'JIC',
      angulo: 'Recta',
      medida: '3/16"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'C-03-02', quantity: 9 },
      { locationCode: 'A-01-01', quantity: 2 },
    ],
  },
  {
    sku: `${DEV_ASSEMBLY_PREFIX}FIT-OUT-DN08-JIC-90`,
    name: 'Conexión salida 90° DN08 JIC macho 3/16"',
    description: 'Conexión compacta de salida para búsquedas por 90° y JIC.',
    type: 'FITTING',
    unitLabel: 'pieza',
    brand: 'SCMayher',
    subcategory: 'Conexiones salida',
    base_cost: 12,
    price: 26,
    categoryName: 'Conexiones de Ensamble',
    attributes: {
      posicion: 'Salida',
      diametro: 'DN08',
      rosca: 'JIC',
      angulo: '90°',
      medida: '3/16"',
      material: 'Acero',
    },
    inventoryRows: [
      { locationCode: 'D-05-01', quantity: 9 },
      { locationCode: 'A-01-01', quantity: 2 },
    ],
  },
];

async function seedInventoryRows(productId, inventoryRows, locationMap, fallbackLocation) {
  await prisma.inventory.deleteMany({ where: { productId } });

  const normalizedRows = Array.isArray(inventoryRows) && inventoryRows.length > 0
    ? inventoryRows
    : [{ locationCode: fallbackLocation.code, quantity: 0 }];

  for (const row of normalizedRows) {
    const location = locationMap[row.locationCode] ?? fallbackLocation;
    const quantity = typeof row.quantity === 'number' ? row.quantity : 0;

    await prisma.inventory.create({
      data: {
        productId,
        locationId: location.id,
        quantity,
        reserved: 0,
        available: quantity,
      },
    });
  }
}

async function upsertSeedProduct(productData, locationMap, fallbackLocation) {
  const category = productData.categoryName
    ? await prisma.category.upsert({
        where: { name: productData.categoryName },
        create: { name: productData.categoryName },
        update: {},
      })
    : null;

  const attributesRaw = productData.attributes ? JSON.stringify(productData.attributes) : null;
  const product = await prisma.product.upsert({
    where: { sku: productData.sku },
    create: {
      sku: productData.sku,
      name: productData.name,
      description: productData.description ?? null,
      type: productData.type,
      unitLabel: productData.unitLabel ?? 'unidad',
      brand: productData.brand ?? null,
      subcategory: productData.subcategory ?? null,
      base_cost: productData.base_cost ?? null,
      price: productData.price ?? null,
      attributes: attributesRaw,
      ...(category ? { category: { connect: { id: category.id } } } : {}),
    },
    update: {
      name: productData.name,
      description: productData.description ?? null,
      type: productData.type,
      unitLabel: productData.unitLabel ?? 'unidad',
      brand: productData.brand ?? null,
      subcategory: productData.subcategory ?? null,
      base_cost: productData.base_cost ?? null,
      price: productData.price ?? null,
      attributes: attributesRaw,
      ...(category ? { category: { connect: { id: category.id } } } : { categoryId: null }),
    },
    select: { id: true },
  });

  await syncProductTechnicalAttributes(product.id, attributesRaw);
  await seedInventoryRows(product.id, productData.inventoryRows, locationMap, fallbackLocation);

  const totalStock = (productData.inventoryRows ?? []).reduce((acc, row) => acc + (typeof row.quantity === 'number' ? row.quantity : 0), 0);
  console.log(`  ✓ Product: ${productData.sku} - ${productData.name} (Stock total: ${totalStock})`);
}

async function main() {
  console.log('🌱 Seeding database...');

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
        isActive: locData.isActive ?? true,
        warehouseId: warehouse.id,
      },
      update: {
        ...locData,
        isActive: locData.isActive ?? true,
        warehouseId: warehouse.id,
      },
    });
    locationMap[loc.code] = location;
    console.log(`  ✓ Location: ${loc.code} - ${loc.name}`);
  }

  console.log('📍 Ensuring staging locations...');
  const stagingMap = {};
  for (const wh of seedWarehouses) {
    const warehouse = warehouseMap[wh.code];
    if (!warehouse) continue;
    const stagingCode = `STAGING-${wh.code}`;
    const staging = await prisma.location.upsert({
      where: { code: stagingCode },
      create: {
        code: stagingCode,
        name: `Staging - ${wh.name}`,
        zone: 'STAGING',
        usageType: 'STAGING',
        isActive: true,
        warehouseId: warehouse.id,
      },
      update: {
        name: `Staging - ${wh.name}`,
        zone: 'STAGING',
        usageType: 'STAGING',
        isActive: true,
        warehouseId: warehouse.id,
      },
    });
    stagingMap[wh.code] = staging;
    console.log(`  ✓ Staging: ${staging.code}`);
  }

  console.log('🔧 Creating base products...');
  for (const productData of seedProducts) {
    await upsertSeedProduct(productData, locationMap, stagingMap[seedWarehouses[0].code]);
  }

  console.log('🧪 Creating dev assembly catalog...');
  for (const productData of seedAssemblyProducts) {
    await upsertSeedProduct(productData, locationMap, stagingMap[seedWarehouses[0].code]);
  }

  console.log('🧩 Creating demo operational dataset...');
  const demoSummary = await seedDemoData(prisma);
  console.log('📊 Demo summary:', demoSummary);

  await seedRbac();

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
