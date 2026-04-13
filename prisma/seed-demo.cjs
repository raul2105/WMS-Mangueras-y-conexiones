const DEMO_BASE_DATE = new Date('2026-04-01T09:00:00.000Z');

const DEFAULT_LABEL_TEMPLATES = [
  ['RECEIPT_STANDARD', 'Recepcion estandar', 'RECEIPT', true, 'standard'],
  ['RECEIPT_COMPACT', 'Recepcion compacta', 'RECEIPT', false, 'compact'],
  ['PICKING_STANDARD', 'Picking estandar', 'PICKING', true, 'standard'],
  ['PICKING_COMPACT', 'Picking compacta', 'PICKING', false, 'compact'],
  ['LOCATION_STANDARD', 'Ubicacion estandar', 'LOCATION', true, 'standard'],
  ['ADJUSTMENT_STANDARD', 'Ajuste estandar', 'ADJUSTMENT', true, 'standard'],
  ['WIP_STANDARD', 'WIP estandar', 'WIP', true, 'standard'],
];

function at(dayOffset = 0, hour = 9, minute = 0) {
  const value = new Date(DEMO_BASE_DATE);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

async function seedDemoData(prisma) {
  const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, unitLabel: true } });
  const locations = await prisma.location.findMany({ select: { id: true, code: true, warehouseId: true } });
  const warehouses = await prisma.warehouse.findMany({ select: { id: true, code: true, name: true } });
  const p = Object.fromEntries(products.map((row) => [row.sku, row]));
  const l = Object.fromEntries(locations.map((row) => [row.code, row]));
  const w = Object.fromEntries(warehouses.map((row) => [row.code, row]));

  const inv = async (sku, code, quantity, reserved = 0) => {
    const row = await prisma.inventory.upsert({
      where: { productId_locationId: { productId: p[sku].id, locationId: l[code].id } },
      update: {},
      create: { productId: p[sku].id, locationId: l[code].id, quantity: 0, reserved: 0, available: 0 },
    });
    await prisma.inventory.update({
      where: { id: row.id },
      data: { quantity, reserved, available: quantity - reserved },
    });
  };

  const trace = async ({
    traceId, labelType, sourceEntityType, sourceEntityId, templateCode, productId, warehouseId, locationId, originMovementId,
    sourceDocumentType, sourceDocumentId, sourceDocumentLineId, operatorName, reference, quantity, unitLabel, payload, createdAt, jobStatus,
  }) => {
    const record = await prisma.traceRecord.create({
      data: {
        traceId,
        labelType,
        sourceEntityType,
        sourceEntityId,
        sourceDocumentType: sourceDocumentType ?? null,
        sourceDocumentId: sourceDocumentId ?? null,
        sourceDocumentLineId: sourceDocumentLineId ?? null,
        companyName: 'SCMayher',
        operatorName: operatorName ?? null,
        reference: reference ?? null,
        quantity: quantity ?? null,
        unitLabel: unitLabel ?? null,
        payloadJson: JSON.stringify(payload ?? {}),
        productId: productId ?? null,
        warehouseId: warehouseId ?? null,
        locationId: locationId ?? null,
        originMovementId: originMovementId ?? null,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.labelPrintJob.create({
      data: {
        traceRecordId: record.id,
        labelTemplateId: templates[templateCode].id,
        status: jobStatus ?? 'PENDING',
        copies: 1,
        outputFormat: 'html',
        payloadJson: JSON.stringify(payload ?? {}),
        htmlSnapshot: `<div>${traceId}</div>`,
        requestedBy: operatorName ?? 'sistema',
        printedAt: jobStatus === 'PRINTED' ? createdAt : null,
        exportedAt: jobStatus === 'EXPORTED' ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      },
    });
  };

  await prisma.labelPrintJob.deleteMany({ where: { traceRecord: { traceId: { startsWith: 'TRC-DEMO-' } } } });
  await prisma.traceRecord.deleteMany({ where: { OR: [{ traceId: { startsWith: 'TRC-DEMO-' } }, { sourceEntityType: { startsWith: 'DEMO_' } }] } });
  await prisma.inventoryMovement.deleteMany({ where: { OR: [{ reference: { startsWith: 'DEMO-' } }, { traceId: { startsWith: 'TRC-DEMO-' } }] } });
  await prisma.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { purchaseOrder: { folio: { startsWith: 'DEMO-OC-' } } } } });
  await prisma.purchaseReceipt.deleteMany({ where: { purchaseOrder: { folio: { startsWith: 'DEMO-OC-' } } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { folio: { startsWith: 'DEMO-OC-' } } } });
  await prisma.purchaseOrder.deleteMany({ where: { folio: { startsWith: 'DEMO-OC-' } } });
  await prisma.productionOrder.deleteMany({ where: { code: { startsWith: 'DEMO-' } } });
  await prisma.supplierProduct.deleteMany({ where: { supplier: { code: { startsWith: 'DEMO-SUP-' } } } });
  await prisma.supplier.deleteMany({ where: { code: { startsWith: 'DEMO-SUP-' } } });

  const templates = {};
  for (const [code, name, labelType, isDefault, variant] of DEFAULT_LABEL_TEMPLATES) {
    templates[code] = await prisma.labelTemplate.upsert({
      where: { code },
      create: { code, name, labelType, isDefault, definitionJson: JSON.stringify({ variant }) },
      update: { name, labelType, isActive: true, isDefault, definitionJson: JSON.stringify({ variant }) },
    });
  }

  for (const wh of warehouses) {
    const code = `WIP-${wh.code}`;
    if (!l[code]) {
      l[code] = await prisma.location.upsert({
        where: { code },
        create: { code, name: `Mesa WIP - ${wh.name}`, zone: 'WIP', usageType: 'WIP', isActive: true, warehouseId: wh.id },
        update: { name: `Mesa WIP - ${wh.name}`, zone: 'WIP', usageType: 'WIP', isActive: true, warehouseId: wh.id },
        select: { id: true, code: true, warehouseId: true },
      });
    }
  }

  const sup1 = await prisma.supplier.create({ data: { code: 'DEMO-SUP-001', name: 'HoseTech Monterrey', legalName: 'HoseTech Monterrey S.A. de C.V.', businessName: 'HoseTech Monterrey', taxId: 'HTM260401AB1', email: 'compras@hosetech.example', phone: '81-5555-0101', address: 'Parque Industrial Norte', isActive: true } });
  const sup2 = await prisma.supplier.create({ data: { code: 'DEMO-SUP-002', name: 'Conecta Industrial Bajio', legalName: 'Conecta Industrial Bajio S.A. de C.V.', businessName: 'Conecta Industrial Bajio', taxId: 'CIB260401CD2', email: 'ventas@conecta.example', phone: '442-555-0202', address: 'Zona Industrial Queretaro', isActive: true } });

  const [brandContinental, brandGates] = await Promise.all([
    prisma.supplierBrand.create({ data: { supplierId: sup1.id, name: 'Continental' } }),
    prisma.supplierBrand.create({ data: { supplierId: sup1.id, name: 'Gates' } }),
  ]);
  await Promise.all([
    prisma.supplierBrand.create({ data: { supplierId: sup2.id, name: 'Parker' } }),
    prisma.supplierBrand.create({ data: { supplierId: sup2.id, name: 'Alfagomma' } }),
  ]);
  await prisma.supplierProduct.createMany({
    data: [
      { supplierId: sup1.id, productId: p['CON-R1AT-04'].id, supplierSku: 'HT-R1AT-04', unitPrice: 43.2, currency: 'MXN', leadTimeDays: 4 },
      { supplierId: sup1.id, productId: p['DEV-ASM-HOSE-DN16-TP-2SN'].id, supplierSku: 'HT-DN16-2SN', unitPrice: 79, currency: 'MXN', leadTimeDays: 5 },
      { supplierId: sup2.id, productId: p['FIT-JIC-04-04'].id, supplierSku: 'CI-JIC-04-04', unitPrice: 11.4, currency: 'MXN', leadTimeDays: 3 },
      { supplierId: sup2.id, productId: p['DEV-ASM-FIT-IN-DN16-JIC'].id, supplierSku: 'CI-DN16-IN', unitPrice: 17.5, currency: 'MXN', leadTimeDays: 2 },
      { supplierId: sup2.id, productId: p['DEV-ASM-FIT-OUT-DN16-JIC-90'].id, supplierSku: 'CI-DN16-OUT90', unitPrice: 21, currency: 'MXN', leadTimeDays: 2 },
    ],
  });

  // Vincular proveedor principal y marca normalizada a los productos demo
  await Promise.all([
    prisma.product.update({ where: { sku: 'CON-R1AT-04' }, data: { primarySupplierId: sup1.id, supplierBrandId: brandContinental.id, brand: 'Continental' } }),
    prisma.product.update({ where: { sku: 'DEV-ASM-HOSE-DN16-TP-2SN' }, data: { primarySupplierId: sup1.id, supplierBrandId: brandGates.id, brand: 'Gates' } }),
  ]);

  const po1 = await prisma.purchaseOrder.create({ data: { folio: 'DEMO-OC-001', supplierId: sup1.id, status: 'BORRADOR', expectedDate: at(3, 16), notes: 'OC borrador para validar edición.', createdAt: at(-3, 9), updatedAt: at(-3, 9) } });
  await prisma.purchaseOrderLine.createMany({ data: [
    { purchaseOrderId: po1.id, productId: p['CON-R1AT-04'].id, qtyOrdered: 40, qtyReceived: 0, unitPrice: 43.2, currency: 'MXN' },
    { purchaseOrderId: po1.id, productId: p['DEV-ASM-HOSE-DN16-TP-2SN'].id, qtyOrdered: 25, qtyReceived: 0, unitPrice: 79, currency: 'MXN' },
  ] });

  const po2 = await prisma.purchaseOrder.create({ data: { folio: 'DEMO-OC-002', supplierId: sup2.id, status: 'CONFIRMADA', expectedDate: at(5, 13), notes: 'OC confirmada pendiente de recepción.', createdAt: at(-2, 10), updatedAt: at(-2, 10) } });
  await prisma.purchaseOrderLine.createMany({ data: [
    { purchaseOrderId: po2.id, productId: p['DEV-ASM-FIT-IN-DN16-JIC'].id, qtyOrdered: 20, qtyReceived: 0, unitPrice: 17.5, currency: 'MXN' },
    { purchaseOrderId: po2.id, productId: p['DEV-ASM-FIT-OUT-DN16-JIC-90'].id, qtyOrdered: 20, qtyReceived: 0, unitPrice: 21, currency: 'MXN' },
  ] });

  const po3 = await prisma.purchaseOrder.create({ data: { folio: 'DEMO-OC-003', supplierId: sup2.id, status: 'PARCIAL', expectedDate: at(1, 11), notes: 'OC parcialmente recibida.', createdAt: at(-5, 8), updatedAt: at(-1, 15) } });
  const po3l1 = await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: po3.id, productId: p['FIT-JIC-04-04'].id, qtyOrdered: 120, qtyReceived: 60, unitPrice: 11.4, currency: 'MXN' } });
  const po3l2 = await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: po3.id, productId: p['DEV-ASM-FIT-IN-DN12-NPT'].id, qtyOrdered: 30, qtyReceived: 10, unitPrice: 15.2, currency: 'MXN' } });
  const rc3 = await prisma.purchaseReceipt.create({ data: { purchaseOrderId: po3.id, locationId: l['RECV-01'].id, receivedAt: at(-1, 15), notes: 'Primera entrega parcial.', referenceDoc: 'REM-DEMO-003-A' } });
  const rc3l1 = await prisma.purchaseReceiptLine.create({ data: { purchaseReceiptId: rc3.id, purchaseOrderLineId: po3l1.id, productId: p['FIT-JIC-04-04'].id, qtyReceived: 60 } });
  const rc3l2 = await prisma.purchaseReceiptLine.create({ data: { purchaseReceiptId: rc3.id, purchaseOrderLineId: po3l2.id, productId: p['DEV-ASM-FIT-IN-DN12-NPT'].id, qtyReceived: 10 } });

  const po4 = await prisma.purchaseOrder.create({ data: { folio: 'DEMO-OC-004', supplierId: sup1.id, status: 'RECIBIDA', expectedDate: at(-1, 12), notes: 'OC recibida totalmente.', createdAt: at(-8, 9), updatedAt: at(-2, 14) } });
  const po4l1 = await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: po4.id, productId: p['DEV-ASM-HOSE-DN12-TP-1SN'].id, qtyOrdered: 18, qtyReceived: 18, unitPrice: 56.5, currency: 'MXN' } });
  const po4l2 = await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: po4.id, productId: p['DEV-ASM-HOSE-DN20-TP-4SP'].id, qtyOrdered: 12, qtyReceived: 12, unitPrice: 108, currency: 'MXN' } });
  const rc4 = await prisma.purchaseReceipt.create({ data: { purchaseOrderId: po4.id, locationId: l['RECV-01'].id, receivedAt: at(-2, 14), notes: 'Recepción completa.', referenceDoc: 'FAC-DEMO-004' } });
  const rc4l1 = await prisma.purchaseReceiptLine.create({ data: { purchaseReceiptId: rc4.id, purchaseOrderLineId: po4l1.id, productId: p['DEV-ASM-HOSE-DN12-TP-1SN'].id, qtyReceived: 18 } });
  const rc4l2 = await prisma.purchaseReceiptLine.create({ data: { purchaseReceiptId: rc4.id, purchaseOrderLineId: po4l2.id, productId: p['DEV-ASM-HOSE-DN20-TP-4SP'].id, qtyReceived: 12 } });

  await inv('FIT-JIC-04-04', 'RECV-01', 60);
  await inv('DEV-ASM-FIT-IN-DN12-NPT', 'RECV-01', 10);
  await inv('DEV-ASM-HOSE-DN12-TP-1SN', 'RECV-01', 18);
  await inv('DEV-ASM-HOSE-DN20-TP-4SP', 'RECV-01', 12);

  const receiptMovements = [
    ['TRC-DEMO-REC-003-01', po3, rc3, rc3l1, p['FIT-JIC-04-04'], 60, 'Luis Recepción', at(-1, 15)],
    ['TRC-DEMO-REC-003-02', po3, rc3, rc3l2, p['DEV-ASM-FIT-IN-DN12-NPT'], 10, 'Luis Recepción', at(-1, 15, 15)],
    ['TRC-DEMO-REC-004-01', po4, rc4, rc4l1, p['DEV-ASM-HOSE-DN12-TP-1SN'], 18, 'Ana Recibo', at(-2, 14)],
    ['TRC-DEMO-REC-004-02', po4, rc4, rc4l2, p['DEV-ASM-HOSE-DN20-TP-4SP'], 12, 'Ana Recibo', at(-2, 14, 15)],
  ];
  for (const [traceId, po, rc, rcl, product, quantity, operatorName, createdAt] of receiptMovements) {
    const movement = await prisma.inventoryMovement.create({
      data: {
        type: 'IN', quantity, traceId, operatorName, reference: po.folio, notes: `Recepción ${po.folio}`,
        documentType: 'PURCHASE_RECEIPT', documentId: rc.id, documentLineId: rcl.id, productId: product.id, locationId: l['RECV-01'].id, createdAt,
      },
    });
    await trace({
      traceId, labelType: 'RECEIPT', sourceEntityType: 'DEMO_RECEIPT_LINE', sourceEntityId: rcl.id, templateCode: 'RECEIPT_STANDARD',
      productId: product.id, warehouseId: l['RECV-01'].warehouseId, locationId: l['RECV-01'].id, originMovementId: movement.id,
      sourceDocumentType: 'PURCHASE_RECEIPT', sourceDocumentId: rc.id, sourceDocumentLineId: rcl.id,
      operatorName, reference: po.folio, quantity, unitLabel: product.unitLabel,
      payload: { sku: product.sku, description: product.name, quantity, operatorName, reference: po.folio }, createdAt, jobStatus: 'PRINTED',
    });
  }

  const m1 = await prisma.inventoryMovement.create({ data: { type: 'ADJUSTMENT', quantity: 8, traceId: 'TRC-DEMO-ADJ-001', operatorName: 'Supervisor Conteo', reference: 'DEMO-ADJ-001', notes: 'Ajuste positivo.', documentType: 'CYCLE_COUNT', documentId: 'DEMO-CYCLE-001', documentLineId: 'L1', productId: p['CON-R1AT-04'].id, locationId: l['A-12-04'].id, createdAt: at(-1, 11) } });
  const m2 = await prisma.inventoryMovement.create({ data: { type: 'TRANSFER', quantity: 15, traceId: 'TRC-DEMO-TRF-001', operatorName: 'Mario Almacen', reference: 'DEMO-TRF-001', notes: 'Traslado interno.', documentType: 'TRANSFER_ORDER', documentId: 'DEMO-TO-001', documentLineId: 'L1', productId: p['FIT-JIC-04-04'].id, locationId: l['B-01-01'].id, fromLocationCode: 'B-01-01', toLocationCode: 'C-03-02', createdAt: at(-1, 13) } });
  const m3 = await prisma.inventoryMovement.create({ data: { type: 'OUT', quantity: 1, traceId: 'TRC-DEMO-OUT-001', operatorName: 'Patricia Embarques', reference: 'DEMO-SO-001', notes: 'Salida a cliente.', documentType: 'SALES_ORDER', documentId: 'DEMO-SO-001', documentLineId: 'L1', productId: p['ENS-EXCAV-001'].id, locationId: l['SHIP-01'].id, createdAt: at(0, 10) } });
  await trace({ traceId: 'TRC-DEMO-ADJ-001', labelType: 'ADJUSTMENT', sourceEntityType: 'DEMO_MOVEMENT', sourceEntityId: m1.id, templateCode: 'ADJUSTMENT_STANDARD', productId: p['CON-R1AT-04'].id, warehouseId: l['A-12-04'].warehouseId, locationId: l['A-12-04'].id, originMovementId: m1.id, sourceDocumentType: 'CYCLE_COUNT', sourceDocumentId: 'DEMO-CYCLE-001', sourceDocumentLineId: 'L1', operatorName: 'Supervisor Conteo', reference: 'DEMO-ADJ-001', quantity: 8, unitLabel: p['CON-R1AT-04'].unitLabel, payload: { sku: 'CON-R1AT-04', quantity: 8 }, createdAt: at(-1, 11), jobStatus: 'PRINTED' });
  await trace({ traceId: 'TRC-DEMO-TRF-001', labelType: 'PICKING', sourceEntityType: 'DEMO_MOVEMENT', sourceEntityId: m2.id, templateCode: 'PICKING_STANDARD', productId: p['FIT-JIC-04-04'].id, warehouseId: l['B-01-01'].warehouseId, locationId: l['B-01-01'].id, originMovementId: m2.id, sourceDocumentType: 'TRANSFER_ORDER', sourceDocumentId: 'DEMO-TO-001', sourceDocumentLineId: 'L1', operatorName: 'Mario Almacen', reference: 'DEMO-TRF-001', quantity: 15, unitLabel: p['FIT-JIC-04-04'].unitLabel, payload: { sku: 'FIT-JIC-04-04', quantity: 15 }, createdAt: at(-1, 13), jobStatus: 'PRINTED' });
  await trace({ traceId: 'TRC-DEMO-OUT-001', labelType: 'PICKING', sourceEntityType: 'DEMO_MOVEMENT', sourceEntityId: m3.id, templateCode: 'PICKING_COMPACT', productId: p['ENS-EXCAV-001'].id, warehouseId: l['SHIP-01'].warehouseId, locationId: l['SHIP-01'].id, originMovementId: m3.id, sourceDocumentType: 'SALES_ORDER', sourceDocumentId: 'DEMO-SO-001', sourceDocumentLineId: 'L1', operatorName: 'Patricia Embarques', reference: 'DEMO-SO-001', quantity: 1, unitLabel: p['ENS-EXCAV-001'].unitLabel, payload: { sku: 'ENS-EXCAV-001', quantity: 1 }, createdAt: at(0, 10), jobStatus: 'EXPORTED' });
  await trace({ traceId: 'TRC-DEMO-LOC-001', labelType: 'LOCATION', sourceEntityType: 'DEMO_LOCATION', sourceEntityId: l['A-12-04'].id, templateCode: 'LOCATION_STANDARD', warehouseId: l['A-12-04'].warehouseId, locationId: l['A-12-04'].id, operatorName: 'Sistema Demo', reference: 'DEMO-LOC-001', payload: { location: 'A-12-04' }, createdAt: at(0, 8), jobStatus: 'PENDING' });

  const generic = await prisma.productionOrder.create({ data: { code: 'DEMO-PO-GEN-001', kind: 'GENERIC', status: 'ABIERTA', priority: 2, customerName: 'Cliente Demo Industrial', dueDate: at(2, 18), notes: 'Orden genérica de referencia.', warehouseId: w['WH-01'].id, createdAt: at(-1, 9), updatedAt: at(-1, 9) } });
  await prisma.productionOrderItem.createMany({ data: [
    { orderId: generic.id, productId: p['CON-R1AT-04'].id, locationId: l['A-12-04'].id, quantity: 12, createdAt: at(-1, 9) },
    { orderId: generic.id, productId: p['FIT-JIC-04-04'].id, locationId: l['B-01-01'].id, quantity: 24, createdAt: at(-1, 9) },
  ] });

  const asm1 = await prisma.productionOrder.create({ data: { code: 'DEMO-ENS-OPEN-001', kind: 'ASSEMBLY_3PIECE', status: 'ABIERTA', priority: 3, customerName: 'Constructora Demo', dueDate: at(2, 17), notes: 'Lista para liberar surtido.', warehouseId: w['WH-01'].id, createdAt: at(0, 7), updatedAt: at(0, 7) } });
  await prisma.assemblyConfiguration.create({ data: { productionOrderId: asm1.id, entryFittingProductId: p['DEV-ASM-FIT-IN-DN16-JIC'].id, hoseProductId: p['DEV-ASM-HOSE-DN16-TP-2SN'].id, exitFittingProductId: p['DEV-ASM-FIT-OUT-DN16-JIC-90'].id, hoseLength: 2, assemblyQuantity: 3, totalHoseRequired: 6, sourceDocumentRef: 'COT-DEMO-OPEN-001', notes: 'Orden abierta.', createdAt: at(0, 7), updatedAt: at(0, 7) } });
  const awo1 = await prisma.assemblyWorkOrder.create({ data: { productionOrderId: asm1.id, warehouseId: w['WH-01'].id, wipLocationId: l['WIP-WH-01'].id, availabilityStatus: 'EXACT', reservationStatus: 'RESERVED', pickStatus: 'NOT_RELEASED', wipStatus: 'NOT_IN_WIP', consumptionStatus: 'NOT_CONSUMED', hasShortage: false, createdAt: at(0, 7), updatedAt: at(0, 7) } });
  const awo1Entry = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo1.id, componentRole: 'ENTRY_FITTING', productId: p['DEV-ASM-FIT-IN-DN16-JIC'].id, unitLabel: 'pieza', perAssemblyQty: 1, requiredQty: 3, reservedQty: 3, pickedQty: 0, wipQty: 0, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'NOT_RELEASED', wipStatus: 'NOT_IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(0, 7), updatedAt: at(0, 7) } });
  const awo1Hose = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo1.id, componentRole: 'HOSE', productId: p['DEV-ASM-HOSE-DN16-TP-2SN'].id, unitLabel: 'm', perAssemblyQty: 2, requiredQty: 6, reservedQty: 6, pickedQty: 0, wipQty: 0, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'NOT_RELEASED', wipStatus: 'NOT_IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(0, 7), updatedAt: at(0, 7) } });
  const awo1Exit = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo1.id, componentRole: 'EXIT_FITTING', productId: p['DEV-ASM-FIT-OUT-DN16-JIC-90'].id, unitLabel: 'pieza', perAssemblyQty: 1, requiredQty: 3, reservedQty: 3, pickedQty: 0, wipQty: 0, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'NOT_RELEASED', wipStatus: 'NOT_IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(0, 7), updatedAt: at(0, 7) } });
  const pk1 = await prisma.pickList.create({ data: { code: 'DEMO-PK-OPEN-001', assemblyWorkOrderId: awo1.id, status: 'DRAFT', createdAt: at(0, 7), updatedAt: at(0, 7) } });
  await prisma.pickTask.createMany({ data: [
    { pickListId: pk1.id, assemblyWorkOrderLineId: awo1Entry.id, sourceLocationId: l['B-01-01'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 1, requestedQty: 3, reservedQty: 3, pickedQty: 0, shortQty: 0, status: 'PENDING', createdAt: at(0, 7), updatedAt: at(0, 7) },
    { pickListId: pk1.id, assemblyWorkOrderLineId: awo1Hose.id, sourceLocationId: l['A-12-04'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 2, requestedQty: 4, reservedQty: 4, pickedQty: 0, shortQty: 0, status: 'PENDING', createdAt: at(0, 7), updatedAt: at(0, 7) },
    { pickListId: pk1.id, assemblyWorkOrderLineId: awo1Hose.id, sourceLocationId: l['D-05-01'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 3, requestedQty: 2, reservedQty: 2, pickedQty: 0, shortQty: 0, status: 'PENDING', createdAt: at(0, 7), updatedAt: at(0, 7) },
    { pickListId: pk1.id, assemblyWorkOrderLineId: awo1Exit.id, sourceLocationId: l['C-03-02'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 4, requestedQty: 3, reservedQty: 3, pickedQty: 0, shortQty: 0, status: 'PENDING', createdAt: at(0, 7), updatedAt: at(0, 7) },
  ] });
  await inv('DEV-ASM-FIT-IN-DN16-JIC', 'B-01-01', 6, 3);
  await inv('DEV-ASM-HOSE-DN16-TP-2SN', 'A-12-04', 4, 4);
  await inv('DEV-ASM-HOSE-DN16-TP-2SN', 'D-05-01', 5, 2);
  await inv('DEV-ASM-FIT-OUT-DN16-JIC-90', 'C-03-02', 5, 3);

  const asm2 = await prisma.productionOrder.create({ data: { code: 'DEMO-ENS-WIP-001', kind: 'ASSEMBLY_3PIECE', status: 'EN_PROCESO', priority: 3, customerName: 'Minería Demo', dueDate: at(1, 17), notes: 'Con material en WIP para cierre.', warehouseId: w['WH-01'].id, createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  await prisma.assemblyConfiguration.create({ data: { productionOrderId: asm2.id, entryFittingProductId: p['DEV-ASM-FIT-IN-DN12-NPT'].id, hoseProductId: p['DEV-ASM-HOSE-DN12-TP-1SN'].id, exitFittingProductId: p['DEV-ASM-FIT-OUT-DN12-NPT-90'].id, hoseLength: 1.5, assemblyQuantity: 2, totalHoseRequired: 3, sourceDocumentRef: 'COT-DEMO-WIP-001', notes: 'Lista para cierre.', createdAt: at(-1, 7), updatedAt: at(-1, 7) } });
  const awo2 = await prisma.assemblyWorkOrder.create({ data: { productionOrderId: asm2.id, warehouseId: w['WH-01'].id, wipLocationId: l['WIP-WH-01'].id, availabilityStatus: 'EXACT', reservationStatus: 'RESERVED', pickStatus: 'COMPLETED', wipStatus: 'IN_WIP', consumptionStatus: 'NOT_CONSUMED', hasShortage: false, releasedAt: at(-1, 8), createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  const awo2Entry = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo2.id, componentRole: 'ENTRY_FITTING', productId: p['DEV-ASM-FIT-IN-DN12-NPT'].id, unitLabel: 'pieza', perAssemblyQty: 1, requiredQty: 2, reservedQty: 2, pickedQty: 2, wipQty: 2, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'COMPLETED', wipStatus: 'IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  const awo2Hose = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo2.id, componentRole: 'HOSE', productId: p['DEV-ASM-HOSE-DN12-TP-1SN'].id, unitLabel: 'm', perAssemblyQty: 1.5, requiredQty: 3, reservedQty: 3, pickedQty: 3, wipQty: 3, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'COMPLETED', wipStatus: 'IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  const awo2Exit = await prisma.assemblyWorkOrderLine.create({ data: { assemblyWorkOrderId: awo2.id, componentRole: 'EXIT_FITTING', productId: p['DEV-ASM-FIT-OUT-DN12-NPT-90'].id, unitLabel: 'pieza', perAssemblyQty: 1, requiredQty: 2, reservedQty: 2, pickedQty: 2, wipQty: 2, consumedQty: 0, shortQty: 0, reservationStatus: 'RESERVED', pickStatus: 'COMPLETED', wipStatus: 'IN_WIP', consumptionStatus: 'NOT_CONSUMED', createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  const pk2 = await prisma.pickList.create({ data: { code: 'DEMO-PK-WIP-001', assemblyWorkOrderId: awo2.id, status: 'COMPLETED', releasedAt: at(-1, 8), completedAt: at(-1, 10), createdAt: at(-1, 7), updatedAt: at(-1, 10) } });
  const t1 = await prisma.pickTask.create({ data: { pickListId: pk2.id, assemblyWorkOrderLineId: awo2Entry.id, sourceLocationId: l['D-05-01'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 1, requestedQty: 2, reservedQty: 2, pickedQty: 2, shortQty: 0, status: 'COMPLETED', createdAt: at(-1, 8), updatedAt: at(-1, 8) } });
  const t2 = await prisma.pickTask.create({ data: { pickListId: pk2.id, assemblyWorkOrderLineId: awo2Hose.id, sourceLocationId: l['E-02-03'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 2, requestedQty: 3, reservedQty: 3, pickedQty: 3, shortQty: 0, status: 'COMPLETED', createdAt: at(-1, 8), updatedAt: at(-1, 8) } });
  const t3 = await prisma.pickTask.create({ data: { pickListId: pk2.id, assemblyWorkOrderLineId: awo2Exit.id, sourceLocationId: l['E-02-03'].id, targetWipLocationId: l['WIP-WH-01'].id, sequence: 3, requestedQty: 2, reservedQty: 2, pickedQty: 2, shortQty: 0, status: 'COMPLETED', createdAt: at(-1, 8), updatedAt: at(-1, 8) } });
  await inv('DEV-ASM-FIT-IN-DN12-NPT', 'D-05-01', 5);
  await inv('DEV-ASM-HOSE-DN12-TP-1SN', 'E-02-03', 9);
  await inv('DEV-ASM-FIT-OUT-DN12-NPT-90', 'E-02-03', 5);
  await inv('DEV-ASM-FIT-IN-DN12-NPT', 'WIP-WH-01', 2);
  await inv('DEV-ASM-HOSE-DN12-TP-1SN', 'WIP-WH-01', 3);
  await inv('DEV-ASM-FIT-OUT-DN12-NPT-90', 'WIP-WH-01', 2);

  const wipMovements = [
    ['TRC-DEMO-WIP-001', t1, p['DEV-ASM-FIT-IN-DN12-NPT'], l['D-05-01'], 2, at(-1, 8, 30)],
    ['TRC-DEMO-WIP-002', t2, p['DEV-ASM-HOSE-DN12-TP-1SN'], l['E-02-03'], 3, at(-1, 8, 40)],
    ['TRC-DEMO-WIP-003', t3, p['DEV-ASM-FIT-OUT-DN12-NPT-90'], l['E-02-03'], 2, at(-1, 8, 50)],
  ];
  for (const [traceId, task, product, fromLocation, quantity, createdAt] of wipMovements) {
    const movement = await prisma.inventoryMovement.create({
      data: {
        type: 'TRANSFER', quantity, traceId, operatorName: 'Carlos Ensamble', reference: asm2.code, notes: `Surtido a WIP (${task.sequence})`,
        documentType: 'ASSEMBLY_ORDER', documentId: asm2.id, documentLineId: task.id, productId: product.id, locationId: fromLocation.id,
        fromLocationCode: fromLocation.code, toLocationCode: 'WIP-WH-01', createdAt,
      },
    });
    await trace({
      traceId, labelType: 'WIP', sourceEntityType: 'DEMO_PICK_TASK', sourceEntityId: task.id, templateCode: 'WIP_STANDARD',
      productId: product.id, warehouseId: w['WH-01'].id, locationId: l['WIP-WH-01'].id, originMovementId: movement.id,
      sourceDocumentType: 'ASSEMBLY_ORDER', sourceDocumentId: asm2.id, sourceDocumentLineId: task.id,
      operatorName: 'Carlos Ensamble', reference: asm2.code, quantity, unitLabel: product.unitLabel,
      payload: { sku: product.sku, quantity, target: 'WIP-WH-01' }, createdAt, jobStatus: 'PRINTED',
    });
  }

  return {
    suppliers: await prisma.supplier.count({ where: { code: { startsWith: 'DEMO-SUP-' } } }),
    purchaseOrders: await prisma.purchaseOrder.count({ where: { folio: { startsWith: 'DEMO-OC-' } } }),
    receipts: await prisma.purchaseReceipt.count({ where: { purchaseOrder: { folio: { startsWith: 'DEMO-OC-' } } } }),
    productionOrders: await prisma.productionOrder.count({ where: { code: { startsWith: 'DEMO-' } } }),
    traceRecords: await prisma.traceRecord.count({ where: { traceId: { startsWith: 'TRC-DEMO-' } } }),
  };
}

module.exports = { seedDemoData };
