import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLogRequiredWithDb } from "@/lib/audit-log";
import { promoteProductTechnicalSource } from "@/lib/catalog/technical-specs";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export const dynamic = "force-dynamic";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function actionError(error: unknown) {
  const knownMessages = new Set([
    "La fuente ya cambió o dejó de estar pendiente; actualiza la pantalla antes de corregirla",
    "La fuente fue modificada por otra persona; actualiza la pantalla",
    "No tienes permiso para corregir versiones de fuentes técnicas",
    "Sólo un usuario activo de catálogo puede aprobar fuentes técnicas",
    "La fuente requiere fabricante, documento y versión vigente antes de aprobarse",
    "La fuente no tiene especificaciones ni activos pendientes",
    "La fuente técnica está obsoleta frente a una aprobación más reciente",
    "La fuente técnica ya fue procesada o no está pendiente",
    "Fuente técnica no encontrada",
    "Sólo una fuente pendiente puede aprobarse",
    "La fuente cambió desde que la revisaste; actualiza la pantalla y revisa de nuevo",
  ]);
  const message = error instanceof Error && knownMessages.has(error.message)
    ? error.message
    : "No se pudo guardar el cambio. Actualiza la pantalla y vuelve a intentar.";
  redirect(`/catalog/technical-sources?error=${encodeURIComponent(message)}`);
}

