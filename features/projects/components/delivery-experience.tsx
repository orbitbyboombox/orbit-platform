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
        recommendation: "Send Gallery",
        actionLabel: "Send Gallery",
        action: () => setGallerySent(true),
        estimatedTime: "30 seconds",
      }
    : !qrDelivered
      ? {
          recommendation: "Deliver the QR gallery to the client.",
          actionLabel: "Send QR",
          action: () => setQrDelivered(true),
          estimatedTime: "20 seconds",
        }
      : !backupDelivered
        ? {
            recommendation: "Send the backup delivery.",
            actionLabel: "Send Backup",
            action: () => setBackupDelivered(true),
            estimatedTime: "1 minute",
          }
        : !clientDownloaded
          ? {
              recommendation: "Confirm the client download.",
              actionLabel: "Confirm Download",
              action: () => setClientDownloaded(true),
              estimatedTime: "15 seconds",
            }
          : !balanceCollected
            ? {
                recommendation: "Collect Remaining Balance",
                actionLabel: "Collect Balance",
                action: () => setBalanceCollected(true),
                estimatedTime: "30 seconds",
              }
            : !operatorPaid
              ? {
                  recommendation: "Register Operator Payment",
                  actionLabel: "Pay Operator",
                  action: () => setOperatorPaid(true),
                  estimatedTime: "30 seconds",
                }
              : !archived
                ? {
                    recommendation: "Archive Project",
                    actionLabel: "Archive Project",
                    action: () => setArchived(true),
                    estimatedTime: "20 seconds",
                  }
                : !followUpScheduled
                  ? {
                      recommendation: "Schedule Follow-up",
                      actionLabel: "Schedule Follow-up",
                      action: () => setFollowUpScheduled(true),
                      estimatedTime: "30 seconds",
                    }
                  : {
                      recommendation: "Customer ready for future opportunities.",
                      actionLabel: "View Opportunities",
                      action: () => undefined,
                      estimatedTime: "Ready",
                    };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          description={experienceDelivered ? "Customer Ready for Future Opportunities" : "Complete the remaining delivery requirements."}
          icon={experienceDelivered ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <Download aria-hidden="true" className="size-5" />}
          primaryValue={experienceDelivered ? "Experience Delivered" : "Delivery in progress"}
          secondaryValue={experienceDelivered ? "Project Archived" : "ORBIT is guiding the final project steps."}
          status={<StatusBadge label={experienceDelivered ? "Project Archived" : "In progress"} variant={experienceDelivered ? "success" : "info"} />}
          title="Delivery status"
        />
      }
      copilot={
        <OrbitCopilot
          actionLabel={decision.actionLabel}
          estimatedTime={decision.estimatedTime}
          onAction={decision.action}
          recommendation={decision.recommendation}
          title="Delivery Recommendation"
        />
      }
      header={<ProjectHeader {...props} status={archived ? ProjectStatus.ARCHIVED : ProjectStatus.DELIVERY} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            actionLabel="Open Gallery"
            icon={<Images aria-hidden="true" className="size-5" />}
            onAction={() => undefined}
            primaryValue={gallerySent ? "Gallery Ready" : "Ready to send"}
            secondaryValue="Final event gallery"
            status={<StatusBadge label={gallerySent ? "Sent" : "Pending"} variant={gallerySent ? "success" : "warning"} />}
            title="Gallery"
          >
            <dl className="divide-y">
              <DetailRow label="Gallery Status" value={gallerySent ? "Delivered" : "Ready"} />
              <DetailRow label="QR Gallery" value={qrDelivered ? "Delivered" : "Pending"} />
              <DetailRow label="Backup Files" value={backupDelivered ? "Delivered" : "Pending"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<QrCode aria-hidden="true" className="size-5" />}
            primaryValue={deliveryComplete ? "Delivery Complete" : "Digital delivery"}
            secondaryValue="Client files and access"
            status={<StatusBadge label={deliveryComplete ? "Complete" : "In progress"} variant={deliveryComplete ? "success" : "info"} />}
            title="Digital Delivery"
          >
            <dl className="divide-y">
              <DetailRow label="QR Delivery Status" value={qrDelivered ? "Delivered" : "Pending"} />
              <DetailRow label="Backup Delivery Status" value={backupDelivered ? "Delivered" : "Pending"} />
              <DetailRow label="Client Download Status" value={clientDownloaded ? "Downloaded" : "Awaiting download"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Banknote aria-hidden="true" className="size-5" />}
            primaryValue="$1,850,000 CLP"
            secondaryValue="Total Sale"
            status={<StatusBadge label={financialComplete ? "Closed" : "Pending"} variant={financialComplete ? "success" : "warning"} />}
            title="Financial Closing"
          >
            <dl className="divide-y">
              <DetailRow label="Remaining Balance" value={balanceCollected ? "$0 CLP" : "$350,000 CLP"} />
              <DetailRow label="Operator Payment" value={operatorPaid ? "Paid" : "$120,000 CLP pending"} />
              <DetailRow label="Financial Status" value={financialComplete ? "Closed" : "Action required"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<FolderArchive aria-hidden="true" className="size-5" />}
            primaryValue={archived ? "Project Archived" : "Ready to archive"}
            secondaryValue="September 15, 2027"
            status={<StatusBadge label={archived ? "Archived" : "Pending"} variant={archived ? "success" : "neutral"} />}
            title="Project Archive"
          >
            <dl className="divide-y">
              <DetailRow label="Archive Status" value={archived ? "Complete" : "Pending"} />
              <DetailRow label="Completion Date" value="September 15, 2027" />
              <DetailRow label="Project Score" value="96 / 100" />
            </dl>
          </SmartCard>

          <SmartCard
            className="sm:col-span-2"
            icon={<Star aria-hidden="true" className="size-5" />}
            primaryValue="★★★★★"
            secondaryValue="Customer Satisfaction"
            status={<StatusBadge label={followUpScheduled ? "Scheduled" : "Follow-up pending"} variant={followUpScheduled ? "success" : "info"} />}
            title="Customer Follow-up"
          >
            <dl className="grid gap-5 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">Internal Notes</dt>
                <dd className="mt-2 text-sm font-medium">Excellent engagement</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Future Opportunities</dt>
                <dd className="mt-2 text-sm font-medium">Anniversary event</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Next Follow-up Date</dt>
                <dd className="mt-2 text-sm font-medium">{followUpScheduled ? "October 15, 2027" : "Not scheduled"}</dd>
              </div>
            </dl>
          </SmartCard>

          {experienceDelivered && (
            <SmartCard
              className="sm:col-span-2"
              icon={<Archive aria-hidden="true" className="size-5" />}
              primaryValue="Experience Delivered"
              secondaryValue="Project Archived · Customer Ready for Future Opportunities"
              status={<StatusBadge label="MVP Flow Complete" variant="success" />}
              title="ORBIT Project"
            />
          )}

          {followUpScheduled && (
            <SmartCard
              className="sm:col-span-2"
              icon={<CalendarClock aria-hidden="true" className="size-5" />}
              primaryValue="Future relationship scheduled"
              secondaryValue="The customer journey is complete and the next opportunity is planned."
              title="Customer relationship"
            />
          )}
        </div>
      }
      timeline={null}
    />
  );
}
