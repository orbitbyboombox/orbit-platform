"use client";

import {
  Archive,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Download,
  FolderArchive,
  Images,
  QrCode,
  Star,
} from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";

export type DeliveryExperienceProps = Omit<ProjectHeaderProps, "status">;

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function DeliveryExperience(props: DeliveryExperienceProps) {
  const [gallerySent, setGallerySent] = useState(false);
  const [qrDelivered, setQrDelivered] = useState(false);
  const [backupDelivered, setBackupDelivered] = useState(false);
  const [clientDownloaded, setClientDownloaded] = useState(false);
  const [balanceCollected, setBalanceCollected] = useState(false);
  const [operatorPaid, setOperatorPaid] = useState(false);
  const [archived, setArchived] = useState(false);
  const [followUpScheduled, setFollowUpScheduled] = useState(false);

  const deliveryComplete = qrDelivered && backupDelivered && clientDownloaded;
  const financialComplete = balanceCollected && operatorPaid;
  const experienceDelivered = gallerySent && deliveryComplete && financialComplete && archived;

  const decision = !gallerySent
    ? {
        recommendation: "Enviar galería",
        actionLabel: "Enviar galería",
        action: () => setGallerySent(true),
        estimatedTime: "30 segundos",
      }
    : !qrDelivered
      ? {
          recommendation: "Enviar la galería QR al cliente.",
          actionLabel: "Enviar QR",
          action: () => setQrDelivered(true),
          estimatedTime: "20 segundos",
        }
      : !backupDelivered
        ? {
            recommendation: "Enviar el respaldo.",
            actionLabel: "Enviar respaldo",
            action: () => setBackupDelivered(true),
            estimatedTime: "1 minuto",
          }
        : !clientDownloaded
          ? {
              recommendation: "Confirmar la descarga del cliente.",
              actionLabel: "Confirmar descarga",
              action: () => setClientDownloaded(true),
              estimatedTime: "15 segundos",
            }
          : !balanceCollected
            ? {
                recommendation: "Cobrar saldo pendiente",
                actionLabel: "Cobrar saldo",
                action: () => setBalanceCollected(true),
                estimatedTime: "30 segundos",
              }
            : !operatorPaid
              ? {
                  recommendation: "Registrar pago al operador",
                  actionLabel: "Pagar operador",
                  action: () => setOperatorPaid(true),
                  estimatedTime: "30 segundos",
                }
              : !archived
                ? {
                    recommendation: "Archivar proyecto",
                    actionLabel: "Archivar proyecto",
                    action: () => setArchived(true),
                    estimatedTime: "20 segundos",
                  }
                : !followUpScheduled
                  ? {
                      recommendation: "Programar seguimiento",
                      actionLabel: "Programar seguimiento",
                      action: () => setFollowUpScheduled(true),
                      estimatedTime: "30 segundos",
                    }
                  : {
                      recommendation: "Cliente listo para futuras oportunidades.",
                      actionLabel: "Ver oportunidades",
                      action: () => undefined,
                      estimatedTime: "Listo",
                    };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          description={experienceDelivered ? "Cliente listo para futuras oportunidades" : "Completa los requisitos de entrega pendientes."}
          icon={experienceDelivered ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <Download aria-hidden="true" className="size-5" />}
          primaryValue={experienceDelivered ? "Experiencia entregada" : "Entrega en curso"}
          secondaryValue={experienceDelivered ? "Proyecto archivado" : "ORBIT está guiando los pasos finales del proyecto."}
          status={<StatusBadge label={experienceDelivered ? "Proyecto archivado" : "En curso"} variant={experienceDelivered ? "success" : "info"} />}
          title="Estado de entrega"
        />
      }
      copilot={
        <OrbitCopilot
          actionLabel={decision.actionLabel}
          estimatedTime={decision.estimatedTime}
          onAction={decision.action}
          recommendation={decision.recommendation}
          title="Recomendación de entrega"
        />
      }
      header={<ProjectHeader {...props} status={archived ? ProjectStatus.ARCHIVED : ProjectStatus.DELIVERY} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            actionLabel="Abrir galería"
            icon={<Images aria-hidden="true" className="size-5" />}
            onAction={() => undefined}
            primaryValue={gallerySent ? "Galería lista" : "Lista para enviar"}
            secondaryValue="Galería final del evento"
            status={<StatusBadge label={gallerySent ? "Enviada" : "Pendiente"} variant={gallerySent ? "success" : "warning"} />}
            title="Galería"
          >
            <dl className="divide-y">
              <DetailRow label="Estado de galería" value={gallerySent ? "Entregada" : "Lista"} />
              <DetailRow label="Galería QR" value={qrDelivered ? "Entregada" : "Pendiente"} />
              <DetailRow label="Archivos de respaldo" value={backupDelivered ? "Entregados" : "Pendientes"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<QrCode aria-hidden="true" className="size-5" />}
            primaryValue={deliveryComplete ? "Entrega completa" : "Entrega digital"}
            secondaryValue="Archivos y acceso del cliente"
            status={<StatusBadge label={deliveryComplete ? "Completa" : "En curso"} variant={deliveryComplete ? "success" : "info"} />}
            title="Entrega digital"
          >
            <dl className="divide-y">
              <DetailRow label="Estado de entrega QR" value={qrDelivered ? "Entregada" : "Pendiente"} />
              <DetailRow label="Estado del respaldo" value={backupDelivered ? "Entregado" : "Pendiente"} />
              <DetailRow label="Descarga del cliente" value={clientDownloaded ? "Descargada" : "Esperando descarga"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Banknote aria-hidden="true" className="size-5" />}
            primaryValue="$1,850,000 CLP"
            secondaryValue="Venta total"
            status={<StatusBadge label={financialComplete ? "Cerrado" : "Pendiente"} variant={financialComplete ? "success" : "warning"} />}
            title="Cierre financiero"
          >
            <dl className="divide-y">
              <DetailRow label="Saldo pendiente" value={balanceCollected ? "$0 CLP" : "$350,000 CLP"} />
              <DetailRow label="Pago al operador" value={operatorPaid ? "Pagado" : "$120,000 CLP pendientes"} />
              <DetailRow label="Estado financiero" value={financialComplete ? "Cerrado" : "Requiere acción"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<FolderArchive aria-hidden="true" className="size-5" />}
            primaryValue={archived ? "Proyecto archivado" : "Listo para archivar"}
            secondaryValue="15 de septiembre de 2027"
            status={<StatusBadge label={archived ? "Archivado" : "Pendiente"} variant={archived ? "success" : "neutral"} />}
            title="Archivo del proyecto"
          >
            <dl className="divide-y">
              <DetailRow label="Estado del archivo" value={archived ? "Completo" : "Pendiente"} />
              <DetailRow label="Fecha de finalización" value="15 de septiembre de 2027" />
              <DetailRow label="Puntaje del proyecto" value="96 / 100" />
            </dl>
          </SmartCard>

          <SmartCard
            className="sm:col-span-2"
            icon={<Star aria-hidden="true" className="size-5" />}
            primaryValue="★★★★★"
            secondaryValue="Satisfacción del cliente"
            status={<StatusBadge label={followUpScheduled ? "Programado" : "Seguimiento pendiente"} variant={followUpScheduled ? "success" : "info"} />}
            title="Seguimiento del cliente"
          >
            <dl className="grid gap-5 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">Notas internas</dt>
                <dd className="mt-2 text-sm font-medium">Excelente participación</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Oportunidades futuras</dt>
                <dd className="mt-2 text-sm font-medium">Evento de aniversario</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Próxima fecha de seguimiento</dt>
                <dd className="mt-2 text-sm font-medium">{followUpScheduled ? "15 de octubre de 2027" : "Sin programar"}</dd>
              </div>
            </dl>
          </SmartCard>

          {experienceDelivered && (
            <SmartCard
              className="sm:col-span-2"
              icon={<Archive aria-hidden="true" className="size-5" />}
              primaryValue="Experiencia entregada"
              secondaryValue="Proyecto archivado · Cliente listo para futuras oportunidades"
              status={<StatusBadge label="Flujo MVP completo" variant="success" />}
              title="Proyecto ORBIT"
            />
          )}

          {followUpScheduled && (
            <SmartCard
              className="sm:col-span-2"
              icon={<CalendarClock aria-hidden="true" className="size-5" />}
              primaryValue="Relación futura programada"
              secondaryValue="El recorrido del cliente está completo y la próxima oportunidad está planificada."
              title="Relación con el cliente"
            />
          )}
        </div>
      }
      timeline={null}
    />
  );
}
