import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getSessionContext } from "@/lib/auth/session-context";
import { InventoryServiceError } from "@/lib/inventory-service";
import { ASSEMBLY_PAIR_RULE_TYPE, PRODUCT_SUBSTITUTION_RULE_TYPE } from "@/lib/catalog/compatibility";
import {
  approveCompatibilityRule,
  createCompatibilityRuleDraft,
  createProductEquivalence,
  reviewCompatibilityRule,
  reviseCompatibilityRuleDraft,
  retireCompatibilityRule,
  setProductEquivalenceActive,
  type CatalogMutationActor,
} from "@/lib/catalog/compatibility-admin";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(formData: FormData, key: string) {
  const raw = field(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`El campo ${key} debe ser numérico`);
  return value;
}

function optionalDate(formData: FormData, key: string) {
  const raw = field(formData, key);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`La fecha ${key} no es válida`);
  return date;
}

function revision(formData: FormData) {
  const value = Number(field(formData, "revision"));
  if (!Number.isInteger(value) || value < 1) throw new Error("La versión de regla no es válida");
  return value;
}

function rulePurpose(formData: FormData) {
  const value = field(formData, "ruleType");
  if (value !== PRODUCT_SUBSTITUTION_RULE_TYPE && value !== ASSEMBLY_PAIR_RULE_TYPE) {
    throw new InventoryServiceError("INVALID_RULE_PURPOSE", "Selecciona si la evidencia aprueba una sustitución de producto o un par técnico de ensamble");
  }
  return value;
}

async function actorFromSession(): Promise<CatalogMutationActor> {
  const session = await requirePermission("catalog.edit");
  const user = session.user;
  if (!user?.id) throw new Error("La sesión no identifica al usuario");
  return { actorUserId: user.id, actor: user.name ?? user.email ?? user.id };
}

async function finishAction(error?: unknown): Promise<never> {
  const message = error instanceof InventoryServiceError ? error.message : "No se pudo guardar el cambio. Revisa los datos y vuelve a intentar.";
  redirect(`/catalog/compatibility?error=${encodeURIComponent(message)}`);
}

