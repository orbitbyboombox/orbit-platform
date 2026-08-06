import { notFound } from "next/navigation";
import { ProjectHealth, ProjectType } from "@/features/projects/domain";
import { ProjectWorkspaceExperience } from "@/features/projects/components/project-workspace-experience";
import { SupabaseCustomerRepository, SupabaseTimelineRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const client = await createSupabaseServerClient();
  const projects = await new SupabaseCustomerRepository(client).findAll();
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) notFound();
  const timeline = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
    ? await new SupabaseTimelineRepository(client).findByProject(projectId)
    : [];
  const [{ data: rawProject }, { data: agreement }, { data: assignments }, { data: documents }] = await Promise.all([
    client.from("projects").select("budget,contract,finance,operations,resources,status").eq("id", projectId).single(),
    client.from("agreements").select("status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("assignments").select("status,assignment_type,resources").eq("project_id", projectId).is("deleted_at", null),
    client.from("documents").select("document_type").eq("project_id", projectId).is("deleted_at", null),
  ]);
  const services = query.services?.split(",").filter(Boolean) ?? project.services;
  const typeLabel = query.type ?? project.type;
  const date = query.date ?? project.event.date;
  const formattedDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  const experienceProps = { clientName: query.client ?? project.client.name, eventDate: formattedDate, eventTime: query.time ?? project.event.time, health: ProjectHealth.HEALTHY, location: [query.venue ?? project.event.location, query.city ?? project.event.city].filter(Boolean).join(", ") || "Lugar por confirmar", projectName: query.name ?? project.name, projectType: projectTypeByLabel[typeLabel] ?? ProjectType.OTHER, services };

  const activities = timeline.slice(0, 5).map((event) => ({ title: event.humanMessage, detail: `${event.actorLabel} · ${event.source}`, time: new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt)) }));
  const budget = (rawProject?.budget ?? {}) as Record<string, unknown>;
  const finance = (rawProject?.finance ?? {}) as Record<string, unknown>;
  const operations = (rawProject?.operations ?? {}) as Record<string, unknown>;
  const resources = (rawProject?.resources ?? {}) as Record<string, unknown>;
  const value = (source: Record<string, unknown>, key: string) => typeof source[key] === "string" || typeof source[key] === "number" ? String(source[key]) : "Sin registro";
  const workspaceData = {
    sale: value(budget, "sale"), balance: value(finance, "balance"), margin: value(budget, "margin"), deposit: value(finance, "deposit"),
    contractStatus: agreement?.status ?? "Sin acuerdo registrado", contractDate: agreement?.created_at ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(agreement.created_at)) : "Sin fecha",
    checklist: value(operations, "checklist"), operator: assignments?.find((item) => item.assignment_type === "OPERATOR")?.status ?? "Sin asignar", booth: value(resources, "booth"),
    gallery: documents?.some((item) => item.document_type === "GALLERY") ? "Disponible" : "No disponible", backup: documents?.some((item) => item.document_type === "BACKUP") ? "Disponible" : "No disponible",
    communication: project.lastCommunication ?? "Sin comunicaciones", commercialStage: project.stage ?? project.commercialStage,
  };
  const portalStage = project.status === "Archived" ? "ARCHIVED" : project.status === "Completed" ? "GALLERY" : project.commercialStage === "Production" ? "LIVE_EVENT" : project.commercialStage === "Confirmed" ? "PREPARATION" : project.commercialStage === "Reserved" || project.commercialStage === "Waiting" ? "WAITING_PAYMENT" : project.commercialStage === "Quoting" ? "QUOTATION" : "COMMERCIAL_OPPORTUNITY";
  return <ProjectWorkspaceExperience {...experienceProps} activities={activities} eventDateIso={date} portalStage={portalStage} projectKey={projectId} score={project.score ?? 0} workspaceData={workspaceData} />;
}
