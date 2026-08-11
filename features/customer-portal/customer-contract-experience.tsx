"use client";

import { CalendarDays, CheckCircle2, Download, FileSignature, FolderOpen, Printer, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCompanySettings } from "@/features/company-settings";

type ContractData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Project = ContractData["project"] & { customers: { full_name: string }; project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }> };

const money = (value: number | string | null | undefined) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
const date = (value: string | null | undefined, time = false) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", ...(time ? { timeStyle: "short" as const } : {}), timeZone: "America/Santiago" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`)) : "Pendiente";

export function CustomerContractExperience({ data, token }: { data: ContractData; token: string }) {
  const company = useCompanySettings();
  const project = data.project as Project;
  const agreement = data.agreement;
  const quotation = data.quotation;
  const signed = agreement?.status === "SIGNED";
  const commercialDocument = agreement?.status === "COMMERCIAL_DOCUMENT";
  const documentReady = signed || commercialDocument;
  const cancelled = agreement?.status === "CANCELLED";
  const status = signed ? { label: "Firmado", variant: "success" as const } : commercialDocument ? { label: "Documento con Factura", variant: "success" as const } : cancelled ? { label: "Cancelado", variant: "danger" as const } : { label: "Pendiente", variant: "warning" as const };
  const total = Number(quotation?.final_customer_price ?? quotation?.grand_total ?? 0);
  const reservation = Math.round(total * 0.5);
  const extras = project.project_services.flatMap((service) => normalizeExtras(service.extras));
  const contractUrl = `/api/portal/${encodeURIComponent(token)}/contract`;
  const sentAt = data.contractTimeline.find((item) => item.action === "AGREEMENT_SENT")?.occurred_at;
  const signedAt = data.evidence?.signed_at ?? agreement?.signed_at;
  const folderUrl = data.contractFolder?.external_folder_id ? `https://drive.google.com/drive/folders/${data.contractFolder.external_folder_id}` : null;

  return <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" id="contract">
    <div className="border-b border-border/70 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Documento oficial</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Mi contrato</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Tu contrato BOOMBOX está siempre disponible aquí, junto con su firma y trazabilidad.</p></div><StatusBadge label={status.label} variant={status.variant}/></div></div>

    <div className="grid min-w-0 gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-3">
          <ActionButton disabled={!documentReady || !agreement?.signed_pdf_path} icon={Download} label="Descargar PDF" onClick={() => window.open(`${contractUrl}?download=1`, "_blank", "noopener,noreferrer")}/>
          <ActionButton disabled={!documentReady || !agreement?.signed_pdf_path} icon={Printer} label="Imprimir" onClick={() => window.open(contractUrl, "_blank", "noopener,noreferrer")} variant="outline"/>
          {folderUrl && <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:border-brand/60 hover:text-brand" href={folderUrl} rel="noreferrer" target="_blank"><FolderOpen className="size-4"/>Ver carpeta del contrato</a>}
        </div>
        {documentReady && agreement?.signed_pdf_path ? <div className="overflow-hidden rounded-2xl border border-border bg-background"><iframe className="h-[34rem] w-full sm:h-[46rem]" src={`${contractUrl}#toolbar=1&navpanes=0`} title="Vista previa del documento oficial"/></div> : <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 p-8 text-center"><FileSignature className="size-9 text-brand"/><p className="mt-4 font-semibold">Documento {cancelled ? "cancelado" : "pendiente"}</p><p className="mt-2 max-w-sm text-sm leading-6 text-muted">El PDF oficial aparecerá automáticamente aquí cuando el proceso esté completo.</p></div>}
      </div>

      <aside className="min-w-0 space-y-4">
        <Card title="Información del contrato"><dl className="space-y-3"><Row label="Cliente" value={project.customers.full_name}/><Row label="Fecha del evento" value={date(project.event_date)}/><Row label="Lugar del evento" value={project.location || "Por confirmar"}/><Row label="Servicio" value={project.project_services.map((item) => item.service_code).join(" + ") || "Por confirmar"}/><Row label="Horas" value={project.project_services.map((item) => item.duration_hours ? `${item.duration_hours} horas` : null).filter(Boolean).join(" · ") || "Por confirmar"}/><Row label="Extras" value={extras.join(" · ") || "Sin extras"}/><Row label="Transporte" value={money(quotation?.transport_total)}/><Row label="Descuento" value={quotation?.discount_total ? `−${money(quotation.discount_total)}` : money(0)}/><Row emphasis label="Total" value={money(total)}/><Row label="Reserva" value={money(reservation)}/><Row label="Saldo restante" value={money(total - reservation)}/></dl></Card>
        {!commercialDocument && <Card title="Firmas"><div className="space-y-3"><Signature label="Firma del cliente" name={data.evidence?.signer_name ?? project.customers.full_name} ready={signed}/><Signature label={`Firma ${company.brandName}`} name={company.legalName || company.brandName} ready={signed}/><div className="flex items-center gap-2 border-t border-border/70 pt-3 text-sm"><CalendarDays className="size-4 text-brand"/><span className="text-muted">Fecha de firma</span><span className="ml-auto text-right font-medium">{date(signedAt, true)}</span></div></div></Card>}
        <Card title="Historial del contrato"><ol className="space-y-4"><Milestone label="Contrato creado" value={date(agreement?.created_at, true)} ready={Boolean(agreement)}/><Milestone label="Contrato enviado" value={date(sentAt, true)} ready={Boolean(sentAt)}/><Milestone label="Contrato firmado" value={date(signedAt, true)} ready={signed}/><Milestone label="Última actualización" value={date(agreement?.updated_at, true)} ready={Boolean(agreement?.updated_at)}/></ol></Card>
      </aside>
    </div>
  </section>;
}

function normalizeExtras(value: unknown): string[] { if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).name ?? "") : "").filter(Boolean); }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-border/80 bg-background/35 p-4 sm:p-5"><h3 className="font-semibold">{title}</h3><div className="mt-4">{children}</div></div>; }
function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div className={`flex items-start justify-between gap-4 text-sm ${emphasis ? "border-t border-border/70 pt-3" : ""}`}><dt className="text-muted">{label}</dt><dd className={`max-w-[60%] text-right ${emphasis ? "text-base font-semibold text-brand" : "font-medium"}`}>{value}</dd></div>; }
function Signature({ label, name, ready }: { label: string; name: string; ready: boolean }) { return <div className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><ShieldCheck className={`size-5 ${ready ? "text-success" : "text-muted"}`}/><div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="truncate text-sm font-semibold">{ready ? name : "Pendiente"}</p></div></div>; }
function Milestone({ label, value, ready }: { label: string; value: string; ready: boolean }) { return <li className="flex gap-3"><CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${ready ? "text-success" : "text-muted"}`}/><div><p className="text-sm font-medium">{label}</p><p className="mt-0.5 text-xs text-muted">{value}</p></div></li>; }