async function createRuleAction(formData: FormData) {
  "use server";
  try {
    const actor = await actorFromSession();
    await createCompatibilityRuleDraft(prisma, {
      productId: field(formData, "productId"),
      compatibleProductId: field(formData, "compatibleProductId"),
      ruleType: rulePurpose(formData),
      description: field(formData, "description"),
      decision: field(formData, "decision") === "BLOCKED" ? "BLOCKED" : "REQUIRES_REVIEW",
      sourceId: field(formData, "sourceId"),
      validFrom: optionalDate(formData, "validFrom"),
      validTo: optionalDate(formData, "validTo"),
      maxWorkingPressureBar: optionalNumber(formData, "maxWorkingPressureBar"),
      minTemperatureC: optionalNumber(formData, "minTemperatureC"),
      maxTemperatureC: optionalNumber(formData, "maxTemperatureC"),
      medium: field(formData, "medium") || null,
      application: field(formData, "application") || null,
      assemblyMethod: field(formData, "assemblyMethod") || null,
    }, actor);
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=rule-draft");
}

async function reviewRuleAction(formData: FormData) {
  "use server";
  try {
    await reviewCompatibilityRule(prisma, { ruleId: field(formData, "ruleId"), expectedRevision: revision(formData), reviewer: await actorFromSession() });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=reviewed");
}

async function approveRuleAction(formData: FormData) {
  "use server";
  try {
    const selectedDecision = field(formData, "decision");
    if (!["APPROVED", "BLOCKED", "REQUIRES_REVIEW"].includes(selectedDecision)) throw new Error("Selecciona una decisión válida");
    await approveCompatibilityRule(prisma, {
      ruleId: field(formData, "ruleId"), expectedRevision: revision(formData),
      decision: selectedDecision as "APPROVED" | "BLOCKED" | "REQUIRES_REVIEW",
      approver: await actorFromSession(),
    });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=approved");
}

async function reviseRuleAction(formData: FormData) {
  "use server";
  try {
    await reviseCompatibilityRuleDraft(prisma, {
      ruleId: field(formData, "ruleId"),
      expectedRevision: revision(formData),
      actor: await actorFromSession(),
      input: {
        productId: field(formData, "productId"),
        compatibleProductId: field(formData, "compatibleProductId"),
        ruleType: rulePurpose(formData),
        description: field(formData, "description"),
        decision: field(formData, "decision") === "BLOCKED" ? "BLOCKED" : "REQUIRES_REVIEW",
        sourceId: field(formData, "sourceId"),
        validFrom: optionalDate(formData, "validFrom"),
        validTo: optionalDate(formData, "validTo"),
        maxWorkingPressureBar: optionalNumber(formData, "maxWorkingPressureBar"),
        minTemperatureC: optionalNumber(formData, "minTemperatureC"),
        maxTemperatureC: optionalNumber(formData, "maxTemperatureC"),
        medium: field(formData, "medium") || null,
        application: field(formData, "application") || null,
        assemblyMethod: field(formData, "assemblyMethod") || null,
      },
    });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=revised");
}

async function retireRuleAction(formData: FormData) {
  "use server";
  try {
    await retireCompatibilityRule(prisma, {
      ruleId: field(formData, "ruleId"), expectedRevision: revision(formData),
      reason: field(formData, "reason"), actor: await actorFromSession(),
    });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=retired");
}

async function createEquivalenceAction(formData: FormData) {
  "use server";
  try {
    await createProductEquivalence(prisma, {
      productId: field(formData, "productId"),
      equivProductId: field(formData, "equivProductId"),
      basisNorm: field(formData, "basisNorm") || null,
      basisDash: optionalNumber(formData, "basisDash"),
      sourceSheet: field(formData, "sourceSheet") || null,
      notes: field(formData, "notes") || null,
      actor: await actorFromSession(),
    });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=equivalence-created");
}

async function toggleEquivalenceAction(formData: FormData) {
  "use server";
  try {
    await setProductEquivalenceActive(prisma, {
      equivalenceId: field(formData, "equivalenceId"),
      active: field(formData, "active") === "true",
      reason: field(formData, "reason"),
      actor: await actorFromSession(),
    });
  } catch (error) { await finishAction(error); }
  redirect("/catalog/compatibility?success=equivalence-updated");
}

function ProductSelect({ name, label, products, defaultValue }: {
  name: string; label: string; products: Array<{ id: string; sku: string; name: string; brand: string | null; type: string }>; defaultValue?: string;
}) {
  return <label className="space-y-1"><span className="op-label">{label}</span><select name={name} required defaultValue={defaultValue ?? ""} className="op-field w-full px-3 py-2">
    <option value="" disabled>Selecciona producto</option>
    {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name} {product.brand ? `· ${product.brand}` : ""} ({product.type})</option>)}
  </select></label>;
}

function RuleInputFields({ products, sources, defaults }: {
  products: Array<{ id: string; sku: string; name: string; brand: string | null; type: string }>;
  sources: Array<{ id: string; supplierName: string; documentRef: string; documentVersion: string | null }>;
  defaults?: { productId: string; compatibleProductId: string; ruleType: string; description: string; sourceId: string; decision: string; validFrom: string; validTo: string; pressure: string; minTemp: string; maxTemp: string; medium: string; application: string; method: string };
}) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <ProductSelect name="productId" label="Producto de origen" products={products} defaultValue={defaults?.productId} />
      <ProductSelect name="compatibleProductId" label="Producto compatible exacto" products={products} defaultValue={defaults?.compatibleProductId} />
      <label className="space-y-1"><span className="op-label">Propósito técnico</span><select name="ruleType" required defaultValue={defaults?.ruleType === PRODUCT_SUBSTITUTION_RULE_TYPE || defaults?.ruleType === ASSEMBLY_PAIR_RULE_TYPE ? defaults.ruleType : ""} className="op-field w-full px-3 py-2"><option value="" disabled>Selecciona el uso que respalda la fuente</option><option value={PRODUCT_SUBSTITUTION_RULE_TYPE}>Sustitución de producto (misma familia)</option><option value={ASSEMBLY_PAIR_RULE_TYPE}>Par técnico de ensamble (no sustituye producto)</option></select><span className="op-helper">Una regla de ensamble nunca autoriza sustituir un SKU por otro.</span></label>
      <label className="space-y-1"><span className="op-label">Decisión inicial</span><select name="decision" defaultValue={defaults?.decision ?? "REQUIRES_REVIEW"} className="op-field w-full px-3 py-2"><option value="REQUIRES_REVIEW">Requiere revisión</option><option value="BLOCKED">Bloqueada</option></select></label>
      <label className="space-y-1 sm:col-span-2"><span className="op-label">Explicación técnica y combinación/familia exacta</span><textarea name="description" required minLength={12} maxLength={2000} defaultValue={defaults?.description} className="op-field min-h-20 w-full px-3 py-2" /></label>
      <label className="space-y-1 sm:col-span-2"><span className="op-label">Fuente aprobada · fabricante / documento / versión</span><select name="sourceId" required defaultValue={defaults?.sourceId ?? ""} className="op-field w-full px-3 py-2"><option value="" disabled>Selecciona evidencia aprobada</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.supplierName} · {source.documentRef} · {source.documentVersion}</option>)}</select></label>
      <label className="space-y-1"><span className="op-label">Presión máxima (bar)</span><input name="maxWorkingPressureBar" type="number" min="0.001" step="0.001" defaultValue={defaults?.pressure} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Temperatura mínima (°C)</span><input name="minTemperatureC" type="number" step="0.01" defaultValue={defaults?.minTemp} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Temperatura máxima (°C)</span><input name="maxTemperatureC" type="number" step="0.01" defaultValue={defaults?.maxTemp} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Vigente desde</span><input name="validFrom" type="date" defaultValue={defaults?.validFrom} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Vigente hasta</span><input name="validTo" type="date" defaultValue={defaults?.validTo} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Medio</span><input name="medium" maxLength={160} defaultValue={defaults?.medium} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1"><span className="op-label">Aplicación</span><input name="application" maxLength={160} defaultValue={defaults?.application} className="op-field w-full px-3 py-2" /></label>
      <label className="space-y-1 sm:col-span-2"><span className="op-label">Método de ensamble</span><input name="assemblyMethod" maxLength={160} defaultValue={defaults?.method} className="op-field w-full px-3 py-2" /></label>
    </div>
  </>;
}

