import {
  CalendarDays,
  Clock3,
  MapPin,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import {
  PROJECT_HEALTH_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  ProjectHealth,
  ProjectStatus,
  type ProjectType,
} from "@/features/projects/domain";

export interface ProjectHeaderProps {
  projectName: string;
  clientName: string;
  projectType: ProjectType;
  eventDate: string;
  eventTime: string;
  location: string;
  services: readonly string[];
  status: ProjectStatus;
  health: ProjectHealth;
}

const healthVariants: Record<ProjectHealth, StatusBadgeProps["variant"]> = {
  [ProjectHealth.HEALTHY]: "success",
  [ProjectHealth.ATTENTION]: "warning",
  [ProjectHealth.RISK]: "danger",
  [ProjectHealth.CRITICAL]: "danger",
};

const statusVariants: Record<ProjectStatus, StatusBadgeProps["variant"]> = {
  [ProjectStatus.LEAD]: "neutral",
  [ProjectStatus.INFORMATION_SENT]: "info",
  [ProjectStatus.RESERVATION_READY]: "info",
  [ProjectStatus.CONTRACT_PENDING]: "warning",
  [ProjectStatus.WAITING_DEPOSIT]: "warning",
  [ProjectStatus.CONFIRMED]: "success",
  [ProjectStatus.PRODUCTION]: "info",
  [ProjectStatus.EVENT]: "info",
  [ProjectStatus.DELIVERY]: "info",
  [ProjectStatus.CLOSED]: "neutral",
  [ProjectStatus.ARCHIVED]: "neutral",
};

interface ProjectDetail {
  label: string;
  value: string;
  icon: LucideIcon;
}

export function ProjectHeader({
  projectName,
  clientName,
  projectType,
  eventDate,
  eventTime,
  location,
  services,
  status,
  health,
}: ProjectHeaderProps) {
  const details: ProjectDetail[] = [
    { label: "Event date", value: eventDate, icon: CalendarDays },
    { label: "Event time", value: eventTime, icon: Clock3 },
    { label: "Location", value: location, icon: MapPin },
    { label: "Services", value: services.join(" + "), icon: Sparkles },
  ];

  return (
    <header className="rounded-xl border bg-card px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-8 lg:p-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Project</p>
            <StatusBadge label={PROJECT_TYPE_LABELS[projectType]} variant="neutral" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            {projectName}
          </h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted sm:text-base">
            <UserRound aria-hidden="true" className="size-4 shrink-0" />
            <span><span className="sr-only">Client: </span>{clientName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <StatusBadge label={PROJECT_STATUS_LABELS[status]} variant={statusVariants[status]} />
          <StatusBadge label={PROJECT_HEALTH_LABELS[health]} variant={healthVariants[health]} />
        </div>
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-6 border-t pt-7 sm:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:pt-8">
        {details.map(({ label, value, icon: Icon }) => (
          <div className="min-w-0" key={label}>
            <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </dt>
            <dd className="mt-2 break-words text-sm font-medium sm:text-base">{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
