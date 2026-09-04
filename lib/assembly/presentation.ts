const COMPONENT_ROLE_LABELS: Record<string, string> = {
  ENTRY_FITTING: "Conexión de entrada",
  HOSE: "Manguera",
  EXIT_FITTING: "Conexión de salida",
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  DRAFT: "Por liberar",
  RELEASED: "Liberado",
  IN_PROGRESS: "En proceso",
  PARTIAL: "Parcial",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  RESERVED: "Reservado",
  NOT_RESERVED: "Sin reservar",
  NOT_RELEASED: "Por liberar",
  IN_WIP: "En área de ensamble",
  NOT_IN_WIP: "Pendiente de ingresar al área de ensamble",
  CONSUMED: "Consumido",
  NOT_CONSUMED: "Pendiente de consumo",
};

export function assemblyComponentRoleLabel(value: string) {
  return COMPONENT_ROLE_LABELS[value] ?? "Componente de ensamble";
}

export function assemblyWorkflowStatusLabel(value: string) {
  return WORKFLOW_STATUS_LABELS[value] ?? "Estado no disponible";
}