export default async function CompatibilityAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; q?: string | string[] }> }) {
  const [session, sessionCtx, params] = await Promise.all([
    requirePermission("catalog.edit"), getSessionContext(), searchParams,
  ]);
  const isAdmin = sessionCtx.roles.includes("SYSTEM_ADMIN");
  const actorId = session.user?.id;
  if (!actorId) redirect("/login");
  const qParam = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = (qParam ?? "").trim().slice(0, 80);
  const isSearch = q.length >= 2;
  const textMatch = { contains: q, mode: "insensitive" as const };
  const productSearchWhere = isSearch ? { OR: [
    { sku: textMatch }, { referenceCode: textMatch }, { name: textMatch }, { brand: textMatch },
  ] } : {};
  const sourceBaseWhere = { status: "APPROVED" as const, reviewedAt: { not: null }, reviewedByUserId: { not: null }, documentVersion: { not: null } };
  const sourceSearchWhere = isSearch ? { OR: [
    { supplierName: textMatch }, { documentRef: textMatch }, { documentVersion: textMatch },
  ] } : {};
  const ruleSearchWhere = isSearch ? { OR: [
    { ruleType: textMatch }, { description: textMatch },
    { product: { OR: [{ sku: textMatch }, { name: textMatch }, { brand: textMatch }] } },
    { compatibleProduct: { OR: [{ sku: textMatch }, { name: textMatch }, { brand: textMatch }] } },
    { source: { supplierName: textMatch } }, { source: { documentRef: textMatch } },
  ] } : {};
  const equivalenceSearchWhere = isSearch ? { OR: [
    { basisNorm: textMatch }, { sourceSheet: textMatch }, { notes: textMatch },
    { product: { OR: [{ sku: textMatch }, { name: textMatch }, { brand: textMatch }] } },
    { equivProduct: { OR: [{ sku: textMatch }, { name: textMatch }, { brand: textMatch }] } },
  ] } : {};
  const [rules, ruleCount, equivalences, equivalenceCount, productCount, sourceCount] = await Promise.all([
    prisma.productCompatibilityRule.findMany({ where: ruleSearchWhere, orderBy: [{ updatedAt: "desc" }], take: 200,
      select: {
        id: true, productId: true, compatibleProductId: true, sourceId: true, ruleType: true, description: true,
        decision: true, governanceStatus: true, ruleRevision: true, active: true,
        validFrom: true, validTo: true, maxWorkingPressureBar: true, minTemperatureC: true, maxTemperatureC: true,
        medium: true, application: true, assemblyMethod: true,
        product: { select: { sku: true, name: true, brand: true } },
        compatibleProduct: { select: { sku: true, name: true, brand: true } },
        source: { select: { supplierName: true, documentRef: true, documentVersion: true, status: true } },
      },
    }),
    prisma.productCompatibilityRule.count({ where: ruleSearchWhere }),
    prisma.productEquivalence.findMany({ where: equivalenceSearchWhere, orderBy: [{ updatedAt: "desc" }], take: 200,
      select: {
        id: true, productId: true, equivProductId: true, active: true, basisNorm: true, basisDash: true, sourceSheet: true, notes: true,
        product: { select: { sku: true, name: true, brand: true } },
        equivProduct: { select: { sku: true, name: true, brand: true } },
      },
    }),
    prisma.productEquivalence.count({ where: equivalenceSearchWhere }),
    prisma.product.count({ where: productSearchWhere }),
    prisma.productTechnicalSource.count({ where: { AND: [sourceBaseWhere, sourceSearchWhere] } }),
  ]);
  const relatedProductIds = Array.from(new Set([
    ...rules.flatMap((rule) => [rule.productId, rule.compatibleProductId]),
    ...equivalences.flatMap((equivalence) => [equivalence.productId, equivalence.equivProductId]),
  ]));
  const relatedSourceIds = Array.from(new Set(rules.flatMap((rule) => rule.sourceId ? [rule.sourceId] : [])));
  const [searchedProducts, relatedProducts, searchedSources, relatedSources] = await Promise.all([
    prisma.product.findMany({ where: productSearchWhere, orderBy: { sku: "asc" }, take: 400, select: { id: true, sku: true, name: true, brand: true, type: true } }),
    relatedProductIds.length ? prisma.product.findMany({ where: { id: { in: relatedProductIds } }, orderBy: { sku: "asc" }, select: { id: true, sku: true, name: true, brand: true, type: true } }) : Promise.resolve([]),
    prisma.productTechnicalSource.findMany({ where: { AND: [sourceBaseWhere, sourceSearchWhere] }, orderBy: [{ supplierName: "asc" }, { documentRef: "asc" }], take: 200, select: { id: true, supplierName: true, documentRef: true, documentVersion: true } }),
    relatedSourceIds.length ? prisma.productTechnicalSource.findMany({ where: { id: { in: relatedSourceIds }, ...sourceBaseWhere }, select: { id: true, supplierName: true, documentRef: true, documentVersion: true } }) : Promise.resolve([]),
  ]);
  const products = Array.from(new Map([...searchedProducts, ...relatedProducts].map((item) => [item.id, item])).values());
  const sources = Array.from(new Map([...searchedSources, ...relatedSources].map((item) => [item.id, item])).values());
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const success = Array.isArray(params.success) ? params.success[0] : params.success;
  return <div className="space-y-5">
    <PageHeader title="Gobierno de compatibilidad" description="Administra pares técnicos exactos respaldados por documentos aprobados y equivalencias comerciales auditables." actions={<Link href="/catalog" className={buttonStyles({ variant: "secondary" })}>Volver al catálogo</Link>} />
    {error ? <div role="alert" className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-text)]">{error}</div> : null}
    {success ? <div role="status" className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-text)]">Cambio guardado. La nueva decisión ya puede ser consultada.</div> : null}
    <SectionCard title="Buscar catálogo y reglas" description="Busca productos por SKU, código, nombre o marca; fuentes por fabricante, documento o versión; y reglas/equivalencias por sus datos visibles.">
      <form method="get" action="/catalog/compatibility" className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 space-y-1"><span className="op-label">Búsqueda</span><input name="q" defaultValue={q} maxLength={80} className="op-field w-full px-3 py-2" placeholder="SKU, fabricante o documento" /></label>
        <div className="flex items-end gap-2"><button className={buttonStyles({ size: "sm" })}>Buscar</button>{q ? <Link href="/catalog/compatibility" className={buttonStyles({ variant: "secondary", size: "sm" })}>Limpiar</Link> : null}</div>
      </form>
      {q.length === 1 ? <p className="mt-2 text-sm text-[var(--status-warning-text)]">Ingresa al menos 2 caracteres; mientras tanto se muestra el primer bloque.</p> : null}
      <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">{isSearch ? `“${q}”: ${productCount} productos, ${sourceCount} fuentes aprobadas, ${ruleCount} reglas y ${equivalenceCount} equivalencias coinciden.` : `Catálogo completo: ${productCount} productos; ${sourceCount} fuentes aprobadas; ${ruleCount} reglas; ${equivalenceCount} equivalencias.`} Selectores: máximo 400 productos y 200 fuentes en los resultados de búsqueda. Las reglas y equivalencias muestran hasta 200 coincidencias; usa una búsqueda más precisa para localizar registros fuera del bloque visible.</p>
    </SectionCard>
    <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-text)]">
      Una equivalencia comercial nunca autoriza compatibilidad por sí sola. Sólo los pares exactos con regla aprobada, fuente vigente y límites dentro de contexto pueden habilitar una recomendación compatible.
    </div>

    <SectionCard title="Nueva regla técnica" description="La creación queda en borrador. Manager revisa; System Admin aprueba y publica. No se permite aprobar por similitud de marca, rosca o medida.">
      <form action={createRuleAction} className="space-y-4">
        <RuleInputFields products={products} sources={sources} />
        <button className={buttonStyles()}>Guardar borrador de regla</button>
      </form>
    </SectionCard>

    <SectionCard title="Reglas y revisiones" description={`Cada revisión incrementa versión; aprobar o retirar exige coincidencia de la revisión visible. Mostrando ${rules.length} de ${ruleCount}.`}>
      {rules.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Todavía no hay reglas técnicas registradas.</p> : <div className="space-y-3">
        {rules.map((rule) => <article key={rule.id} className="op-surface-muted space-y-3 rounded-xl border border-[var(--border-default)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={rule.governanceStatus === "APPROVED" ? "success" : rule.governanceStatus === "RETIRED" ? "danger" : "warning"}>{rule.governanceStatus} · v{rule.ruleRevision}</Badge>
            <Badge variant={rule.decision === "BLOCKED" ? "danger" : "neutral"}>{rule.decision}</Badge>
            {!rule.active ? <Badge variant="danger">INACTIVA</Badge> : null}
          </div>
          <h3 className="font-semibold">{rule.product.sku} ({rule.product.brand ?? "sin marca"}) ↔ {rule.compatibleProduct.sku} ({rule.compatibleProduct.brand ?? "sin marca"}) · {rule.ruleType}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{rule.description}</p>
          <p className="text-xs text-[var(--text-muted)]">Fuente: {rule.source?.supplierName ?? "sin fuente"} · {rule.source?.documentRef ?? "sin documento"} · {rule.source?.documentVersion ?? "sin versión"} · estado {rule.source?.status ?? "sin fuente"}</p>
          <p className="text-xs text-[var(--text-muted)]">{rule.maxWorkingPressureBar ? `≤ ${rule.maxWorkingPressureBar.toString()} bar` : "Sin límite de presión"} · {rule.minTemperatureC?.toString() ?? "—"} a {rule.maxTemperatureC?.toString() ?? "—"} °C · {rule.medium ?? "cualquier medio"} · {rule.application ?? "cualquier aplicación"} · {rule.assemblyMethod ?? "método libre"}</p>
          <div className="flex flex-wrap gap-2">
            {rule.governanceStatus === "DRAFT" && rule.active ? <form action={reviewRuleAction}><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="revision" value={rule.ruleRevision} /><button className={buttonStyles({ variant: "secondary", size: "sm" })}>Revisar (Manager)</button></form> : null}
            {rule.governanceStatus === "REVIEWED" && rule.active && isAdmin ? <form action={approveRuleAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="revision" value={rule.ruleRevision} /><label className="sr-only" htmlFor={`decision-${rule.id}`}>Decisión técnica para publicar</label><select id={`decision-${rule.id}`} name="decision" defaultValue="REQUIRES_REVIEW" className="op-field px-2 py-1 text-xs"><option value="APPROVED">Compatible para uso</option><option value="REQUIRES_REVIEW">Requiere revisión por operación</option><option value="BLOCKED">Bloqueada</option></select><button className={buttonStyles({ size: "sm" })}>Publicar decisión (Admin)</button></form> : null}
            {rule.active && isAdmin ? <form action={retireRuleAction} className="flex flex-wrap gap-2"><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="revision" value={rule.ruleRevision} /><input name="reason" required minLength={10} aria-label="Motivo para retirar" placeholder="Motivo para retirar" className="op-field min-w-48 px-2 py-1 text-xs" /><button className={buttonStyles({ variant: "danger", size: "sm" })}>Retirar</button></form> : null}
          </div>
          {rule.active && (rule.governanceStatus === "APPROVED" || rule.governanceStatus === "REVIEWED") ? <details className="border-t border-[var(--border-default)] pt-3"><summary className="cursor-pointer text-sm font-medium">Preparar nueva revisión</summary><form action={reviseRuleAction} className="mt-3 space-y-3"><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="revision" value={rule.ruleRevision} /><RuleInputFields products={products} sources={sources} defaults={{ productId: rule.productId, compatibleProductId: rule.compatibleProductId, ruleType: rule.ruleType, description: rule.description, sourceId: rule.sourceId ?? "", decision: rule.decision === "BLOCKED" ? "BLOCKED" : "REQUIRES_REVIEW", validFrom: rule.validFrom?.toISOString().slice(0, 10) ?? "", validTo: rule.validTo?.toISOString().slice(0, 10) ?? "", pressure: rule.maxWorkingPressureBar?.toString() ?? "", minTemp: rule.minTemperatureC?.toString() ?? "", maxTemp: rule.maxTemperatureC?.toString() ?? "", medium: rule.medium ?? "", application: rule.application ?? "", method: rule.assemblyMethod ?? "" }} /><button className={buttonStyles({ variant: "secondary" })}>Guardar como nueva revisión</button></form></details> : null}
        </article>)}
      </div>}
    </SectionCard>

    <SectionCard title="Registrar equivalencia comercial" description="Registra base normativa/dash y documento comercial; esta relación nunca crea ni aprueba una regla técnica.">
      <form action={createEquivalenceAction} className="grid gap-3 sm:grid-cols-2">
        <ProductSelect name="productId" label="Producto original" products={products} />
        <ProductSelect name="equivProductId" label="Producto equivalente" products={products} />
        <label className="space-y-1"><span className="op-label">Norma / base comercial</span><input name="basisNorm" maxLength={160} className="op-field w-full px-3 py-2" /></label>
        <label className="space-y-1"><span className="op-label">Dash</span><input name="basisDash" type="number" min="0" max="999" step="1" className="op-field w-full px-3 py-2" /></label>
        <label className="space-y-1"><span className="op-label">Hoja / página / referencia</span><input name="sourceSheet" maxLength={200} className="op-field w-full px-3 py-2" /></label>
        <label className="space-y-1"><span className="op-label">Notas</span><input name="notes" maxLength={1000} className="op-field w-full px-3 py-2" /></label>
        <div className="sm:col-span-2"><button className={buttonStyles()}>Guardar equivalencia comercial</button></div>
      </form>
    </SectionCard>

    <SectionCard title="Equivalencias registradas" description={`Manager y Admin pueden desactivar relaciones comerciales; cada cambio deja auditoría. Mostrando ${equivalences.length} de ${equivalenceCount}.`}>
      {equivalences.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No hay equivalencias registradas.</p> : <div className="space-y-3">
        {equivalences.map((equivalence) => <article key={equivalence.id} className="op-surface-muted flex flex-col gap-3 rounded-xl border border-[var(--border-default)] p-4 md:flex-row md:items-center md:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><Badge variant={equivalence.active ? "success" : "neutral"}>{equivalence.active ? "ACTIVA" : "INACTIVA"}</Badge><span className="font-medium">{equivalence.product.sku} ↔ {equivalence.equivProduct.sku}</span></div><p className="mt-1 text-sm text-[var(--text-secondary)]">{equivalence.basisNorm ?? "Sin norma"} · {equivalence.basisDash == null ? "Sin dash" : `Dash ${equivalence.basisDash}`} · {equivalence.sourceSheet ?? "Sin hoja documental"}</p><p className="text-xs text-[var(--text-muted)]">La compatibilidad técnica requiere una regla KAN-19 aprobada vigente.</p></div>
          <form action={toggleEquivalenceAction} className="flex flex-wrap gap-2"><input type="hidden" name="equivalenceId" value={equivalence.id} /><input type="hidden" name="active" value={String(!equivalence.active)} />{equivalence.active ? <input name="reason" required minLength={10} aria-label="Motivo para desactivar" placeholder="Motivo para desactivar" className="op-field min-w-48 px-2 py-1 text-xs" /> : null}<button className={buttonStyles({ variant: equivalence.active ? "danger" : "secondary", size: "sm" })}>{equivalence.active ? "Desactivar" : "Reactivar"}</button></form>
        </article>)}
      </div>}
    </SectionCard>
  </div>;
}