async function updateSourceVersionAction(formData: FormData) {
  "use server";
  const session = await requirePermission("catalog.edit");
  const actorUserId = session.user?.id;
  if (!actorUserId) redirect("/login");
  const sourceId = field(formData, "sourceId");
  const version = field(formData, "documentVersion");
  const reason = field(formData, "reason");
  const expectedUpdatedAt = new Date(field(formData, "expectedUpdatedAt"));
  if (!sourceId || !version || version.length > 120 || reason.length < 10 || reason.length > 500 || !Number.isFinite(expectedUpdatedAt.getTime())) {
    redirect(`/catalog/technical-sources?error=${encodeURIComponent("Captura versión documental, motivo y revisión vigente")}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          userRoles: { where: { role: { isActive: true } }, select: { role: { select: { code: true } } } },
        },
      });
      const actorIsCatalogReviewer = actor?.userRoles.some(({ role }) => role.code === "MANAGER" || role.code === "SYSTEM_ADMIN") ?? false;
      if (!actor?.isActive || !actorIsCatalogReviewer) throw new Error("No tienes permiso para corregir versiones de fuentes técnicas");
      const before = await tx.productTechnicalSource.findUnique({
        where: { id: sourceId },
        select: { id: true, supplierName: true, documentRef: true, documentVersion: true, status: true, updatedAt: true },
      });
      if (!before || before.status !== "PENDING_REVIEW" || before.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new Error("La fuente ya cambió o dejó de estar pendiente; actualiza la pantalla antes de corregirla");
      }
      const claim = await tx.productTechnicalSource.updateMany({
        where: { id: sourceId, status: "PENDING_REVIEW", updatedAt: expectedUpdatedAt },
        data: { documentVersion: version },
      });
      if (claim.count !== 1) throw new Error("La fuente fue modificada por otra persona; actualiza la pantalla");
      const after = await tx.productTechnicalSource.findUniqueOrThrow({
        where: { id: sourceId },
        select: { id: true, supplierName: true, documentRef: true, documentVersion: true, status: true, updatedAt: true },
      });
      await createAuditLogRequiredWithDb({
        entityType: "PRODUCT_TECHNICAL_SOURCE",
        entityId: sourceId,
        action: "UPDATE_DOCUMENT_VERSION",
        actor: actor.name || actor.email || actor.id,
        actorUserId,
        source: "catalog/technical-sources",
        before,
        after: { ...after, correctionReason: reason },
      }, tx);
    });
  } catch (error) {
    await actionError(error);
  }

  revalidatePath("/catalog/technical-sources");
  revalidatePath("/catalog/compatibility");
  redirect("/catalog/technical-sources?success=version-updated");
}

async function approveSourceAction(formData: FormData) {
  "use server";
  const session = await requirePermission("catalog.edit");
  const reviewerUserId = session.user?.id;
  if (!reviewerUserId) redirect("/login");
  if (field(formData, "confirmReviewed") !== "yes") {
    redirect(`/catalog/technical-sources?error=${encodeURIComponent("Confirma que revisaste la fuente, su versión y el material asociado")}`);
  }
  const expectedUpdatedAt = new Date(field(formData, "expectedUpdatedAt"));
  if (!Number.isFinite(expectedUpdatedAt.getTime())) {
    redirect(`/catalog/technical-sources?error=${encodeURIComponent("La revisión venció; actualiza la pantalla y revisa la fuente de nuevo")}`);
  }

  try {
    await promoteProductTechnicalSource(prisma, {
      sourceId: field(formData, "sourceId"),
      reviewerUserId,
      expectedUpdatedAt,
    });
  } catch (error) {
    await actionError(error);
  }

  revalidatePath("/catalog/technical-sources");
  revalidatePath("/catalog/compatibility");
  revalidatePath("/catalog");
  redirect("/catalog/technical-sources?success=source-approved");
}

export default async function TechnicalSourcesPage({ searchParams }: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requirePermission("catalog.edit");
  const [sources, params] = await Promise.all([
    prisma.productTechnicalSource.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: [{ createdAt: "asc" }],
      take: 100,
      select: {
        id: true,
        supplierName: true,
        documentRef: true,
        documentVersion: true,
        sourceUrl: true,
        createdAt: true,
        updatedAt: true,
        specCandidates: {
          orderBy: [{ productId: "asc" }, { key: "asc" }],
          select: {
            productId: true,
            family: true,
            key: true,
            value: true,
            unit: true,
            product: { select: { sku: true, name: true, type: true, brand: true } },
          },
        },
        assets: {
          where: { validationStatus: "PENDING" },
          select: {
            productId: true,
            kind: true,
            url: true,
            product: { select: { sku: true, name: true, type: true, brand: true } },
          },
        },
      },
    }),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Revisión de fuentes técnicas"
        description="Verifica fabricante, documento, versión y material asociado antes de publicar especificaciones o activos. Aprobar aquí publica los datos pendientes vinculados a la fuente."
        actions={<Link href="/catalog" className={buttonStyles({ variant: "secondary" })}>Volver al catálogo</Link>}
      />
      {params.error ? <p role="alert" className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-text)]">{params.error}</p> : null}
      {params.success === "version-updated" ? <p role="status" className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-text)]">Versión guardada. La fuente continúa pendiente de revisión.</p> : null}
      {params.success === "source-approved" ? <p role="status" className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-text)]">Fuente aprobada y datos pendientes publicados.</p> : null}

      {sources.length === 0 ? (
        <SectionCard title="Sin fuentes pendientes">
          <p className="text-sm text-[var(--text-muted)]">No hay fuentes técnicas pendientes de revisión.</p>
        </SectionCard>
      ) : sources.map((source) => {
        const products = new Map<string, { sku: string; name: string; type: string; brand: string | null }>();
        for (const candidate of source.specCandidates) products.set(candidate.productId, candidate.product);
        for (const asset of source.assets) products.set(asset.productId, asset.product);
        const hasPendingPayload = source.specCandidates.length > 0 || source.assets.length > 0;
        return (
          <SectionCard key={source.id} title={`${source.supplierName} · ${source.documentRef}`} description={`Registrada ${source.createdAt.toLocaleString("es-MX")} · estado PENDING_REVIEW`}>
            <div className="space-y-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-[var(--text-muted)]">Fabricante</dt><dd>{source.supplierName}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Documento</dt><dd>{source.documentRef}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Versión</dt><dd>{source.documentVersion || "Falta versión documental"}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Referencia capturada</dt><dd className="break-all">{source.sourceUrl || "Sin URL; valida el identificador documental"}</dd></div>
              </dl>

              {products.size ? <div className="space-y-2">
                <h2 className="text-sm font-semibold">Productos incluidos</h2>
                <ul className="list-inside list-disc text-sm text-[var(--text-secondary)]">{Array.from(products.values()).map((product) => <li key={product.sku}>{product.sku} · {product.name} · {product.brand || "sin marca"} ({product.type})</li>)}</ul>
              </div> : <p className="text-sm text-[var(--status-warning-text)]">No hay candidatos técnicos ni activos pendientes asociados; no se podrá aprobar.</p>}

              {source.specCandidates.length ? <details className="rounded-lg border border-[var(--border-default)] p-3">
                <summary className="cursor-pointer text-sm font-medium">Revisar {source.specCandidates.length} valores técnicos</summary>
                <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-xs"><thead><tr><th className="p-2">SKU</th><th className="p-2">Familia / campo</th><th className="p-2">Valor</th></tr></thead><tbody>
                  {source.specCandidates.map((row, index) => <tr key={`${row.productId}:${row.key}:${index}`} className="border-t border-[var(--border-default)]"><td className="p-2">{row.product.sku}</td><td className="p-2">{row.family} · {row.key}</td><td className="p-2">{row.value}{row.unit ? ` ${row.unit}` : ""}</td></tr>)}
                </tbody></table></div>
              </details> : null}

              {source.documentVersion?.trim() ? null : <form action={updateSourceVersionAction} className="grid gap-2 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="sourceId" value={source.id} />
                <input type="hidden" name="expectedUpdatedAt" value={source.updatedAt.toISOString()} />
                <label className="space-y-1"><span className="text-xs font-medium">Versión / fecha del documento</span><input name="documentVersion" required maxLength={120} className="op-field w-full px-3 py-2" placeholder="Rev. C / 2026-01" /></label>
                <label className="space-y-1"><span className="text-xs font-medium">Motivo de corrección</span><input name="reason" required minLength={10} maxLength={500} className="op-field w-full px-3 py-2" placeholder="Dato confirmado en la ficha del fabricante" /></label>
                <button className={buttonStyles({ variant: "secondary", size: "sm" })}>Guardar versión</button>
                <p className="text-xs text-[var(--text-muted)] sm:col-span-3">La corrección queda auditada y la fuente seguirá pendiente. No se publicarán los datos al guardar la versión.</p>
              </form>}

              <form action={approveSourceAction} className="space-y-3 border-t border-[var(--border-default)] pt-3">
                <input type="hidden" name="sourceId" value={source.id} />
                <input type="hidden" name="expectedUpdatedAt" value={source.updatedAt.toISOString()} />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmReviewed" value="yes" required className="mt-1" /><span>Confirmo que revisé fabricante, documento, versión y valores/activos asociados contra la fuente original.</span></label>
                <button disabled={!source.documentVersion?.trim() || !hasPendingPayload} className={buttonStyles({ size: "sm" })}>Aprobar fuente y publicar</button>
              </form>
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
