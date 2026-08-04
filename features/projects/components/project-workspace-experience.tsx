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
import { CustomerPortalExperience, type CustomerPortalStage } from "./customer-portal-experience";

export type ProjectWorkspaceExperienceProps = Omit<ProjectHeaderProps, "status"> & {
  projectKey?: string;
  portalStage?: CustomerPortalStage;
};

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return <div className="flex items-center justify-between gap-4 py-1.5 text-sm"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

const activities = [
  { title: "Checklist de preparación actualizado", detail: "Se completaron 5 de 6 tareas.", time: "Hoy · 09:42" },
  { title: "Abono registrado", detail: "$1.500.000 ingresados al proyecto.", time: "Ayer · 16:18" },
  { title: "Contrato firmado", detail: "Firma digital validada por el cliente.", time: "2 ago · 11:05" },
  { title: "Operador asignado", detail: "Diego Morales confirmó disponibilidad.", time: "1 ago · 18:30" },
  { title: "Proyecto confirmado", detail: "La reserva pasó a etapa de preparación.", time: "30 jul · 10:12" },
] as const;

export function ProjectWorkspaceExperience(props: ProjectWorkspaceExperienceProps) {
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalFeedback, setPortalFeedback] = useState("Enlace disponible");
  const portalId = createPortalId(props.projectKey ?? props.projectName);
  const portalUrl = `https://orbit.boom-box.cl/p/${portalId}`;

  const copyPortalLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setPortalFeedback("Enlace copiado");
    } catch {
      setPortalFeedback("Copia el enlace manualmente");
    }
  };

  if (portalOpen) {
    return <CustomerPortalExperience clientName={props.clientName} eventDate={props.eventDate} location={props.location} onClose={() => setPortalOpen(false)} portalId={portalId} portalUrl={portalUrl} projectName={props.projectName} services={props.services} stage={props.portalStage ?? "PREPARATION"} />;
  }

  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={<ProjectHeader {...props} score={props.score ?? 92} stageLabel="Preparación" status={ProjectStatus.CONFIRMED} />}
      copilot={
        <OrbitCopilot actionLabel="Completar checklist" ariaLabel="Recomendación de ORBIT Copilot" estimatedTime="2 minutos" impact="El proyecto no puede pasar a listo para producción." reason="Falta validar la plantilla antes del evento." recommendation="Completar checklist" title="Siguiente decisión" />
      }
      mainContent={
        <div className="space-y-10">
          <section aria-labelledby="resumen-proyecto">
            <div className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Control del proyecto</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" id="resumen-proyecto">Resumen</h2></div>
            <div className="grid gap-4 xl:grid-cols-2">
              <SmartCard className="xl:col-span-2" icon={<Link2 aria-hidden="true" className="size-5" />} primaryValue={portalId} secondaryValue={portalUrl} status={<StatusBadge label={portalFeedback} variant={portalFeedback === "Enlace copiado" || portalFeedback === "Enlace reenviado" ? "success" : "info"} />} title="Portal del Cliente">
                <dl className="grid gap-2 sm:grid-cols-2"><DetailRow label="Estado" value="Preparación" /><DetailRow label="Portal ID" value={portalId} /></dl>
                <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-3"><ActionButton icon={Copy} label="Copiar enlace" onClick={copyPortalLink} variant="outline" /><ActionButton icon={ExternalLink} label="Abrir Portal" onClick={() => setPortalOpen(true)} /><ActionButton icon={Send} label="Reenviar enlace" onClick={() => setPortalFeedback("Enlace reenviado")} variant="outline" /></div>
              </SmartCard>
              <SmartCard icon={<Banknote aria-hidden="true" className="size-5" />} primaryValue="$4.850.000" secondaryValue="Venta total" status={<StatusBadge label="Saludable" variant="success" />} title="Presupuesto"><dl><DetailRow label="Saldo" value="$1.350.000" /><DetailRow label="Margen" value="38%" /></dl></SmartCard>
              <SmartCard icon={<FileCheck2 aria-hidden="true" className="size-5" />} primaryValue="Firmado" secondaryValue="Estado del contrato" status={<StatusBadge label="Completo" variant="success" />} title="Contrato"><dl><DetailRow label="Fecha de firma" value="2 agosto 2026" /></dl></SmartCard>
              <SmartCard icon={<Landmark aria-hidden="true" className="size-5" />} primaryValue="$1.500.000" secondaryValue="Abono registrado" status={<StatusBadge label="Al día" variant="success" />} title="Finanzas"><dl><DetailRow label="Saldo pendiente" value="$1.350.000" /></dl></SmartCard>
              <SmartCard icon={<CheckSquare2 aria-hidden="true" className="size-5" />} primaryValue="5 de 6" secondaryValue="Checklist completado" status={<StatusBadge label="Atención" variant="warning" />} title="Preparación"><dl><DetailRow label="Operador" value="Diego Morales" /><DetailRow label="Cabina" value="Classic 02" /></dl></SmartCard>
              <SmartCard icon={<CalendarClock aria-hidden="true" className="size-5" />} primaryValue="74 días" secondaryValue="Días restantes" status={<StatusBadge label="Confirmado" variant="info" />} title="Evento"><dl><DetailRow label="Estado" value="En calendario" /></dl></SmartCard>
              <SmartCard icon={<ImageIcon aria-hidden="true" className="size-5" />} primaryValue="Pendiente" secondaryValue="Estado de entrega" status={<StatusBadge label="Sin riesgo" variant="neutral" />} title="Entrega"><dl><DetailRow label="Galería" value="Aún no disponible" /><DetailRow label="Respaldo" value="Programado" /><DetailRow label="Archivo" value="Pendiente" /></dl></SmartCard>
            </div>
          </section>

          <section aria-labelledby="actividad-reciente" className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Últimos movimientos</p><h2 className="mt-2 text-xl font-semibold tracking-tight" id="actividad-reciente">Actividad reciente</h2></div>
            <ol className="divide-y">{activities.map((activity) => <li className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:gap-x-6" key={activity.title}><div><p className="text-sm font-medium">{activity.title}</p><p className="mt-1 text-sm text-muted">{activity.detail}</p></div><time className="text-xs text-muted">{activity.time}</time></li>)}</ol>
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
