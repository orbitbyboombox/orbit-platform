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
  const [{ data: rawProject }, { data: agreement }, { data: assignments }, { data: documents }, { data: quotation }, { data: assets }, { data: assetAssignments }, { data: staff }, { data: operatorAssignments }, { data: calendarSync }, { data: driveSync }, { data: payroll }, { data: profit }] = await Promise.all([
    client.from("projects").select("orbit_event_id,budget,contract,finance,operations,resources,status").eq("id", projectId).single(),
    client.from("agreements").select("id,status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("assignments").select("status,assignment_type,resources").eq("project_id", projectId).is("deleted_at", null),
    client.from("documents").select("document_type").eq("project_id", projectId).is("deleted_at", null),
    client.from("quotations").select("id,quotation_number,version,status,grand_total,official_price,final_customer_price,price_difference,created_at,pdf_storage_path,drive_file_id,gmail_draft_id").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("operational_assets").select("id,asset_code,asset_type,status,usage_counter,qr_key").is("deleted_at", null).order("asset_code"),
    client.from("asset_assignments").select("id,project_id,asset_id,assignment_status,projects(name,event_date,event_time)").eq("assignment_status", "ASSIGNED").is("deleted_at", null),
    client.from("staff").select("id,first_name,last_name,status,operational_group,capabilities").is("deleted_at", null).order("last_name"),
    client.from("assignments").select("id,project_id,staff_id,assignment_type,status,staff(first_name,last_name)").is("deleted_at", null),
    client.from("calendar_sync").select("status,external_event_id,external_url").eq("project_id", projectId).maybeSingle(),
    client.from("drive_sync").select("id,status").eq("project_id", projectId).eq("status", "CREATED").limit(1),
    client.from("event_staff_payments").select("id,status").eq("project_id", projectId).is("deleted_at", null).limit(1),
    client.from("profit_snapshots").select("id,status,operational_cost").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
  ]);
  const { data: priceHistory } = quotation ? await client.from("quotation_price_history").select("id,final_price,reason,created_at").eq("quotation_id", quotation.id).order("created_at", { ascending: false }) : { data: [] };
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
    lastQuotation: quotation ? `${quotation.quotation_number} · ${quotation.status} · ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(quotation.grand_total))}` : "Sin registro",
  };
  type ActiveAssetAssignment = { id: string; project_id: string; asset_id: string; projects: { name: string; event_date: string; event_time: string } };
  type StaffAssignment = { id: string; project_id: string; staff_id: string; assignment_type: "ASSEMBLY" | "OPERATOR" | "DISASSEMBLY"; status: string; staff: { first_name: string; last_name: string } };
  const activeAssets = (assetAssignments ?? []) as unknown as ActiveAssetAssignment[];
  const productionAssignments = (operatorAssignments ?? []) as unknown as StaffAssignment[];
  const operatorByProject = new Map(productionAssignments.filter((item) => item.assignment_type === "OPERATOR").map((item) => [item.project_id, `${item.staff.first_name} ${item.staff.last_name}`]));
  const equipment = {
    projectId, orbitEventId: rawProject?.orbit_event_id ?? `ORB-${projectId}`, projectType: typeLabel,
    assets: (assets ?? []).map((asset) => { const active = activeAssets.find((item) => item.asset_id === asset.id); return { id: asset.id, code: asset.asset_code, type: asset.asset_type, status: asset.status, usageCounter: asset.usage_counter, qrKey: asset.qr_key, current: active ? { assignmentId: active.id, projectName: active.project_id === projectId ? "Este evento" : active.projects.name, date: active.projects.event_date, time: active.projects.event_time?.slice(0, 5) ?? "Por confirmar", operator: operatorByProject.get(active.project_id) ?? "Sin asignar" } : undefined }; }),
    staff: (staff ?? []).filter((member) => member.status === "ACTIVE" && (member.operational_group === "CALYPSO" || member.operational_group === "GREEN")).map((member) => ({ id: member.id, name: `${member.first_name} ${member.last_name}`, group: member.operational_group as "CALYPSO" | "GREEN", capabilities: member.capabilities as ("ASSEMBLY" | "OPERATOR" | "DISASSEMBLY")[], status: member.status })),
    currentStaff: productionAssignments.filter((item) => item.project_id === projectId && ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"].includes(item.assignment_type)).map((item) => ({ id: item.id, staffId: item.staff_id, name: `${item.staff.first_name} ${item.staff.last_name}`, task: item.assignment_type, status: item.status })),
  };
  const portalStage = project.status === "Archived" ? "ARCHIVED" : project.status === "Completed" ? "GALLERY" : project.commercialStage === "Production" ? "LIVE_EVENT" : project.commercialStage === "Confirmed" ? "PREPARATION" : project.commercialStage === "Reserved" || project.commercialStage === "Waiting" ? "WAITING_PAYMENT" : project.commercialStage === "Quoting" ? "QUOTATION" : "COMMERCIAL_OPPORTUNITY";
  const currentProjectAssets = activeAssets.filter((item) => item.project_id === projectId).map((item) => (assets ?? []).find((asset) => asset.id === item.asset_id)).filter(Boolean);
  const operatorReady = productionAssignments.some((item) => item.project_id === projectId && item.assignment_type === "OPERATOR" && item.status !== "REJECTED");
  const totemReady = currentProjectAssets.some((asset) => asset?.asset_type === "TOTEM");
  const caseReady = currentProjectAssets.some((asset) => asset?.asset_type === "CASE");
  const paymentReady = ["APPROVED", "CONFIRMED", "PAID"].includes(String(finance.status ?? finance.paymentStatus ?? "")) || Number(finance.deposit ?? 0) > 0;
  const ready = (condition: boolean, yes: string, no: string, attention = false) => ({ state: condition ? "READY" as const : attention ? "ATTENTION" as const : "ACTION_REQUIRED" as const, detail: condition ? yes : no });
  const productionIntegration = {
    projectId,
    quotation: quotation ? (() => { const officialPrice=Number(quotation.official_price??quotation.grand_total); const finalCustomerPrice=Number(quotation.final_customer_price??quotation.grand_total); const difference=finalCustomerPrice-officialPrice; const operationalCost=Number(profit?.[0]?.operational_cost??0); const estimatedProfit=finalCustomerPrice-operationalCost; return { id: quotation.id, version: quotation.version, status: quotation.status, officialPrice, finalCustomerPrice, difference, discountPercentage:difference<0&&officialPrice>0?Math.abs(difference)/officialPrice*100:0, increasePercentage:difference>0&&officialPrice>0?difference/officialPrice*100:0, estimatedProfit, estimatedMarginPercentage:finalCustomerPrice===0?0:estimatedProfit/finalCustomerPrice*100, pdfReady: Boolean(quotation.pdf_storage_path), driveReady: Boolean(quotation.drive_file_id), gmailDraftReady: Boolean(quotation.gmail_draft_id), history:(priceHistory??[]).map((item)=>({id:item.id,finalPrice:Number(item.final_price),reason:item.reason??undefined,createdAt:item.created_at})) }; })() : undefined,
    calendar: { status: calendarSync?.status ?? "PENDING", googleEventId: calendarSync?.external_event_id ?? undefined, googleEventUrl: calendarSync?.external_url ?? undefined },
    readiness: [
      { label: "Cliente confirmado", ...ready(Boolean(project.client.name), "Cliente identificado.", "Falta información del cliente.") },
      { label: "Cotización aprobada", ...ready(quotation?.status === "ACCEPTED", "Cotización aprobada.", "La cotización requiere aprobación.") },
      { label: "Acuerdo firmado", ...ready(agreement?.status === "SIGNED", "Acuerdo firmado y bloqueado.", "El acuerdo aún no está firmado.") },
      { label: "Pago confirmado", ...ready(paymentReady, "Pago registrado.", "No existe un pago confirmado.") },
      { label: "Google Calendar", ...ready(calendarSync?.status === "SYNCHRONIZED", "Evento sincronizado.", "El evento no está sincronizado.", true) },
      { label: "Google Drive", ...ready(Boolean((driveSync ?? []).length || documents?.some((item) => item.document_type === "SIGNED_AGREEMENT" || item.document_type === "QUOTATION")), "Documentación disponible en Drive.", "Aún no existen documentos sincronizados.", true) },
      { label: "Operador asignado", ...ready(operatorReady, "Operador asignado.", "Falta asignar operador.") },
      { label: "Tótem asignado", ...ready(totemReady, "Tótem asignado.", "Falta asignar tótem.") },
      { label: "Case asignado", ...ready(caseReady, "Case asignado.", "Falta asignar case.") },
      { label: "Payroll listo", ...ready(Boolean((payroll ?? []).length), "Pago operacional calculado.", "Payroll pendiente.", true) },
      { label: "Profit listo", ...ready(Boolean((profit ?? []).length), "Rentabilidad calculada.", "Profit pendiente.", true) },
      { label: "Timeline listo", ...ready(timeline.length > 0, "Historial operacional activo.", "Aún no existe actividad registrada.", true) },
    ],
  };
  return <ProjectWorkspaceExperience {...experienceProps} activities={activities} equipment={equipment} eventDateIso={date} portalStage={portalStage} productionIntegration={productionIntegration} projectKey={projectId} score={project.score ?? 0} signing={{ agreementId: agreement?.id, status: agreement?.status ?? "PENDING" }} workspaceData={workspaceData} />;
}
