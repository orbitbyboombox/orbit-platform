import { findMockProject } from "@/features/projects/data/mock-projects";
import { ProjectHealth, ProjectType } from "@/features/projects/domain";
import { ReservationExperience } from "@/features/reservations/components/reservation-experience";
import { PreparationExperience } from "@/features/operations/components/preparation-experience";
import { LiveEventExperience } from "@/features/operations/components/live-event-experience";
import { DeliveryExperience } from "@/features/projects/components/delivery-experience";
import { ProjectWorkspaceExperience } from "@/features/projects/components/project-workspace-experience";

export interface ProjectWorkspacePageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ name?: string; client?: string; type?: string; date?: string; time?: string; venue?: string; city?: string; services?: string; experience?: string }>;
}

const projectTypeByLabel: Readonly<Record<string, ProjectType>> = {
  Wedding: ProjectType.WEDDING,
  Corporate: ProjectType.CORPORATE,
  Birthday: ProjectType.BIRTHDAY,
  Private: ProjectType.PRIVATE,
  Other: ProjectType.OTHER,
};

export default async function ProjectWorkspacePage({ params, searchParams }: ProjectWorkspacePageProps) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = findMockProject(projectId);
  const services = query.services?.split(",").filter(Boolean) ?? project?.services ?? ["Classic"];
  const typeLabel = query.type ?? project?.type ?? "Other";
  const date = query.date ?? project?.event.date ?? "2027-09-14";
  const formattedDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  const experienceProps = { clientName: query.client ?? project?.client.name ?? "Cliente", eventDate: formattedDate, eventTime: query.time ?? project?.event.time ?? "19:00", health: ProjectHealth.HEALTHY, location: [query.venue ?? project?.event.location ?? "Lugar por confirmar", query.city ?? project?.event.city].filter(Boolean).join(", "), projectName: query.name ?? project?.name ?? "Espacio del proyecto", projectType: projectTypeByLabel[typeLabel] ?? ProjectType.OTHER, services };

  if (query.experience === "delivery") return <DeliveryExperience {...experienceProps} />;
  if (query.experience === "live") return <LiveEventExperience {...experienceProps} />;
  if (query.experience === "preparation") return <PreparationExperience {...experienceProps} />;
  if (query.experience === "reservation") return <ReservationExperience {...experienceProps} />;
  return <ProjectWorkspaceExperience {...experienceProps} portalStage="PREPARATION" projectKey={projectId} score={project?.score ?? 92} />;
}
