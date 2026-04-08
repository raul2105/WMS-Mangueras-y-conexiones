const ROLE_PRIORITY = [
  "SYSTEM_ADMIN",
  "MANAGER",
  "WAREHOUSE_OPERATOR",
  "SALES_EXECUTIVE",
];

const ROLE_ALIASES = {
  ADMINISTRADOR: "SYSTEM_ADMIN",
  OPERADOR: "WAREHOUSE_OPERATOR",
  SALES: "SALES_EXECUTIVE",
};

export const MODULE_CATALOG = [
  {
    id: "home",
    label: "Inicio",
    panelId: "homePanel",
    allowedProfiles: ROLE_PRIORITY,
    showOnHome: false,
  },
  {
    id: "catalog",
    label: "Catalogo",
    panelId: "catalogPanel",
    requiredPermission: "catalog.view",
    requiredFeatureFlag: "catalog_enabled",
    allowedProfiles: ROLE_PRIORITY,
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Consulta el maestro de productos con detalle y stock resumido."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "inventory",
    label: "Inventario consulta",
    panelId: "inventoryPanel",
    requiredPermission: "inventory.search",
    requiredFeatureFlag: "inventory_search_enabled",
    allowedProfiles: ROLE_PRIORITY,
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Consulta inventario por SKU o nombre en el almacen objetivo."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "sales",
    label: "Pedidos de surtido",
    panelId: "salesPanel",
    requiredPermission: "sales.view",
    requiredFeatureFlag: "sales_requests_enabled",
    allowedProfiles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Captura encabezados, consulta estados y da seguimiento comercial."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "availability",
    label: "Disponibilidad",
    panelId: "availabilityPanel",
    requiredPermission: "sales.view",
    requiredFeatureFlag: "availability_enabled",
    allowedProfiles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Consulta stock total, reservado y disponible por almacen."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "equivalences",
    label: "Equivalencias",
    panelId: "equivalencesPanel",
    requiredPermission: "sales.view",
    requiredFeatureFlag: "equivalences_enabled",
    allowedProfiles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Busca sustitutos registrados para apoyar promesa comercial."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "assembly",
    label: "Solicitudes de ensamble",
    panelId: "assemblyPanel",
    requiredPermission: "assembly_requests.create",
    requiredFeatureFlag: "assembly_requests_enabled",
    allowedProfiles: ROLE_PRIORITY,
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Crea solicitudes nuevas y consulta estatus por identificador."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
  {
    id: "drafts",
    label: "Borradores de producto",
    panelId: "draftsPanel",
    requiredPermission: "product_drafts.create",
    requiredFeatureFlag: "product_drafts_enabled",
    allowedProfiles: ["SYSTEM_ADMIN", "MANAGER", "SALES_EXECUTIVE"],
    showOnHome: true,
    summary(enabled) {
      return enabled
        ? "Captura borradores rapidos para alta o ajuste de catalogo."
        : "Oculto por perfil efectivo, permisos o configuracion.";
    },
  },
];

const ROLE_DEFAULT_MODULES = {
  SYSTEM_ADMIN: ["home", "catalog", "inventory", "sales", "availability", "equivalences", "assembly", "drafts"],
  MANAGER: ["home", "catalog", "inventory", "sales", "availability", "equivalences", "assembly", "drafts"],
  WAREHOUSE_OPERATOR: ["home", "catalog", "inventory", "assembly"],
  SALES_EXECUTIVE: ["home", "catalog", "inventory", "sales", "availability", "equivalences", "assembly", "drafts"],
};

export function normalizeRoleCode(roleCode) {
  const normalized = String(roleCode || "").trim().toUpperCase();
  return ROLE_ALIASES[normalized] || normalized;
}

export function resolveEffectiveRoleCode(roleCodes = []) {
  const normalizedRoleCodes = roleCodes.map(normalizeRoleCode).filter(Boolean);
  for (const roleCode of ROLE_PRIORITY) {
    if (normalizedRoleCodes.includes(roleCode)) {
      return roleCode;
    }
  }
  return "MANAGER";
}

export function getModulesForProfile(profileCode, permissions = new Set(), featureFlags = {}) {
  const normalizedProfile = normalizeRoleCode(profileCode);
  const moduleIds = ROLE_DEFAULT_MODULES[normalizedProfile] || ROLE_DEFAULT_MODULES.MANAGER;

  return moduleIds
    .map((id) => MODULE_CATALOG.find((module) => module.id === id))
    .filter(Boolean)
    .filter((module) => module.allowedProfiles.includes(normalizedProfile))
    .filter((module) => {
      if (!module.requiredPermission) return true;
      return permissions.has(module.requiredPermission);
    })
    .filter((module) => {
      if (!module.requiredFeatureFlag) return true;
      return Boolean(featureFlags?.[module.requiredFeatureFlag]);
    });
}
