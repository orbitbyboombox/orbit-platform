"use client";

import { useState } from "react";
import { Banknote, CalendarClock, CheckSquare2, Copy, ExternalLink, FileCheck2, ImageIcon, Landmark, Link2, Send, WalletCards } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";
import type { CustomerPortalStage } from "./customer-portal-experience";
import { createCustomerPortalAccessAction } from "@/features/customer-portal/admin.actions";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import { EquipmentAssignmentPanel, type EquipmentAssignmentPanelProps } from "@/features/asset-management";
import { AgreementSigningControl } from "@/features/projects/signing/agreement-signing-control";
import { ProductionIntegrationPanel, type ProductionIntegrationPanelProps } from "./production-integration-panel";

export type ProjectWorkspaceExperienceProps = Omit<ProjectHeaderProps, "status"> & {
  projectKey?: string;
  portalStage?: CustomerPortalStage;
  eventDateIso?: string;
  activities?: readonly { title: string; detail: string; time: string }[];
  equipment: EquipmentAssignmentPanelProps;
  signing: { agreementId?: string; status: string };
  productionIntegration: ProductionIntegrationPanelProps;
  workspaceData: { sale: string; balance: string; margin: string; deposit: string; contractStatus: string; contractDate: string; checklist: string; operator: string; booth: string; gallery: string; backup: string; communication: string; commercialStage: string; lastQuotation: string };
};

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return <div className="flex items-center justify-between gap-4 py-1.5 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

