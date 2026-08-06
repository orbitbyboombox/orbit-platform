"use client";

import { CheckCircle2, Database, FolderArchive, FolderTree, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { BrandLogo } from "@/components/brand-logo";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { CUSTOMER_FOLDERS, GOOGLE_DRIVE_ROOT_FOLDERS } from "../application/google-drive-folder-strategy";
import { MOCK_DRIVE_DESTINATIONS } from "../application/mock-google-drive-live";
import type { GoogleDriveFolderStatus } from "../types/google-drive-live.types";

const STATUS: Record<GoogleDriveFolderStatus, { label: string; variant: "neutral" | "success" | "warning" | "danger" }> = {
  PENDING: { label: "Pendiente", variant: "neutral" }, CREATED: { label: "Creada", variant: "success" }, UPDATED: { label: "Actualizada", variant: "warning" }, ERROR: { label: "Error", variant: "danger" },
};

export function GoogleDriveLiveStatus() {
  const [status, setStatus] = useState<GoogleDriveFolderStatus>("CREATED");
  const presentation = STATUS[status];
  return (
    <section aria-labelledby="google-drive-live" className="space-y-6 border-t pt-10 lg:pt-12">
      <div id="google-drive-live">
        <BrandLogo className="mb-3 h-14 w-40" surface="dark" />
        <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">GOOGLE WORKSPACE · DRIVE</p><DataStateBadge state="DEMO" /></div>
        <SectionTitle description="Estrategia de destino preparada sin crear carpetas remotas. Los usuarios nunca seleccionan destinos manualmente." title="Google Drive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <SmartCard icon={<FolderTree aria-hidden="true" className="size-5" />} primaryValue="BOOMBOX ORBIT" secondaryValue="Estructura raíz preparada" status={<DataStateBadge label={`${presentation.label} · simulado`} state="MOCK" />} title="Arquitectura de carpetas">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {GOOGLE_DRIVE_ROOT_FOLDERS.map((name) => <div className="flex items-center gap-2 rounded-xl border bg-background/35 px-3 py-3 text-sm font-semibold" key={name}><FolderArchive aria-hidden="true" className="size-4 shrink-0 text-brand" />{name}</div>)}
          </div>
          <div className="mt-5 flex flex-col gap-2 border-t pt-5 sm:flex-row">
            <ActionButton icon={RefreshCw} label="Verificar estructura" onClick={() => setStatus("UPDATED")} type="button" />
          </div>
        </SmartCard>

        <SmartCard icon={<Database aria-hidden="true" className="size-5" />} primaryValue="Camilo Almarza" secondaryValue="2027 · Camilo Almarza - 2027-01-18" status={<StatusBadge label="Destino automático" variant="success" />} title="Carpeta del cliente">
          <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
            {CUSTOMER_FOLDERS.map((name) => <li className="flex items-center gap-2" key={name}><CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" /><span className="font-medium">{name}</span></li>)}
          </ul>
        </SmartCard>
      </div>

      <SmartCard icon={<FolderArchive aria-hidden="true" className="size-5" />} primaryValue="Sin navegación manual" secondaryValue="Cada documento obtiene una ruta determinista según su contexto." status={<StatusBadge label="Regla activa" variant="success" />} title="Destinos automáticos">
        <div className="grid gap-3 lg:grid-cols-3">
          {MOCK_DRIVE_DESTINATIONS.map((destination) => <div className="rounded-xl border bg-background/35 p-4" key={destination.kind}><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{destination.label}</p><p className="mt-2 break-words text-sm font-medium leading-6">{destination.folderPath}</p></div>)}
        </div>
        <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-4">
          {["Pendiente", "Creada", "Actualizada", "Error"].map((label, index) => <div className="rounded-xl bg-accent/55 px-4 py-3" key={label}><p className="text-xs text-muted">Estado {index + 1}</p><p className="mt-1 text-sm font-semibold">{label}</p></div>)}
        </div>
      </SmartCard>
    </section>
  );
}
