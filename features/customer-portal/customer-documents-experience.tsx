"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, Eye, FileText, FolderOpen, Search } from "lucide-react";

import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Category = PortalData["customerDocuments"]["files"][number]["category"];

const filters: Array<{ label: string; value: "ALL" | Category }> = [
  { label: "Todos", value: "ALL" },
  { label: "Contratos", value: "CONTRACTS" },
  { label: "Financieros", value: "FINANCIAL" },
  { label: "Diseños", value: "DESIGN" },
  { label: "Fotos", value: "PHOTOS" },
  { label: "Videos", value: "VIDEOS" },
  { label: "Otros", value: "OTHER" },
];

export function CustomerDocumentsExperience({ data, token }: { data: PortalData; token: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");
  const normalizedQuery = query.trim().toLocaleLowerCase("es-CL");
  const files = useMemo(
    () =>
      data.customerDocuments.files.filter((file) => {
        const matchesFilter = filter === "ALL" || file.category === filter;
        const searchable = `${file.name} ${file.categoryLabel} ${formatDate(file.createdTime)}`.toLocaleLowerCase("es-CL");
        return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
      }),
    [data.customerDocuments.files, filter, normalizedQuery],
  );
  const fileUrl = (fileId: string) =>
    `/api/portal/${encodeURIComponent(token)}/documents/${encodeURIComponent(fileId)}`;

  return (
    <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" id="documents">
      <header className="border-b border-border/70 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Documentos del evento</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Mis documentos</h2>
            <p className="mt-2 text-sm text-muted">Contrato, cotizaciones, comprobantes, facturas y diseños en un solo lugar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={data.customerDocuments.status === "AVAILABLE" ? "Documentos disponibles" : "En preparación"}
              variant={data.customerDocuments.status === "AVAILABLE" ? "success" : "warning"}
            />
            {data.customerDocuments.rootFolderUrl && (
              <a
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:border-brand/50 hover:text-brand"
                href={data.customerDocuments.rootFolderUrl}
                rel="noreferrer"
                target="_blank"
              >
                <FolderOpen className="size-4" /> Abrir carpeta
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-7">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar documentos</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              className="min-h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, categoría o fecha"
              type="search"
              value={query}
            />
          </label>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar documentos">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.value}
                className={`min-h-12 whitespace-nowrap rounded-xl border px-4 text-sm font-medium transition-colors ${filter === item.value ? "border-brand bg-brand/10 text-brand" : "border-border bg-background text-muted hover:text-foreground"}`}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {files.length > 0 ? (
          <div className="grid gap-3">
            {files.map((file) => (
              <article className="grid gap-4 rounded-2xl border border-border/80 bg-background/30 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={file.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-xl border border-brand/20 bg-brand/5 p-3"><FileText className="size-5 text-brand" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{file.name}</h3>
                    <p className="mt-1 text-sm text-muted">{file.categoryLabel}</p>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                      <div><dt className="inline">Creado: </dt><dd className="inline">{formatDate(file.createdTime)}</dd></div>
                      <div><dt className="inline">Actualizado: </dt><dd className="inline">{formatDate(file.modifiedTime)}</dd></div>
                    </dl>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <ActionButton icon={Eye} label="Vista previa" onClick={() => window.open(fileUrl(file.id), "_blank", "noopener,noreferrer")} variant="outline" />
                  <ActionButton icon={Download} label="Descargar" onClick={() => window.open(`${fileUrl(file.id)}?download=1`, "_blank", "noopener,noreferrer")} />
                  <a className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:border-brand/50 hover:text-brand" href={file.folderUrl} rel="noreferrer" target="_blank"><ExternalLink className="size-4" /> Carpeta</a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-7 text-center">
            <FileText className="size-9 text-brand" />
            <p className="mt-4 font-semibold">{query || filter !== "ALL" ? "No encontramos documentos" : "Tus documentos están en preparación"}</p>
            <p className="mt-2 max-w-md text-sm text-muted">{query || filter !== "ALL" ? "Prueba con otra búsqueda o categoría." : "Los documentos aparecerán aquí automáticamente cuando BOOMBOX los publique."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value));
}
