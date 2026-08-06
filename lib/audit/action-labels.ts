const AUDIT_ACTION_LABELS: Record<string, string> = {
  CONFIRM_REQUEST: "Confirmar pedido",
  ADD_PRODUCT_LINE: "Agregar producto al pedido",
  ADD_CONFIGURED_ASSEMBLY_LINE: "Agregar ensamble al pedido",
  REBUILD_DIRECT_PICKLIST: "Regenerar surtido directo",
  RELEASE_DIRECT_PICKLIST: "Liberar surtido directo",
  CLAIM_WAREHOUSE_PICK_TASKS: "Tomar tareas de almacén",
  ASSIGN_WAREHOUSE_PICK_TASKS: "Asignar tareas a almacén",
  CONFIRM_DIRECT_PICK: "Confirmar surtido físico",
  CLAIM_WAREHOUSE_ASSEMBLY: "Tomar componentes de ensamble",
  COMPLETE_WAREHOUSE_ASSEMBLY: "Completar ensamble en almacén",
  MARK_PREPARED_FOR_DELIVERY: "Marcar preparado para entrega",
  RESOLVE_OPERATIONAL_EXCEPTION: "Resolver excepción operativa",
  REVALIDATE_COMMERCIAL_PROMISE: "Revalidar promesa comercial",
  RESERVE_STOCK: "Reservar inventario",
  MARK_DELIVERED_TO_CUSTOMER: "Registrar entrega al cliente",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action.replaceAll("_", " ").toLowerCase();
}
