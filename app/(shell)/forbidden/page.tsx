import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

export const dynamic = "force-dynamic";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center">
      <SectionCard title="Acceso denegado" description="Tu usuario no tiene permisos para abrir esta seccion.">
        <div className="flex flex-wrap gap-3">
          <Link href="/" className={buttonStyles()}>
            Ir al dashboard
          </Link>
          <Link href="/login" className={buttonStyles({ variant: "secondary" })}>
            Cambiar usuario
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
