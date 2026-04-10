import {
  createAssemblyRequest,
  createProductDraft,
  createSalesRequest,
  fetchAssemblyRequest,
  fetchAvailability,
  fetchCatalog,
  fetchCatalogItem,
  fetchEquivalences,
  fetchHealth,
  fetchMePermissions,
  fetchSalesRequest,
  fetchSalesRequests,
  fetchVersion,
  searchInventory,
} from "./api-client.js";
import { logout, restoreSession, startLogin } from "./auth-adapter.js";
import { getModulesForProfile, resolveEffectiveRoleCode } from "./module-config.js";

const runtimeConfig = window.__WMS_MOBILE_CONFIG__ || {};
const loginView = document.querySelector("#loginView");
const homeView = document.querySelector("#homeView");
const loginBtn = document.querySelector("#loginBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const environmentBadgeEl = document.querySelector("#environmentBadge");
const loginErrorEl = document.querySelector("#loginError");

const displayNameEl = document.querySelector("#displayName");
const userMetaEl = document.querySelector("#userMeta");
const userEmailChipEl = document.querySelector("#userEmailChip");
const userRoleChipEl = document.querySelector("#userRoleChip");
const homeServiceStatusEl = document.querySelector("#homeServiceStatus");
const homeVersionStatusEl = document.querySelector("#homeVersionStatus");
const homeFeatureStatusEl = document.querySelector("#homeFeatureStatus");
const moduleNavEl = document.querySelector("#moduleNav");
const homeModuleGridEl = document.querySelector("#homeModuleGrid");

const panelEls = Array.from(document.querySelectorAll(".panel"));

const catalogFormEl = document.querySelector("#catalogForm");
const catalogFeedbackEl = document.querySelector("#catalogFeedback");
const catalogResultsEl = document.querySelector("#catalogResults");
const catalogDetailEl = document.querySelector("#catalogDetail");
const catalogSubmitEl = document.querySelector("#catalogSubmit");

const inventoryFormEl = document.querySelector("#inventoryForm");
const inventoryResultsEl = document.querySelector("#inventoryResults");
const inventoryFeedbackEl = document.querySelector("#inventoryFeedback");
const inventorySubmitEl = document.querySelector("#inventorySubmit");

const salesFiltersFormEl = document.querySelector("#salesFiltersForm");
const salesFeedbackEl = document.querySelector("#salesFeedback");
const salesResultsEl = document.querySelector("#salesResults");
const salesSummaryGridEl = document.querySelector("#salesSummaryGrid");
const salesRefreshSubmitEl = document.querySelector("#salesRefreshSubmit");
const salesCreateFormEl = document.querySelector("#salesCreateForm");
const salesCreateFeedbackEl = document.querySelector("#salesCreateFeedback");
const salesCreateSubmitEl = document.querySelector("#salesCreateSubmit");
const salesDetailFormEl = document.querySelector("#salesDetailForm");
const salesDetailFeedbackEl = document.querySelector("#salesDetailFeedback");
const salesDetailResultEl = document.querySelector("#salesDetailResult");
const salesDetailSubmitEl = document.querySelector("#salesDetailSubmit");

const availabilityFormEl = document.querySelector("#availabilityForm");
const availabilityFeedbackEl = document.querySelector("#availabilityFeedback");
const availabilityResultsEl = document.querySelector("#availabilityResults");
const availabilitySubmitEl = document.querySelector("#availabilitySubmit");

const equivalencesFormEl = document.querySelector("#equivalencesForm");
const equivalencesFeedbackEl = document.querySelector("#equivalencesFeedback");
const equivalencesResultsEl = document.querySelector("#equivalencesResults");
const equivalencesSubmitEl = document.querySelector("#equivalencesSubmit");

const assemblyFormEl = document.querySelector("#assemblyForm");
const assemblyFeedbackEl = document.querySelector("#assemblyFeedback");
const assemblySubmitEl = document.querySelector("#assemblySubmit");
const assemblyStatusFormEl = document.querySelector("#assemblyStatusForm");
const assemblyStatusFeedbackEl = document.querySelector("#assemblyStatusFeedback");
const assemblyStatusResultEl = document.querySelector("#assemblyStatusResult");
const assemblyStatusSubmitEl = document.querySelector("#assemblyStatusSubmit");

const draftFormEl = document.querySelector("#draftForm");
const draftFeedbackEl = document.querySelector("#draftFeedback");
const draftSubmitEl = document.querySelector("#draftSubmit");

const state = {
  session: null,
  permissions: new Set(),
  apiFlags: {},
  visibleModules: [],
  effectiveRoleCode: "MANAGER",
  activePanelId: "homePanel",
};

function setView(isAuthenticated) {
  loginView.classList.toggle("hidden", isAuthenticated);
  homeView.classList.toggle("hidden", !isAuthenticated);
}

function showLoginError(error) {
  setView(false);
  if (!loginErrorEl) return;
  const raw = typeof error === "string" ? error : error?.message || String(error || "Error desconocido");
  loginErrorEl.textContent = `No se pudo completar el inicio de sesion: ${raw}`;
  loginErrorEl.classList.remove("hidden");
}

function clearLoginError() {
  if (!loginErrorEl) return;
  loginErrorEl.textContent = "";
  loginErrorEl.classList.add("hidden");
}

function setFeedback(element, message, type = "muted") {
  if (!element) return;
  element.textContent = message || "";
  element.classList.remove("ok", "error", "muted");
  element.classList.add(type);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString("es-MX");
}

function setPanel(tabId) {
  state.activePanelId = tabId;
  for (const panel of panelEls) {
    panel.classList.toggle("active", panel.id === tabId);
  }
  const moduleLinkEls = Array.from(document.querySelectorAll(".module-link"));
  for (const link of moduleLinkEls) {
    link.classList.toggle("active", link.dataset.tab === tabId);
  }
}

function renderModuleNav(modules) {
  moduleNavEl.innerHTML = modules
    .map(
      (module, index) => `
      <button class="module-link${index === 0 ? " active" : ""}" data-tab="${module.panelId}" type="button">${escapeHtml(module.label)}</button>
    `,
    )
    .join("");

  for (const link of Array.from(moduleNavEl.querySelectorAll(".module-link"))) {
    link.addEventListener("click", () => {
      setPanel(link.dataset.tab);
    });
  }
}

function renderHomeModules(modules) {
  const items = modules.filter((module) => module.showOnHome);
  if (items.length === 0) {
    homeModuleGridEl.innerHTML = `
      <article class="mini-card">
        <h4>Sin modulos operativos</h4>
        <p class="muted">No hay capacidades habilitadas para este perfil efectivo en el entorno actual.</p>
      </article>
    `;
    return;
  }

  homeModuleGridEl.innerHTML = items
    .map(
      (module) => `
      <article class="mini-card">
        <h4>${escapeHtml(module.label)}</h4>
        <p class="muted">${escapeHtml(typeof module.summary === "function" ? module.summary(true) : "Disponible en tu perfil efectivo.")}</p>
      </article>
    `,
    )
    .join("");
}

function setModuleEnabled(button, enabled) {
  if (button) button.disabled = !enabled;
}

function syncModuleState() {
  const visibleModules = getModulesForProfile(state.effectiveRoleCode, state.permissions, state.apiFlags);
  state.visibleModules = visibleModules;

  renderModuleNav(visibleModules);
  renderHomeModules(visibleModules);

  const visiblePanelIds = new Set(visibleModules.map((module) => module.panelId));
  const nextPanelId = visiblePanelIds.has(state.activePanelId) ? state.activePanelId : "homePanel";
  setPanel(nextPanelId);

  const panelGuards = [
    { panelId: "catalogPanel", button: catalogSubmitEl, feedback: catalogFeedbackEl, message: "Catalogo oculto para tu perfil efectivo o configuracion." },
    { panelId: "inventoryPanel", button: inventorySubmitEl, feedback: inventoryFeedbackEl, message: "Modulo oculto para tu perfil efectivo o configuracion." },
    { panelId: "salesPanel", button: salesRefreshSubmitEl, feedback: salesFeedbackEl, message: "Pedidos de surtido ocultos para tu perfil efectivo o configuracion." },
    { panelId: "salesPanel", button: salesCreateSubmitEl, feedback: salesCreateFeedbackEl, message: "Creacion de pedidos oculta para tu perfil efectivo o configuracion." },
    { panelId: "salesPanel", button: salesDetailSubmitEl, feedback: salesDetailFeedbackEl, message: "Seguimiento de pedidos oculto para tu perfil efectivo o configuracion." },
    { panelId: "availabilityPanel", button: availabilitySubmitEl, feedback: availabilityFeedbackEl, message: "Disponibilidad oculta para tu perfil efectivo o configuracion." },
    { panelId: "equivalencesPanel", button: equivalencesSubmitEl, feedback: equivalencesFeedbackEl, message: "Equivalencias ocultas para tu perfil efectivo o configuracion." },
    { panelId: "assemblyPanel", button: assemblySubmitEl, feedback: assemblyFeedbackEl, message: "Modulo oculto para tu perfil efectivo o configuracion." },
    { panelId: "assemblyPanel", button: assemblyStatusSubmitEl, feedback: assemblyStatusFeedbackEl, message: "Seguimiento oculto para tu perfil efectivo o configuracion." },
    { panelId: "draftsPanel", button: draftSubmitEl, feedback: draftFeedbackEl, message: "Modulo oculto para tu perfil efectivo o configuracion." },
  ];

  for (const guard of panelGuards) {
    const enabled = visiblePanelIds.has(guard.panelId);
    setModuleEnabled(guard.button, enabled);
    setFeedback(guard.feedback, enabled ? "" : guard.message, enabled ? "muted" : "error");
  }
}

function renderInventoryResults(items) {
  if (!items.length) {
    inventoryResultsEl.innerHTML = "<p class=\"muted\">Sin resultados para los criterios enviados.</p>";
    return;
  }

  inventoryResultsEl.innerHTML = items
    .map((item) => {
      const sku = escapeHtml(item.sku || "-");
      const name = escapeHtml(item.name || "Sin nombre");
      const qty = Number(item.availableQty ?? 0);
      const warehouseCode = escapeHtml(item.warehouseCode || "-");
      const updatedAt = escapeHtml(item.updatedAt || "-");
      return `
        <article class="result-item">
          <h5>${name}</h5>
          <p class="muted">SKU: ${sku}</p>
          <p>Disponible: <strong>${qty}</strong></p>
          <p class="muted">Almacen: ${warehouseCode} · Actualizado: ${updatedAt}</p>
        </article>
      `;
    })
    .join("");
}

function renderCatalogResults(items) {
  if (!items.length) {
    catalogResultsEl.innerHTML = "<p class=\"muted\">No hay productos para el criterio enviado.</p>";
    catalogDetailEl.innerHTML = "";
    return;
  }

  catalogResultsEl.innerHTML = items
    .map((item) => {
      const inventoryText = (item.inventory || [])
        .map((row) => `${escapeHtml(row.warehouseCode)}: ${Number(row.available ?? 0)} disp.`)
        .join(" · ");
      return `
        <article class="result-item">
          <h5>${escapeHtml(item.name)}</h5>
          <p class="muted">${escapeHtml(item.sku || "-")} · ${escapeHtml(item.brand || item.type || "-")}</p>
          <p>${escapeHtml(item.categoryName || item.subcategory || "Sin categoria")} · Stock total <strong>${Number(item.totalStock ?? 0)}</strong></p>
          <p class="muted">${inventoryText || "Sin detalle de inventario."}</p>
          <div class="row">
            <button type="button" class="ghost catalog-detail-trigger" data-product-id="${escapeHtml(item.productId)}">Ver detalle</button>
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of Array.from(catalogResultsEl.querySelectorAll(".catalog-detail-trigger"))) {
    button.addEventListener("click", () => {
      void loadCatalogDetail(button.dataset.productId);
    });
  }
}

function renderCatalogDetail(item) {
  if (!item) {
    catalogDetailEl.innerHTML = "";
    return;
  }

  const inventoryRows = (item.inventory || [])
    .map(
      (row) =>
        `<p class="muted">${escapeHtml(row.warehouseCode)} · Total ${Number(row.quantity ?? 0)} · Reservado ${Number(row.reserved ?? 0)} · Disponible ${Number(row.available ?? 0)}</p>`,
    )
    .join("");

  catalogDetailEl.innerHTML = `
    <article class="result-item">
      <h5>Detalle de producto</h5>
      <p><strong>${escapeHtml(item.name)}</strong></p>
      <p class="muted">${escapeHtml(item.sku || "-")} · ${escapeHtml(item.referenceCode || "-")}</p>
      <p>${escapeHtml(item.categoryName || item.subcategory || "Sin categoria")} · ${escapeHtml(item.brand || item.type || "-")}</p>
      <p>Precio: <strong>${item.price == null ? "-" : `$${Number(item.price).toFixed(2)}`}</strong></p>
      <div>${inventoryRows || '<p class="muted">Sin desglose de inventario.</p>'}</div>
    </article>
  `;
}

function renderSalesSummary(summary) {
  const tiles = [
    ["Pedidos", summary?.total ?? 0],
    ["Borrador", summary?.draft ?? 0],
    ["Confirmada", summary?.confirmed ?? 0],
    ["Cancelada", summary?.cancelled ?? 0],
  ];
  salesSummaryGridEl.innerHTML = tiles
    .map(
      ([label, value]) => `
      <article class="tile">
        <h3>${escapeHtml(label)}</h3>
        <p>${escapeHtml(value)}</p>
      </article>
    `,
    )
    .join("");
}

function renderSalesResults(items) {
  if (!items.length) {
    salesResultsEl.innerHTML = "<p class=\"muted\">No hay pedidos para el filtro seleccionado.</p>";
    return;
  }

  salesResultsEl.innerHTML = items
    .map(
      (item) => `
      <article class="result-item">
        <h5>${escapeHtml(item.code)}</h5>
        <p>${escapeHtml(item.customerName || "Sin cliente")} · Estado <strong>${escapeHtml(item.status)}</strong></p>
        <p class="muted">Almacen: ${escapeHtml(item.warehouseCode || "-")} · Entrega: ${escapeHtml(formatDate(item.dueDate))}</p>
        <p class="muted">Solicitado por: ${escapeHtml(item.requestedBy || "-")} · Lineas: ${Number(item.lineCount ?? 0)} · Sync: ${escapeHtml(item.syncStatus || "-")}</p>
        <div class="row">
          <button type="button" class="ghost sales-detail-trigger" data-request-id="${escapeHtml(item.requestId)}">Ver seguimiento</button>
        </div>
      </article>
    `,
    )
    .join("");

  for (const button of Array.from(salesResultsEl.querySelectorAll(".sales-detail-trigger"))) {
    button.addEventListener("click", () => {
      document.querySelector("#salesDetailRequestId").value = button.dataset.requestId || "";
      void loadSalesRequestDetail(button.dataset.requestId);
    });
  }
}

function renderSalesDetail(item) {
  if (!item) {
    salesDetailResultEl.innerHTML = "";
    return;
  }

  salesDetailResultEl.innerHTML = `
    <article class="result-item">
      <h5>${escapeHtml(item.code)}</h5>
      <p>${escapeHtml(item.customerName || "Sin cliente")} · <strong>${escapeHtml(item.status)}</strong></p>
      <p class="muted">Almacen: ${escapeHtml(item.warehouseCode || "-")} · Entrega: ${escapeHtml(formatDate(item.dueDate))}</p>
      <p class="muted">Sync: ${escapeHtml(item.syncStatus || "-")} · Actualizado: ${escapeHtml(item.updatedAt || item.createdAt || "-")}</p>
      <p class="muted">Notas: ${escapeHtml(item.notes || "-")}</p>
    </article>
  `;
}

function renderAvailabilityResults(items) {
  if (!items.length) {
    availabilityResultsEl.innerHTML = "<p class=\"muted\">No hay productos para el filtro seleccionado.</p>";
    return;
  }

  availabilityResultsEl.innerHTML = items
    .map(
      (item) => `
      <article class="result-item">
        <h5>${escapeHtml(item.name)}</h5>
        <p class="muted">${escapeHtml(item.sku || "-")} · ${escapeHtml(item.brand || "-")}</p>
        <p>Total <strong>${Number(item.total ?? 0)}</strong> · Reservado <strong>${Number(item.reserved ?? 0)}</strong> · Disponible <strong>${Number(item.available ?? 0)}</strong></p>
        <p class="muted">${(item.byWarehouse || []).map((row) => `${escapeHtml(row.warehouseCode)}: ${Number(row.available ?? 0)} disp.`).join(" · ") || "Sin desglose por almacen."}</p>
      </article>
    `,
    )
    .join("");
}

function renderEquivalencesResults(items) {
  if (!items.length) {
    equivalencesResultsEl.innerHTML = "<p class=\"muted\">No se encontraron equivalencias para la busqueda enviada.</p>";
    return;
  }

  equivalencesResultsEl.innerHTML = items
    .map((item) => {
      const equivalentMarkup = (item.equivalents || [])
        .map(
          (equivalent) => `
          <div class="result-item">
            <h5>${escapeHtml(equivalent.name)}</h5>
            <p class="muted">${escapeHtml(equivalent.sku || "-")} · ${escapeHtml(equivalent.brand || equivalent.categoryName || "-")}</p>
            <p>Disponible actual: <strong>${Number(equivalent.totalAvailable ?? 0)}</strong></p>
            <p class="muted">${(equivalent.locations || []).map((row) => `${escapeHtml(row.warehouseCode)}: ${Number(row.available ?? 0)} disp.`).join(" · ") || "Sin stock visible."}</p>
          </div>
        `,
        )
        .join("");

      return `
        <article class="result-item">
          <h5>${escapeHtml(item.name)}</h5>
          <p class="muted">${escapeHtml(item.sku || "-")} · Disponible actual ${Number(item.totalAvailable ?? 0)}</p>
          <div class="results-list">${equivalentMarkup || '<p class="muted">No hay equivalencias registradas.</p>'}</div>
        </article>
      `;
    })
    .join("");
}

function renderAssemblyStatusResult(payload) {
  if (!payload?.ok) {
    assemblyStatusResultEl.innerHTML = "";
    return;
  }

  const warehouseCode = escapeHtml(payload.warehouseCode || "-");
  const status = escapeHtml(payload.status || "-");
  const requestId = escapeHtml(payload.requestId || "-");
  const updatedAt = escapeHtml(payload.updatedAt || payload.createdAt || "-");

  assemblyStatusResultEl.innerHTML = `
    <article class="result-item">
      <h5>Solicitud ${requestId}</h5>
      <p>Estado: <strong>${status}</strong></p>
      <p class="muted">Almacen: ${warehouseCode}</p>
      <p class="muted">Actualizado: ${updatedAt}</p>
    </article>
  `;
}

async function loadDashboard(session) {
  state.session = session;
  displayNameEl.textContent = session.displayName || "Usuario movil";
  userMetaEl.textContent = `userId: ${session.userId || "-"} | authMode: ${session.authMode}`;
  userEmailChipEl.textContent = `email: ${session.email || "-"}`;
  userRoleChipEl.textContent = `perfil: ${(session.roleCodes || []).join(", ") || "-"}`;

  const [health, version, mePermissions] = await Promise.all([
    fetchHealth(),
    fetchVersion(),
    fetchMePermissions(session.token),
  ]);

  state.permissions = new Set(mePermissions?.payload?.permissionCodes || []);
  state.apiFlags = version?.payload?.flags || {};

  const effectiveEmail = mePermissions?.payload?.email || session.email || "-";
  const effectiveRoles = Array.isArray(mePermissions?.payload?.roleCodes)
    ? mePermissions.payload.roleCodes
    : session.roleCodes || [];
  state.effectiveRoleCode = mePermissions?.payload?.effectiveRoleCode || resolveEffectiveRoleCode(effectiveRoles);

  userEmailChipEl.textContent = `email: ${effectiveEmail}`;
  userRoleChipEl.textContent = `perfil: ${state.effectiveRoleCode} | roles: ${effectiveRoles.join(", ") || "-"}`;
  homeServiceStatusEl.textContent = health?.payload?.ok ? "Servicio operativo" : "Servicio con incidencias";
  homeVersionStatusEl.textContent = `API ${version?.payload?.apiVersion || "-"} · Build ${version?.payload?.build || "-"} · ${version?.payload?.releaseDate || "-"}`;
  const enabledFeatureCount = Object.values(state.apiFlags).filter(Boolean).length;
  homeFeatureStatusEl.textContent = `${state.permissions.size} permisos activos · ${enabledFeatureCount} capacidades habilitadas · perfil ${state.effectiveRoleCode}`;

  syncModuleState();
  await Promise.allSettled([loadCatalog(), loadSalesRequests(), loadAvailability()]);
}

async function loadCatalog() {
  if (!state.visibleModules.some((module) => module.panelId === "catalogPanel")) return;
  const query = String(document.querySelector("#catalogQuery").value || "").trim();
  const limit = Number(document.querySelector("#catalogLimit").value || 20);
  setFeedback(catalogFeedbackEl, "Consultando catalogo...", "muted");
  const result = await fetchCatalog(state.session.token, { q: query, limit });
  if (!result.ok) {
    setFeedback(catalogFeedbackEl, `No fue posible consultar catalogo (${result.status}).`, "error");
    catalogResultsEl.innerHTML = "";
    catalogDetailEl.innerHTML = "";
    return;
  }
  const items = Array.isArray(result.payload?.items) ? result.payload.items : [];
  setFeedback(catalogFeedbackEl, `${items.length} producto(s) localizados.`, "ok");
  renderCatalogResults(items);
}

async function loadCatalogDetail(productId) {
  if (!productId) return;
  setFeedback(catalogFeedbackEl, "Consultando detalle...", "muted");
  const result = await fetchCatalogItem(state.session.token, productId);
  if (!result.ok) {
    setFeedback(catalogFeedbackEl, `No fue posible consultar el detalle (${result.status}).`, "error");
    catalogDetailEl.innerHTML = "";
    return;
  }
  setFeedback(catalogFeedbackEl, `Detalle cargado para ${result.payload?.item?.name || productId}.`, "ok");
  renderCatalogDetail(result.payload?.item);
}

async function loadSalesRequests() {
  if (!state.visibleModules.some((module) => module.panelId === "salesPanel")) return;
  const status = String(document.querySelector("#salesStatusFilter").value || "").trim();
  const limit = Number(document.querySelector("#salesLimit").value || 20);
  setFeedback(salesFeedbackEl, "Consultando pedidos...", "muted");
  const result = await fetchSalesRequests(state.session.token, { status, limit });
  if (!result.ok) {
    setFeedback(salesFeedbackEl, `No fue posible consultar pedidos (${result.status}).`, "error");
    salesResultsEl.innerHTML = "";
    renderSalesSummary({});
    return;
  }
  renderSalesSummary(result.payload?.summary);
  renderSalesResults(Array.isArray(result.payload?.items) ? result.payload.items : []);
  setFeedback(salesFeedbackEl, `${Number(result.payload?.summary?.total ?? 0)} pedido(s) en el read model cloud.`, "ok");
}

async function loadSalesRequestDetail(requestId) {
  if (!requestId) return;
  setFeedback(salesDetailFeedbackEl, "Consultando pedido...", "muted");
  const result = await fetchSalesRequest(state.session.token, requestId);
  if (!result.ok) {
    setFeedback(salesDetailFeedbackEl, `No fue posible consultar el pedido (${result.status}).`, "error");
    salesDetailResultEl.innerHTML = "";
    return;
  }
  setFeedback(salesDetailFeedbackEl, `Pedido ${result.payload?.item?.code || requestId} localizado.`, "ok");
  renderSalesDetail(result.payload?.item);
}

async function loadAvailability() {
  if (!state.visibleModules.some((module) => module.panelId === "availabilityPanel")) return;
  const query = String(document.querySelector("#availabilityQuery").value || "").trim();
  const warehouseCode = String(document.querySelector("#availabilityWarehouse").value || "").trim();
  setFeedback(availabilityFeedbackEl, "Consultando disponibilidad...", "muted");
  const result = await fetchAvailability(state.session.token, { q: query, warehouseCode, limit: 20 });
  if (!result.ok) {
    setFeedback(availabilityFeedbackEl, `No fue posible consultar disponibilidad (${result.status}).`, "error");
    availabilityResultsEl.innerHTML = "";
    return;
  }
  const items = Array.isArray(result.payload?.items) ? result.payload.items : [];
  setFeedback(availabilityFeedbackEl, `${items.length} producto(s) analizados.`, "ok");
  renderAvailabilityResults(items);
}

async function loadEquivalences() {
  if (!state.visibleModules.some((module) => module.panelId === "equivalencesPanel")) return;
  const query = String(document.querySelector("#equivalencesQuery").value || "").trim();
  const warehouseCode = String(document.querySelector("#equivalencesWarehouse").value || "").trim();
  if (!query) {
    setFeedback(equivalencesFeedbackEl, "Captura un producto base para consultar equivalencias.", "error");
    equivalencesResultsEl.innerHTML = "";
    return;
  }
  setFeedback(equivalencesFeedbackEl, "Consultando equivalencias...", "muted");
  const result = await fetchEquivalences(state.session.token, { q: query, warehouseCode, limit: 12 });
  if (!result.ok) {
    setFeedback(equivalencesFeedbackEl, `No fue posible consultar equivalencias (${result.status}).`, "error");
    equivalencesResultsEl.innerHTML = "";
    return;
  }
  const items = Array.isArray(result.payload?.items) ? result.payload.items : [];
  setFeedback(equivalencesFeedbackEl, `${items.length} producto(s) base analizados.`, "ok");
  renderEquivalencesResults(items);
}

async function handleCatalogSubmit(event) {
  event.preventDefault();
  catalogSubmitEl.disabled = true;
  try {
    await loadCatalog();
  } catch (error) {
    setFeedback(catalogFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    catalogSubmitEl.disabled = false;
  }
}

async function handleInventorySubmit(event) {
  event.preventDefault();
  if (!state.visibleModules.some((module) => module.panelId === "inventoryPanel")) return;

  const query = String(document.querySelector("#inventoryQuery").value || "").trim();
  const warehouseCode = String(document.querySelector("#inventoryWarehouse").value || "WH-MAIN").trim();
  const limit = Number(document.querySelector("#inventoryLimit").value || 20);

  if (!query) {
    setFeedback(inventoryFeedbackEl, "Escribe un criterio de busqueda.", "error");
    return;
  }

  setFeedback(inventoryFeedbackEl, "Consultando inventario...", "muted");
  inventorySubmitEl.disabled = true;

  try {
    const result = await searchInventory(state.session.token, { q: query, warehouseCode, limit });
    if (!result.ok) {
      setFeedback(inventoryFeedbackEl, `No fue posible consultar inventario (${result.status}).`, "error");
      inventoryResultsEl.innerHTML = "";
      return;
    }

    const items = Array.isArray(result.payload?.items) ? result.payload.items : [];
    setFeedback(inventoryFeedbackEl, `${items.length} resultado(s) encontrados.`, "ok");
    renderInventoryResults(items);
  } catch (error) {
    setFeedback(inventoryFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    inventorySubmitEl.disabled = false;
  }
}

async function handleSalesRefreshSubmit(event) {
  event.preventDefault();
  salesRefreshSubmitEl.disabled = true;
  try {
    await loadSalesRequests();
  } catch (error) {
    setFeedback(salesFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    salesRefreshSubmitEl.disabled = false;
  }
}

async function handleSalesCreateSubmit(event) {
  event.preventDefault();
  if (!state.visibleModules.some((module) => module.panelId === "salesPanel")) return;

  const payload = {
    customerName: String(document.querySelector("#salesCustomerName").value || "").trim(),
    warehouseCode: String(document.querySelector("#salesWarehouseCode").value || "").trim(),
    dueDate: String(document.querySelector("#salesDueDate").value || "").trim(),
    notes: String(document.querySelector("#salesNotes").value || "").trim(),
  };

  if (!payload.customerName || !payload.warehouseCode || !payload.dueDate) {
    setFeedback(salesCreateFeedbackEl, "Cliente, almacen y fecha compromiso son obligatorios.", "error");
    return;
  }

  setFeedback(salesCreateFeedbackEl, "Creando pedido...", "muted");
  salesCreateSubmitEl.disabled = true;

  try {
    const result = await createSalesRequest(state.session.token, payload);
    if (!result.ok) {
      const details = result.payload?.details || result.payload?.error || "Error de negocio";
      setFeedback(salesCreateFeedbackEl, `No fue posible crear el pedido (${details}).`, "error");
      return;
    }

    salesCreateFormEl.reset();
    document.querySelector("#salesWarehouseCode").value = "WH-MAIN";
    setFeedback(salesCreateFeedbackEl, `Pedido creado: ${result.payload?.code || result.payload?.requestId || "sin-id"}.`, "ok");
    await loadSalesRequests();
  } catch (error) {
    setFeedback(salesCreateFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    salesCreateSubmitEl.disabled = false;
  }
}

async function handleSalesDetailSubmit(event) {
  event.preventDefault();
  const requestId = String(document.querySelector("#salesDetailRequestId").value || "").trim();
  if (!requestId) {
    setFeedback(salesDetailFeedbackEl, "Captura un requestId para consultar el pedido.", "error");
    salesDetailResultEl.innerHTML = "";
    return;
  }

  salesDetailSubmitEl.disabled = true;
  try {
    await loadSalesRequestDetail(requestId);
  } catch (error) {
    setFeedback(salesDetailFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    salesDetailSubmitEl.disabled = false;
  }
}

async function handleAvailabilitySubmit(event) {
  event.preventDefault();
  availabilitySubmitEl.disabled = true;
  try {
    await loadAvailability();
  } catch (error) {
    setFeedback(availabilityFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    availabilitySubmitEl.disabled = false;
  }
}

async function handleEquivalencesSubmit(event) {
  event.preventDefault();
  equivalencesSubmitEl.disabled = true;
  try {
    await loadEquivalences();
  } catch (error) {
    setFeedback(equivalencesFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    equivalencesSubmitEl.disabled = false;
  }
}

async function handleAssemblySubmit(event) {
  event.preventDefault();
  if (!state.visibleModules.some((module) => module.panelId === "assemblyPanel")) return;

  const payload = {
    warehouseCode: String(document.querySelector("#assemblyWarehouse").value || "").trim(),
    sku: String(document.querySelector("#assemblySku").value || "").trim(),
    quantity: Number(document.querySelector("#assemblyQty").value || 1),
    notes: String(document.querySelector("#assemblyNotes").value || "").trim(),
  };

  if (!payload.warehouseCode) {
    setFeedback(assemblyFeedbackEl, "El almacen es obligatorio.", "error");
    return;
  }

  setFeedback(assemblyFeedbackEl, "Creando solicitud...", "muted");
  assemblySubmitEl.disabled = true;

  try {
    const result = await createAssemblyRequest(state.session.token, payload);
    if (!result.ok) {
      const details = result.payload?.details || result.payload?.error || "Error de negocio";
      setFeedback(assemblyFeedbackEl, `No fue posible crear la solicitud (${details}).`, "error");
      return;
    }

    assemblyFormEl.reset();
    document.querySelector("#assemblyWarehouse").value = "WH-MAIN";
    document.querySelector("#assemblyQty").value = "1";
    setFeedback(assemblyFeedbackEl, `Solicitud creada: ${result.payload?.requestId || "sin-id"}.`, "ok");
  } catch (error) {
    setFeedback(assemblyFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    assemblySubmitEl.disabled = false;
  }
}

async function handleAssemblyStatusSubmit(event) {
  event.preventDefault();
  if (!state.visibleModules.some((module) => module.panelId === "assemblyPanel")) return;

  const requestId = String(document.querySelector("#assemblyStatusRequestId").value || "").trim();
  if (!requestId) {
    setFeedback(assemblyStatusFeedbackEl, "Captura un requestId para consultar el estatus.", "error");
    assemblyStatusResultEl.innerHTML = "";
    return;
  }

  setFeedback(assemblyStatusFeedbackEl, "Consultando estatus...", "muted");
  assemblyStatusSubmitEl.disabled = true;

  try {
    const result = await fetchAssemblyRequest(state.session.token, requestId);
    if (!result.ok) {
      const details = result.payload?.details || result.payload?.error || `HTTP ${result.status}`;
      setFeedback(assemblyStatusFeedbackEl, `No fue posible consultar la solicitud (${details}).`, "error");
      assemblyStatusResultEl.innerHTML = "";
      return;
    }

    setFeedback(assemblyStatusFeedbackEl, `Solicitud ${result.payload?.requestId || requestId} localizada.`, "ok");
    renderAssemblyStatusResult(result.payload);
  } catch (error) {
    setFeedback(assemblyStatusFeedbackEl, `Error de red: ${String(error)}`, "error");
    assemblyStatusResultEl.innerHTML = "";
  } finally {
    assemblyStatusSubmitEl.disabled = false;
  }
}

async function handleDraftSubmit(event) {
  event.preventDefault();
  if (!state.visibleModules.some((module) => module.panelId === "draftsPanel")) return;

  const payload = {
    name: String(document.querySelector("#draftName").value || "").trim(),
    draftType: String(document.querySelector("#draftType").value || "").trim(),
    brand: String(document.querySelector("#draftBrand").value || "").trim(),
    description: String(document.querySelector("#draftDescription").value || "").trim(),
  };

  if (!payload.name || !payload.draftType) {
    setFeedback(draftFeedbackEl, "Nombre y tipo de borrador son obligatorios.", "error");
    return;
  }

  setFeedback(draftFeedbackEl, "Creando borrador...", "muted");
  draftSubmitEl.disabled = true;

  try {
    const result = await createProductDraft(state.session.token, payload);
    if (!result.ok) {
      const details = result.payload?.details || result.payload?.error || "Error de negocio";
      setFeedback(draftFeedbackEl, `No fue posible crear el borrador (${details}).`, "error");
      return;
    }

    draftFormEl.reset();
    setFeedback(draftFeedbackEl, `Borrador creado: ${result.payload?.draftId || "sin-id"}.`, "ok");
  } catch (error) {
    setFeedback(draftFeedbackEl, `Error de red: ${String(error)}`, "error");
  } finally {
    draftSubmitEl.disabled = false;
  }
}

async function bootstrap() {
  environmentBadgeEl.textContent = String(runtimeConfig.environment || "dev").toUpperCase();
  try {
    const session = await restoreSession();
    clearLoginError();
    setView(Boolean(session));
    if (session) {
      setPanel("homePanel");
      await loadDashboard(session);
    }
  } catch (error) {
    console.error("bootstrap failed", error);
    showLoginError(error);
  }
}

loginBtn.addEventListener("click", async () => {
  try {
    clearLoginError();
    await startLogin();
    await bootstrap();
  } catch (error) {
    console.error("login failed", error);
    showLoginError(error);
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
  setView(false);
  userEmailChipEl.textContent = "email: -";
  userRoleChipEl.textContent = "perfil: -";
});

catalogFormEl.addEventListener("submit", handleCatalogSubmit);
inventoryFormEl.addEventListener("submit", handleInventorySubmit);
salesFiltersFormEl.addEventListener("submit", handleSalesRefreshSubmit);
salesCreateFormEl.addEventListener("submit", handleSalesCreateSubmit);
salesDetailFormEl.addEventListener("submit", handleSalesDetailSubmit);
availabilityFormEl.addEventListener("submit", handleAvailabilitySubmit);
equivalencesFormEl.addEventListener("submit", handleEquivalencesSubmit);
assemblyFormEl.addEventListener("submit", handleAssemblySubmit);
assemblyStatusFormEl.addEventListener("submit", handleAssemblyStatusSubmit);
draftFormEl.addEventListener("submit", handleDraftSubmit);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("service worker register failed", error);
  });
}

bootstrap();