export function ProjectWorkspaceExperience(props: ProjectWorkspaceExperienceProps) {
  const [portalUrl, setPortalUrl] = useState("");
  const [portalFeedback, setPortalFeedback] = useState("Genera un enlace seguro");
  const portalId = createPortalId(props.projectKey ?? props.projectName);
  const eventIntelligence = ORBIT_TIME_ENGINE.getEventIntelligence({ eventDate: props.eventDateIso ?? "2027-09-14" });

  const copyPortalLink = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setPortalFeedback("Enlace copiado");
    } catch {
      setPortalFeedback("Copia el enlace manualmente");
    }
  };
  const generatePortalLink=async()=>{if(!props.projectKey)return;setPortalFeedback("Generando enlace…");const result=await createCustomerPortalAccessAction(props.projectKey);if(result.ok){setPortalUrl(result.url);setPortalFeedback("Enlace seguro creado");}else setPortalFeedback(result.error);};

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={<ProjectHeader {...props} onEdit={() => undefined} score={props.score ?? 92} stageLabel="Preparación" status={ProjectStatus.CONFIRMED} />}
      copilot={
        <OrbitCopilot actionLabel="Completar checklist" ariaLabel="Recomendación de ORBIT Copilot" estimatedTime="2 minutos" impact="El proyecto no puede pasar a listo para producción." reason="Falta validar la plantilla antes del evento." recommendation="Completar checklist" title="Siguiente decisión" />
      }
      mainContent={
        <div className="space-y-10">
          <section aria-labelledby="perfil-cliente" className="rounded-2xl border bg-card p-5 sm:p-7">
            <div className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Relación con el cliente</p><h2 className="mt-2 text-2xl font-semibold tracking-tight" id="perfil-cliente">{props.clientName}</h2><p className="mt-1 text-sm text-muted">{props.projectName}</p></div>
              <div className="flex flex-wrap gap-2"><StatusBadge label={props.workspaceData.commercialStage} variant="info" /><StatusBadge label="Portal disponible" variant="success" /></div>
            </div>
            <dl className="grid gap-x-8 gap-y-5 py-6 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-muted">Próximo evento</dt><dd className="mt-1 font-semibold">{props.eventDate} · {props.eventTime}</dd></div>
              <div><dt className="text-muted">Cuenta regresiva</dt><dd className="mt-1 font-semibold text-brand">{eventIntelligence.countdown.label}</dd></div>
              <div><dt className="text-muted">Etapa comercial</dt><dd className="mt-1 font-semibold">{props.workspaceData.commercialStage}</dd></div>
              <div><dt className="text-muted">Última comunicación</dt><dd className="mt-1 font-semibold">{props.workspaceData.communication}</dd></div>
              <div><dt className="text-muted">Última cotización</dt><dd className="mt-1 font-semibold">{props.workspaceData.lastQuotation}</dd></div>
              <div><dt className="text-muted">Último pago</dt><dd className="mt-1 font-semibold">{props.workspaceData.deposit}</dd></div>
              <div><dt className="text-muted">Portal</dt><dd className="mt-1 font-semibold">Activo · {portalId}</dd></div>
              <div><dt className="text-muted">Comunicación</dt><dd className="mt-1 font-semibold">{props.workspaceData.communication}</dd></div>
            </dl>
            <div className="border-t pt-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Trayectoria unificada</p><ol className="mt-4 flex gap-2 overflow-x-auto pb-1">{["WhatsApp", "Cotización", "Portal", "Contrato", "Firma", "Pago", "Diseño", "Planificación", "Evento", "Entrega", "Seguimiento"].map((step, index) => <li className="flex shrink-0 items-center gap-2" key={step}><span className={index < 7 ? "rounded-full bg-success-soft px-3 py-1.5 text-xs font-medium text-success" : "rounded-full border px-3 py-1.5 text-xs text-muted"}>{step}</span>{index < 10 && <span aria-hidden="true" className="text-muted">→</span>}</li>)}</ol></div>
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-5"><ActionButton icon={FileCheck2} label="Contrato" variant="outline" /><ActionButton icon={WalletCards} label="Pagos" variant="outline" /><ActionButton icon={Link2} label="Portal" onClick={generatePortalLink} variant="outline" /><ActionButton icon={ImageIcon} label="Documentos" variant="outline" /></div>
          </section>
          <section aria-labelledby="resumen-proyecto">
            <div className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Control del proyecto</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="resumen-proyecto">Resumen</h2><p className="mt-2 text-sm text-muted">Información disponible en los registros del proyecto.</p></div>
            <div className="grid gap-4 xl:grid-cols-2">
              <SmartCard className="xl:col-span-2" icon={<Link2 aria-hidden="true" className="size-5" />} id="portal-cliente" primaryValue={portalId} secondaryValue="Portal ID permanente" status={<StatusBadge label="Preparación" variant="info" />} title="Portal del Cliente">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Enlace seguro · vence en 30 días</p><p className="mt-2 break-all text-sm font-medium sm:text-base">{portalUrl||"Aún no se ha generado un enlace de acceso."}</p></div><StatusBadge label={portalFeedback} variant={portalFeedback === "Enlace copiado" || portalFeedback === "Enlace seguro creado" ? "success" : "neutral"} /></div>
                <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-3"><ActionButton icon={portalUrl?Copy:Link2} label={portalUrl?"Copiar enlace":"Generar enlace"} onClick={portalUrl?copyPortalLink:generatePortalLink} variant="outline" /><ActionButton disabled={!portalUrl} icon={ExternalLink} label="Abrir Portal" onClick={()=>portalUrl&&window.open(portalUrl,"_blank","noopener,noreferrer")} /><ActionButton disabled={!portalUrl} icon={Send} label="Preparar envío" onClick={() => setPortalFeedback("Listo para enviar al cliente")} variant="outline" /></div>
              </SmartCard>
              <SmartCard icon={<Banknote aria-hidden="true" className="size-5" />} primaryValue={props.workspaceData.sale} secondaryValue="Venta registrada" title="Presupuesto"><dl><DetailRow label="Saldo" value={props.workspaceData.balance} /><DetailRow label="Margen" value={props.workspaceData.margin} /></dl></SmartCard>
              <SmartCard icon={<FileCheck2 aria-hidden="true" className="size-5" />} id="documentos" primaryValue={props.workspaceData.contractStatus} secondaryValue="Estado del acuerdo" title="Contrato"><dl><DetailRow label="Fecha" value={props.workspaceData.contractDate} /></dl></SmartCard>
              <SmartCard icon={<Landmark aria-hidden="true" className="size-5" />} primaryValue={props.workspaceData.deposit} secondaryValue="Abono registrado" title="Finanzas"><dl><DetailRow label="Saldo" value={props.workspaceData.balance} /></dl></SmartCard>
              <SmartCard icon={<CheckSquare2 aria-hidden="true" className="size-5" />} primaryValue={props.workspaceData.checklist} secondaryValue="Checklist registrado" title="Preparación"><dl><DetailRow label="Operador" value={props.workspaceData.operator} /><DetailRow label="Cabina" value={props.workspaceData.booth} /></dl></SmartCard>
              <SmartCard icon={<CalendarClock aria-hidden="true" className="size-5" />} primaryValue={eventIntelligence.countdown.label} secondaryValue="Cuenta regresiva" status={<StatusBadge label={eventIntelligence.timeline.phaseLabel} variant="info" />} title="Evento"><dl><DetailRow label="Próxima acción" value={eventIntelligence.timeline.nextAction} /><DetailRow label="Estado" value="En calendario" /></dl></SmartCard>
              <SmartCard icon={<ImageIcon aria-hidden="true" className="size-5" />} primaryValue={props.workspaceData.gallery} secondaryValue="Estado de entrega" title="Entrega"><dl><DetailRow label="Galería" value={props.workspaceData.gallery} /><DetailRow label="Respaldo" value={props.workspaceData.backup} /><DetailRow label="Archivo" value="Sin registro" /></dl></SmartCard>
            </div>
          </section>

          <EquipmentAssignmentPanel {...props.equipment} />

          <ProductionIntegrationPanel {...props.productionIntegration} />

          <AgreementSigningControl agreementId={props.signing.agreementId} projectId={props.projectKey ?? ""} status={props.signing.status} />

          <section aria-labelledby="actividad-reciente" className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Últimos movimientos</p><h2 className="mt-2 text-xl font-semibold tracking-tight" id="actividad-reciente">Actividad reciente</h2></div>
            {props.activities?.length ? <ol className="divide-y">{props.activities.map((activity) => <li className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:gap-x-6" key={`${activity.title}-${activity.time}`}><div><p className="text-sm font-medium">{activity.title}</p><p className="mt-1 text-sm text-muted">{activity.detail}</p></div><time className="text-xs text-muted">{activity.time}</time></li>)}</ol> : <div className="rounded-xl border border-dashed px-5 py-8 text-center"><p className="text-sm font-medium">Aún no existe actividad para este proyecto.</p><p className="mt-1 text-sm text-muted">Los próximos movimientos aparecerán aquí automáticamente.</p></div>}
          </section>
        </div>
      }
      timeline={null}
      bottomAction={
        <div className="sticky bottom-3 z-10 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><ActionButton icon={WalletCards} label="Registrar pago" variant="outline" /><ActionButton icon={FileCheck2} label="Abrir contrato" variant="outline" /><ActionButton icon={CheckSquare2} label="Preparación" variant="outline" /><ActionButton icon={CalendarClock} label="Iniciar evento" /></div>
        </div>
      }
    />
  );
}

function createPortalId(projectKey: string) {
  const value = Array.from(projectKey).reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 1_000_000, 124);
  return `BBX-26-${value.toString().padStart(6, "0")}`;
}
