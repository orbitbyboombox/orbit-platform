"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Gauge,
  Pause,
  Play,
  Printer,
  Square,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";

type LiveEventStatus = "running" | "paused" | "finished";

export type LiveEventExperienceProps = Omit<ProjectHeaderProps, "status">;

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

const statusPresentation: Record<LiveEventStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
  running: { label: "Running", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  finished: { label: "Finished", variant: "neutral" },
};

export function LiveEventExperience(props: LiveEventExperienceProps) {
  const [status, setStatus] = useState<LiveEventStatus>("running");
  const [incidentReported, setIncidentReported] = useState(false);
  const finished = status === "finished";
  const paused = status === "paused";
  const currentStatus = statusPresentation[status];

  const recommendation = finished
    ? {
        actionLabel: "Close Project",
        estimatedTime: "2 minutes",
        message: "Close Project",
        action: () => undefined,
      }
    : incidentReported
      ? {
          actionLabel: "Review Incident",
          estimatedTime: "30 seconds",
          message: "Review the reported incident.",
          action: () => setIncidentReported(false),
        }
      : paused
        ? {
            actionLabel: "Resume Event",
            estimatedTime: "5 seconds",
            message: "Event is paused. Resume when the operator is ready.",
            action: () => setStatus("running"),
          }
        : {
            actionLabel: "Continue Monitoring",
            estimatedTime: "Live",
            message: "Everything operating normally.",
            action: () => undefined,
          };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          description={finished ? "Next Recommended Experience · Close Project" : "Control the active production session."}
          icon={finished ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <Gauge aria-hidden="true" className="size-5" />}
          status={<StatusBadge label={finished ? "Event Completed" : currentStatus.label} variant={finished ? "success" : currentStatus.variant} />}
          title={finished ? "Event Completed" : "Live Event Actions"}
        >
          {finished ? (
            <p className="text-2xl font-semibold tracking-tight">Next Recommended Experience · Close Project</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {paused ? (
                <ActionButton label="Resume Event" onClick={() => setStatus("running")} type="button" />
              ) : (
                <Button className="gap-2" onClick={() => setStatus("paused")} type="button" variant="outline">
                  <Pause aria-hidden="true" className="size-4" /> Pause Event
                </Button>
              )}
              <Button className="gap-2" onClick={() => setIncidentReported(true)} type="button" variant="outline">
                <AlertTriangle aria-hidden="true" className="size-4" /> Report Incident
              </Button>
              <Button className="gap-2 text-danger" onClick={() => setStatus("finished")} type="button" variant="outline">
                <Square aria-hidden="true" className="size-4" /> Finish Event
              </Button>
            </div>
          )}
        </SmartCard>
      }
      copilot={
        <OrbitCopilot
          actionLabel={recommendation.actionLabel}
          estimatedTime={recommendation.estimatedTime}
          onAction={recommendation.action}
          recommendation={recommendation.message}
          title="ORBIT LIVE"
        />
      }
      header={<ProjectHeader {...props} status={finished ? ProjectStatus.DELIVERY : ProjectStatus.EVENT} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            icon={finished ? <CheckCircle2 aria-hidden="true" className="size-5" /> : paused ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
            primaryValue={currentStatus.label}
            secondaryValue={finished ? "Event production has ended" : paused ? "Production timer is paused" : "Live production in progress"}
            status={<StatusBadge label={currentStatus.label} variant={currentStatus.variant} />}
            title="Live Status"
          />

          <SmartCard
            icon={<UserRound aria-hidden="true" className="size-5" />}
            primaryValue="Valentina Rojas"
            secondaryValue="+56 9 5555 0128"
            status={<StatusBadge label={finished ? "Completed" : "On site"} variant="success" />}
            title="Operator"
          >
            <dl className="divide-y">
              <DetailRow label="Arrival time" value="18:12" />
              <DetailRow label="Status" value={finished ? "Shift completed" : "Operating"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Camera aria-hidden="true" className="size-5" />}
            primaryValue="Classic Booth"
            secondaryValue="Assigned production equipment"
            status={<StatusBadge label={finished ? "Offline" : "Operational"} variant={finished ? "neutral" : "success"} />}
            title="Equipment"
          >
            <dl className="divide-y">
              <DetailRow label="Camera" value="Sony A7 IV" />
              <DetailRow label="Printer" value="DNP RX1HS" />
              <DetailRow label="Current status" value={finished ? "Session finished" : paused ? "Standby" : "Active"} />
            </dl>
          </SmartCard>

          <SmartCard
            className="sm:row-span-2"
            icon={<Gauge aria-hidden="true" className="size-5" />}
            primaryValue={finished ? "Event totals" : "Live metrics"}
            secondaryValue="Temporary mock values"
            status={<StatusBadge label={finished ? "Final" : "Live"} variant={finished ? "neutral" : "info"} />}
            title="Event Metrics"
          >
            <dl className="divide-y">
              <DetailRow label="Printed Photos" value="184" />
              <DetailRow label="Digital Photos" value="247" />
              <DetailRow label="Remaining Paper" value="316 sheets" />
              <DetailRow label="Elapsed Time" value={finished ? "03:42:18" : paused ? "02:16:42 paused" : "02:16:42"} />
              <DetailRow label="Guests Served" value="126" />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Printer aria-hidden="true" className="size-5" />}
            primaryValue={incidentReported ? "Incident reported" : "Systems normal"}
            secondaryValue={incidentReported ? "Awaiting operator review" : "Camera and printer are responding"}
            status={<StatusBadge label={incidentReported ? "Attention" : "Healthy"} variant={incidentReported ? "warning" : "success"} />}
            title="Production Health"
          />

          <SmartCard
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            primaryValue="19:00"
            secondaryValue="Production started on schedule"
            title="Event Start"
          />
        </div>
      }
      timeline={null}
    />
  );
}
