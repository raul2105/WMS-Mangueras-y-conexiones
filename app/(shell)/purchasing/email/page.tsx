import Link from "next/link";
import { redirect } from "next/navigation";
import { pageGuard } from "@/components/rbac/PageGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getSessionContext } from "@/lib/auth/session-context";
import { getGmailConnectionStatus } from "@/lib/email/gmail-connection";
import { isGmailOAuthConfigured } from "@/lib/email/gmail-config";
import { getGmailOAuthStateSecret } from "@/lib/email/gmail-oauth-http";

export const dynamic = "force-dynamic";

type PageSearchParams = {
  result?: string;
};

const RESULT_MESSAGES: Record<string, string> = {
  connected: "Tu cuenta Gmail quedó conectada para enviar órdenes de compra.",
  disconnected: "La cuenta Gmail se desconectó de tu perfil WMS.",
  error: "No se pudo completar la operación. Revisa el estado de conexión e inténtalo de nuevo.",
  unavailable: "La conexión Gmail no está configurada. Solicita al administrador del WMS que habilite la integración.",
  expired: "La autorización venció o no coincide con esta sesión. Inicia la conexión nuevamente.",
};

function formatConnectedAt(value: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function PurchaseOrderEmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  await pageGuard("purchasing.manage");
  const context = await getSessionContext();
  if (!context.roles.includes("MANAGER") || !context.user?.id) {
    redirect("/forbidden?from=%2Fpurchasing%2Femail");
  }

  const [params, connection] = await Promise.all([
    searchParams,
    getGmailConnectionStatus(context.user.id),
  ]);
  const configured = isGmailOAuthConfigured() && Boolean(getGmailOAuthStateSecret());
  const resultMessage = params.result ? RESULT_MESSAGES[params.result] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Correo para órdenes de compra"
        description="Conecta tu cuenta Gmail personal para definir el remitente de las órdenes que envías desde tu perfil WMS."
        actions={
          <Link href="/purchasing/orders" className="text-sm font-semibold text-[var(--action-primary)] underline-offset-4 hover:underline">
            Volver a órdenes
          </Link>
        }
      />

      {resultMessage ? (
        <p role="status" aria-live="polite" className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {resultMessage}
        </p>
      ) : null}

      <SectionCard
        title="Cuenta remitente"
        description="Esta conexión se guarda en tu usuario WMS y no cambia la forma en que inicias sesión. Las órdenes siguen dirigiéndose al correo registrado del proveedor."
      >
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Solo solicitamos identificar tu cuenta y enviar las órdenes que elijas. Puedes consultar el uso de tus datos en la{" "}
          <a href="/privacy-gmail.html" target="_blank" rel="noopener noreferrer" className="underline">política de privacidad de Gmail</a>.
        </p>
        {!configured ? (
          <p className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            La integración de Gmail no está disponible porque falta configuración del WMS. Un administrador debe habilitarla antes de conectar o desconectar cuentas.
          </p>
        ) : null}

        {connection.connected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={connection.status === "CONNECTED" ? "success" : "warning"} size="md">
                {connection.status === "CONNECTED" ? "Conectada" : "Requiere reconexión"}
              </Badge>
              <span className="text-sm text-[var(--text-secondary)]">
                Vinculada el {formatConnectedAt(connection.connectedAt)}
              </span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Cuenta Google</p>
              <p className="mt-1 break-all text-base font-semibold text-[var(--text-primary)]">{connection.email}</p>
              {connection.status === "REAUTH_REQUIRED" ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Google revocó o venció la autorización. Reconecta la cuenta para volver a enviar órdenes.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {configured ? (
                <form method="post" action="/api/email/gmail/connect">
                  <Button type="submit" variant="secondary">
                    {connection.status === "CONNECTED" ? "Cambiar o reconectar Gmail" : "Reconectar Gmail"}
                  </Button>
                </form>
              ) : null}
              {configured ? (
                <form method="post" action="/api/email/gmail/disconnect">
                  <Button type="submit" variant="danger">
                    Desconectar Gmail
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Al conectar, Google te pedirá autorización para enviar correo desde la cuenta que elijas. El acceso aplica sólo a tu perfil WMS; no inicia sesión en WMS con Google ni asigna roles.
            </p>
            {configured ? (
              <form method="post" action="/api/email/gmail/connect">
                <Button type="submit">Conectar mi Gmail</Button>
              </form>
            ) : (
              <Button type="button" disabled>Conexión no disponible</Button>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
