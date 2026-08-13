import { notFound, redirect } from "next/navigation";
import { ProjectHealth, ProjectType } from "@/features/projects/domain";
import { ProjectWorkspaceExperience } from "@/features/projects/components/project-workspace-experience";
import {
  SupabaseCustomerRepository,
  SupabaseTimelineRepository,
} from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAndPersistRealEventCost } from "@/features/profit-engine";
import { loadFounderWorkspace } from "@/features/founder-workspace";
import { loadCrmCustomerOperations } from "@/features/crm/customer-operations.repository";

export interface ProjectWorkspacePageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    name?: string;
    client?: string;
    type?: string;
    date?: string;
    time?: string;
    venue?: string;
    city?: string;
    services?: string;
    experience?: string;
  }>;
}

const projectTypeByLabel: Readonly<Record<string, ProjectType>> = {
  Wedding: ProjectType.WEDDING,
  Corporate: ProjectType.CORPORATE,
  Birthday: ProjectType.BIRTHDAY,
  Private: ProjectType.PRIVATE,
  Other: ProjectType.OTHER,
};

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: ProjectWorkspacePageProps) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) redirect("/api/auth/session-expired");
  const founderWorkspace = await loadFounderWorkspace(client, auth.user.id);
  const { error: checklistBootstrapError } = await client.rpc(
    "ensure_event_checklist",
    { p_project_id: projectId },
  );
  if (checklistBootstrapError) throw checklistBootstrapError;
  let projects;
  try {
    projects = await new SupabaseCustomerRepository(client).findAll();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "PGRST303"
    ) {
      redirect("/api/auth/session-expired");
    }
    throw error;
  }
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) notFound();
  const realCost = await calculateAndPersistRealEventCost(client, projectId);
  const timeline =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      projectId,
    )
      ? await new SupabaseTimelineRepository(client).findByProject(projectId)
      : [];
  const [
    { data: rawProject },
    { data: agreement },
    { data: assignments },
    { data: documents },
    { data: quotation },
    { data: assets },
    { data: assetAssignments },
    { data: staff },
    { data: operatorAssignments },
    { data: calendarSync },
    { data: driveSync },
    { data: payroll },
    { data: profit },
    { data: invoice },
    { data: checklist },
    { data: estimatedCosts },
    { data: realCostOverrides },
    { data: profitabilityStatement },
    { data: staffRequests },
    { data: staffPublication },
  ] = await Promise.all([
    client
      .from("projects")
      .select(
        "customer_id,orbit_event_id,budget,contract,finance,operations,resources,status",
      )
      .eq("id", projectId)
      .single(),
    client
      .from("agreements")
      .select("id,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("assignments")
      .select("status,assignment_type,resources")
      .eq("project_id", projectId)
      .is("deleted_at", null),
    client
      .from("documents")
      .select(
        "id,document_type,storage_bucket,storage_path,drive_file_id,created_at",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("quotations")
      .select(
        "id,quotation_number,version,status,grand_total,transport_total,official_price,final_customer_price,price_difference,created_at,pdf_storage_path,drive_file_id,gmail_draft_id",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("operational_assets")
      .select("id,asset_code,asset_type,status,usage_counter,qr_key")
      .is("deleted_at", null)
      .order("asset_code"),
    client
      .from("asset_assignments")
      .select(
        "id,project_id,asset_id,assignment_status,projects(name,event_date,event_time)",
      )
      .eq("assignment_status", "ASSIGNED")
      .is("deleted_at", null),
    client
      .from("staff")
      .select(
        "id,first_name,last_name,role,status,operational_group,capabilities",
      )
      .is("deleted_at", null)
      .order("last_name"),
    client
      .from("assignments")
      .select(
        "id,project_id,staff_id,assignment_type,status,arrival_time,start_time,finish_time,assigned_vehicle,observations,staff(first_name,last_name),operational_assets(asset_code)",
      )
      .is("deleted_at", null),
    client
      .from("calendar_sync")
      .select("status,external_event_id,external_url")
      .eq("project_id", projectId)
      .maybeSingle(),
    client
      .from("drive_sync")
      .select("id,status,destination_key,external_folder_id,last_synced_at")
      .eq("project_id", projectId),
    client
      .from("event_staff_payments")
      .select(
        "id,status,tasks,settlement_status,paid_amount,paid_at,sii_receipt_status,original_assembly_payment,original_operator_payment,original_disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,assembly_payment,operator_payment,disassembly_payment,transport_bonus,parking_payment,total_internal_payment,staff(first_name,last_name)",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null),
    client
      .from("profit_snapshots")
      .select(
        "id,status,revenue,operational_cost,gross_margin,gross_margin_percent",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from("accounts_receivable_projection")
      .select(
        "id,invoice_number,amount,paid_amount,outstanding_balance,due_date,payment_term,days_remaining,effective_status,payment_history",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("event_checklists")
      .select(
        "id,status,event_checklist_items(id,item_key,category,label,position,mandatory,completed,completed_at),event_operational_milestones(milestone,occurred_at,notes)",
      )
      .eq("project_id", projectId)
      .single(),
    client
      .from("estimated_cost_sheets")
      .select(
        "status,paper,operator,assembly,disassembly,fuel,transport,scrapbook,magnets,pens,double_sided_tape,other_configured,total,calculated_at",
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    client
      .from("financial_cost_overrides")
      .select("category,estimated_value,edited_value,reason,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    client
      .from("financial_event_records")
      .select(
        "revenue,estimated_cost,real_cost,personnel_cost,operational_resources_cost,total_operational_cost,gross_profit,gross_margin,net_profit,net_margin,cost_breakdown,calculated_at",
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    client
      .from("staff_assignment_requests")
      .select("id,responsibility,status,requested_at,staff(first_name,last_name)")
      .eq("project_id", projectId)
      .eq("status", "PENDING")
      .order("requested_at"),
    client.from("staff_event_publications").select("published").eq("project_id",projectId).maybeSingle(),
  ]);
  const [{ data: settlementAdjustments, error: settlementAdjustmentError }, { data: settlementReimbursements, error: settlementReimbursementError }] = await Promise.all([
    client.from("event_staff_settlement_adjustments").select("id,settlement_id,reason,amount,comment,created_by,created_at").in("settlement_id",(payroll??[]).map(item=>item.id).concat("00000000-0000-0000-0000-000000000000")).order("created_at"),
    client.from("expenses").select("id,event_staff_settlement_id,category,total,status,occurred_on,approval_reason").eq("project_id",projectId).not("event_staff_settlement_id","is",null).is("deleted_at",null).neq("status","CANCELLED").order("occurred_on"),
  ]);
  if(settlementAdjustmentError)throw settlementAdjustmentError;if(settlementReimbursementError)throw settlementReimbursementError;
  const [
    { data: customer },
    { data: tasks },
    { data: communications },
    { data: serviceRows },
  ] = await Promise.all([
    client
      .from("customers")
      .select("full_name,phone,email,address,city,emergency_contact:metadata")
      .eq(
        "id",
        rawProject?.customer_id ?? "00000000-0000-0000-0000-000000000000",
      )
      .maybeSingle(),
    client
      .from("tasks")
      .select(
        "id,title,description,priority,status,due_at,created_at,completed_at,version,assigned_to,profiles!tasks_assigned_to_fkey(display_name)",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    client
      .from("communications")
      .select("id,channel,status,subject,thread_key,occurred_at")
      .eq("project_id", projectId)
      .order("occurred_at", { ascending: false }),
    client
      .from("project_services")
      .select("service_code,duration_hours,extras")
      .eq("project_id", projectId),
  ]);
  const { data: priceHistory } = quotation
    ? await client
        .from("quotation_price_history")
        .select("id,final_price,reason,created_at")
        .eq("quotation_id", quotation.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const services =
    query.services?.split(",").filter(Boolean) ?? project.services;
  const typeLabel = query.type ?? project.type;
  const date = query.date ?? project.event.date;
  const formattedDate = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

  const experienceProps = {
    clientName: query.client ?? project.client.name,
    eventDate: formattedDate,
    eventTime: query.time ?? project.event.time,
    health: ProjectHealth.HEALTHY,
    location:
      [query.venue ?? project.event.location, query.city ?? project.event.city]
        .filter(Boolean)
        .join(", ") || "Lugar por confirmar",
    projectName: query.name ?? project.name,
    projectType: projectTypeByLabel[typeLabel] ?? ProjectType.OTHER,
    services,
  };

  const activities = timeline.slice(0, 5).map((event) => ({
    title: event.humanMessage,
    detail: `${event.actorLabel} · ${event.source}`,
    time: new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(event.occurredAt)),
  }));
  const budget = (rawProject?.budget ?? {}) as Record<string, unknown>;
  const finance = (rawProject?.finance ?? {}) as Record<string, unknown>;
  const operations = (rawProject?.operations ?? {}) as Record<string, unknown>;
  const resources = (rawProject?.resources ?? {}) as Record<string, unknown>;
  const value = (source: Record<string, unknown>, key: string) =>
    typeof source[key] === "string" || typeof source[key] === "number"
      ? String(source[key])
      : "Sin registro";
  const workspaceData = {
    sale: value(budget, "sale"),
    balance: value(finance, "balance"),
    margin: value(budget, "margin"),
    deposit: value(finance, "deposit"),
    contractStatus: agreement?.status ?? "Sin acuerdo registrado",
    contractDate: agreement?.created_at
      ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(
          new Date(agreement.created_at),
        )
      : "Sin fecha",
    checklist: value(operations, "checklist"),
    operator:
      assignments?.find((item) => item.assignment_type === "OPERATOR")
        ?.status ?? "Sin asignar",
    booth: value(resources, "booth"),
    gallery: documents?.some((item) => item.document_type === "GALLERY")
      ? "Disponible"
      : "No disponible",
    backup: documents?.some((item) => item.document_type === "BACKUP")
      ? "Disponible"
      : "No disponible",
    communication: project.lastCommunication ?? "Sin comunicaciones",
    commercialStage: project.stage ?? project.commercialStage,
    lastQuotation: quotation
      ? `${quotation.quotation_number} · ${quotation.status} · ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(quotation.grand_total))}`
      : "Sin registro",
  };
  type ActiveAssetAssignment = {
    id: string;
    project_id: string;
    asset_id: string;
    projects: { name: string; event_date: string; event_time: string };
  };
  type StaffAssignment = {
    id: string;
    project_id: string;
    staff_id: string;
    assignment_type: string;
    status: string;
    arrival_time: string | null;
    start_time: string | null;
    finish_time: string | null;
    assigned_vehicle: string | null;
    observations: string | null;
    staff: { first_name: string; last_name: string };
    operational_assets: { asset_code: string } | null;
  };
  const activeAssets = (assetAssignments ??
    []) as unknown as ActiveAssetAssignment[];
  const productionAssignments = (operatorAssignments ??
    []) as unknown as StaffAssignment[];
  const operatorByProject = new Map(
    productionAssignments
      .filter((item) => item.assignment_type === "OPERATOR")
      .map((item) => [
        item.project_id,
        `${item.staff.first_name} ${item.staff.last_name}`,
      ]),
  );
  const equipment = {
    projectId,
    orbitEventId: rawProject?.orbit_event_id ?? `ORB-${projectId}`,
    projectType: typeLabel,
    assets: (assets ?? []).map((asset) => {
      const active = activeAssets.find((item) => item.asset_id === asset.id);
      return {
        id: asset.id,
        code: asset.asset_code,
        type: asset.asset_type,
        status: asset.status,
        usageCounter: asset.usage_counter,
        qrKey: asset.qr_key,
        current: active
          ? {
              assignmentId: active.id,
              projectName:
                active.project_id === projectId
                  ? "Este evento"
                  : active.projects.name,
              date: active.projects.event_date,
              time: active.projects.event_time?.slice(0, 5) ?? "Por confirmar",
              operator:
                operatorByProject.get(active.project_id) ?? "Sin asignar",
            }
          : undefined,
      };
    }),
    staff: (staff ?? [])
      .filter(
        (member) =>
          member.status === "ACTIVE" &&
          (member.operational_group === "CALYPSO" ||
            member.operational_group === "GREEN"),
      )
      .map((member) => ({
        id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        group: member.operational_group as "CALYPSO" | "GREEN",
        capabilities: member.capabilities as (
          | "ASSEMBLY"
          | "OPERATOR"
          | "DISASSEMBLY"
        )[],
        status: member.status,
      })),
    currentStaff: productionAssignments
      .filter(
        (item) =>
          item.project_id === projectId &&
          ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"].includes(
            item.assignment_type,
          ),
      )
      .map((item) => ({
        id: item.id,
        staffId: item.staff_id,
        name: `${item.staff.first_name} ${item.staff.last_name}`,
        task: item.assignment_type as "ASSEMBLY" | "OPERATOR" | "DISASSEMBLY",
        status: item.status,
      })),
  };
  const currentStaffIds = productionAssignments
    .filter((item) => item.project_id === projectId)
    .map((item) => item.staff_id);
  const reviewSelect =
    "id,project_id,venue_name,venue_city,general_rating,customer_experience,operational_experience,venue_knowledge,customer_knowledge,lessons_repeat,lessons_avoid,recommendations,created_at,projects(name)";
  const [
    currentReviewResult,
    customerKnowledgeResult,
    venueKnowledgeResult,
    staffKnowledgeResult,
  ] = await Promise.all([
    client
      .from("experience_reviews")
      .select("id,general_rating,created_at")
      .eq("project_id", projectId)
      .maybeSingle(),
    client
      .from("experience_reviews")
      .select(reviewSelect)
      .eq(
        "customer_id",
        rawProject?.customer_id ?? "00000000-0000-0000-0000-000000000000",
      )
      .neq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(8),
    client
      .from("experience_reviews")
      .select(reviewSelect)
      .eq("venue_name", project.event.location)
      .neq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(8),
    currentStaffIds.length
      ? client
          .from("experience_review_staff")
          .select(`review_id,experience_reviews(${reviewSelect})`)
          .in("staff_id", currentStaffIds)
          .limit(12)
      : Promise.resolve({ data: [] }),
  ]);
  const portalStage =
    project.status === "Archived"
      ? "ARCHIVED"
      : project.status === "Completed"
        ? "GALLERY"
        : project.commercialStage === "Production"
          ? "LIVE_EVENT"
          : project.commercialStage === "Confirmed"
            ? "PREPARATION"
            : project.commercialStage === "Reserved" ||
                project.commercialStage === "Waiting"
              ? "WAITING_PAYMENT"
              : project.commercialStage === "Quoting"
                ? "QUOTATION"
                : "COMMERCIAL_OPPORTUNITY";
  const currentProjectAssets = activeAssets
    .filter((item) => item.project_id === projectId)
    .map((item) => (assets ?? []).find((asset) => asset.id === item.asset_id))
    .filter(Boolean);
  const operatorReady = productionAssignments.some(
    (item) =>
      item.project_id === projectId &&
      item.assignment_type === "OPERATOR" &&
      item.status !== "REJECTED",
  );
  const totemReady = currentProjectAssets.some(
    (asset) => asset?.asset_type === "TOTEM",
  );
  const caseReady = currentProjectAssets.some(
    (asset) => asset?.asset_type === "CASE",
  );
  const paymentReady =
    ["APPROVED", "CONFIRMED", "PAID"].includes(
      String(finance.status ?? finance.paymentStatus ?? ""),
    ) || Number(finance.deposit ?? 0) > 0;
  const ready = (
    condition: boolean,
    yes: string,
    no: string,
    attention = false,
  ) => ({
    state: condition
      ? ("READY" as const)
      : attention
        ? ("ATTENTION" as const)
        : ("ACTION_REQUIRED" as const),
    detail: condition ? yes : no,
  });
  const productionIntegration = {
    projectId,
    quotation: quotation
      ? (() => {
          const officialPrice = Number(
            quotation.official_price ?? quotation.grand_total,
          );
          const finalCustomerPrice = Number(
            quotation.final_customer_price ?? quotation.grand_total,
          );
          const difference = finalCustomerPrice - officialPrice;
          const operationalCost = Number(profit?.[0]?.operational_cost ?? 0);
          const estimatedProfit = finalCustomerPrice - operationalCost;
          return {
            id: quotation.id,
            version: quotation.version,
            status: quotation.status,
            officialPrice,
            finalCustomerPrice,
            difference,
            discountPercentage:
              difference < 0 && officialPrice > 0
                ? (Math.abs(difference) / officialPrice) * 100
                : 0,
            increasePercentage:
              difference > 0 && officialPrice > 0
                ? (difference / officialPrice) * 100
                : 0,
            estimatedProfit,
            estimatedMarginPercentage:
              finalCustomerPrice === 0
                ? 0
                : (estimatedProfit / finalCustomerPrice) * 100,
            pdfReady: Boolean(quotation.pdf_storage_path),
            driveReady: Boolean(quotation.drive_file_id),
            gmailDraftReady: Boolean(quotation.gmail_draft_id),
            history: (priceHistory ?? []).map((item) => ({
              id: item.id,
              finalPrice: Number(item.final_price),
              reason: item.reason ?? undefined,
              createdAt: item.created_at,
            })),
          };
        })()
      : undefined,
    calendar: {
      status: calendarSync?.status ?? "PENDING",
      googleEventId: calendarSync?.external_event_id ?? undefined,
      googleEventUrl: calendarSync?.external_url ?? undefined,
    },
    readiness: [
      {
        label: "Cliente confirmado",
        ...ready(
          Boolean(project.client.name),
          "Cliente identificado.",
          "Falta información del cliente.",
        ),
      },
      {
        label: "Cotización aprobada",
        ...ready(
          quotation?.status === "ACCEPTED",
          "Cotización aprobada.",
          "La cotización requiere aprobación.",
        ),
      },
      {
        label: "Acuerdo firmado",
        ...ready(
          agreement?.status === "SIGNED",
          "Acuerdo firmado y bloqueado.",
          "El acuerdo aún no está firmado.",
        ),
      },
      {
        label: "Pago confirmado",
        ...ready(
          paymentReady,
          "Pago registrado.",
          "No existe un pago confirmado.",
        ),
      },
      {
        label: "Google Calendar",
        ...ready(
          calendarSync?.status === "SYNCHRONIZED",
          "Evento sincronizado.",
          "El evento no está sincronizado.",
          true,
        ),
      },
      {
        label: "Google Drive",
        ...ready(
          Boolean(
            (driveSync ?? []).length ||
              documents?.some(
                (item) =>
                  item.document_type === "SIGNED_AGREEMENT" ||
                  item.document_type === "QUOTATION",
              ),
          ),
          "Documentación disponible en Drive.",
          "Aún no existen documentos sincronizados.",
          true,
        ),
      },
      {
        label: "Operador asignado",
        ...ready(
          operatorReady,
          "Operador asignado.",
          "Falta asignar operador.",
        ),
      },
      {
        label: "Tótem asignado",
        ...ready(totemReady, "Tótem asignado.", "Falta asignar tótem."),
      },
      {
        label: "Case asignado",
        ...ready(caseReady, "Case asignado.", "Falta asignar case."),
      },
      {
        label: "Payroll listo",
        ...ready(
          Boolean((payroll ?? []).length),
          "Pago operacional calculado.",
          "Payroll pendiente.",
          true,
        ),
      },
      {
        label: "Profit listo",
        ...ready(
          Boolean((profit ?? []).length),
          "Rentabilidad calculada.",
          "Profit pendiente.",
          true,
        ),
      },
      {
        label: "Timeline listo",
        ...ready(
          timeline.length > 0,
          "Historial operacional activo.",
          "Aún no existe actividad registrada.",
          true,
        ),
      },
      {
        label: "Checklist operacional",
        ...ready(
          checklist?.status === "READY" || checklist?.status === "COMPLETED",
          "Controles obligatorios completos.",
          "El checklist operacional tiene controles pendientes.",
          true,
        ),
      },
    ],
  };
  const event360 = {
    orbitEventId: rawProject?.orbit_event_id ?? `ORB-${projectId}`,
    status: rawProject?.status ?? project.status,
    customer: {
      phone: customer?.phone ?? project.client.phone,
      email: customer?.email ?? project.client.email,
      address: customer?.address ?? "Sin dirección registrada",
      city: customer?.city ?? project.event.city,
      emergencyContact:
        typeof customer?.emergency_contact === "object" &&
        customer.emergency_contact &&
        "emergencyContact" in customer.emergency_contact
          ? String(customer.emergency_contact.emergencyContact)
          : "Sin contacto de emergencia",
    },
    services: (serviceRows ?? []).map((item) => ({
      code: item.service_code,
      duration: item.duration_hours
        ? `${item.duration_hours} horas`
        : "Duración por confirmar",
      extras: Array.isArray(item.extras) ? item.extras.map(String) : [],
    })),
    tasks: (tasks ?? []).map((item) => ({
      ...item,
      assignedUser: Array.isArray(item.profiles)
        ? item.profiles[0]?.display_name
        : (item.profiles as { display_name?: string } | null)?.display_name,
    })),
    timeline: timeline.map((event) => ({
      id: event.id,
      message: event.humanMessage,
      actor: event.actorLabel,
      source: event.source,
      occurredAt: event.occurredAt,
    })),
    documents: (documents ?? []).map((item) => ({
      id: item.id,
      type: item.document_type,
      href: item.drive_file_id
        ? `https://drive.google.com/open?id=${item.drive_file_id}`
        : undefined,
      createdAt: item.created_at,
    })),
    google: {
      calendarStatus: calendarSync?.status ?? "PENDING",
      calendarUrl: calendarSync?.external_url ?? undefined,
      driveStatus: (driveSync ?? []).some((item) => item.status === "ERROR")
        ? "ERROR"
        : (driveSync ?? []).some((item) => item.status === "SYNCING")
          ? "SYNCING"
          : (driveSync ?? []).length
            ? "CONNECTED"
            : "PENDING",
      driveLastSyncedAt: (driveSync ?? [])
        .map((item) => item.last_synced_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1),
      driveUrl: (() => {
        const folder = (driveSync ?? []).find(
          (item) =>
            item.destination_key.split("/").length === 4 &&
            item.external_folder_id,
        );
        return folder?.external_folder_id
          ? `https://drive.google.com/drive/folders/${folder.external_folder_id}`
          : undefined;
      })(),
      gmailStatus:
        communications?.find((item) => item.channel === "GMAIL")?.status ??
        "PENDING",
      gmailThread: communications?.find((item) => item.channel === "GMAIL")
        ?.thread_key,
    },
    payroll: (payroll ?? []).map((item) => ({
      staff: Array.isArray(item.staff)
        ? `${item.staff[0]?.first_name ?? ""} ${item.staff[0]?.last_name ?? ""}`.trim()
        : "Staff",
      assembly: Number(item.assembly_payment),
      operator: Number(item.operator_payment),
      disassembly: Number(item.disassembly_payment),
      transport: Number(item.transport_bonus),
      parking: Number(item.parking_payment),
      total: Number(item.total_internal_payment),
      status: item.status,
    })),
    profit: realCost,
    estimatedCosts: estimatedCosts
      ? {
          status: estimatedCosts.status,
          paper: Number(estimatedCosts.paper),
          operator: Number(estimatedCosts.operator),
          assembly: Number(estimatedCosts.assembly),
          disassembly: Number(estimatedCosts.disassembly),
          fuel: Number(estimatedCosts.fuel),
          transport: Number(estimatedCosts.transport),
          scrapbook: Number(estimatedCosts.scrapbook),
          magnets: Number(estimatedCosts.magnets),
          pens: Number(estimatedCosts.pens),
          doubleSidedTape: Number(estimatedCosts.double_sided_tape),
          other: Number(estimatedCosts.other_configured),
          total: Number(estimatedCosts.total),
          calculatedAt: estimatedCosts.calculated_at,
        }
      : undefined,
    realCosts: estimatedCosts
      ? (() => {
          const definitions = [
            ["OPERATOR", "Operador", Number(estimatedCosts.operator)],
            ["ASSEMBLY", "Montaje", Number(estimatedCosts.assembly)],
            ["DISASSEMBLY", "Desmontaje", Number(estimatedCosts.disassembly)],
            ["FUEL", "Combustible", Number(estimatedCosts.fuel)],
            ["TRANSPORT", "Transporte", Number(estimatedCosts.transport)],
            ["PARKING", "Estacionamiento", 0],
            ["TOLLS", "Peajes", 0],
            ["MEALS", "Alimentación", 0],
            ["HOTEL", "Hotel", 0],
            ["SCRAPBOOK", "Scrapbook", Number(estimatedCosts.scrapbook)],
            ["MAGNETS", "Imanes", Number(estimatedCosts.magnets)],
            [
              "OTHER_OPERATIONAL",
              "Otros costos operacionales",
              Number(estimatedCosts.other_configured),
            ],
          ] as const;
          const latest = new Map<
            string,
            {
              category: string;
              edited_value: number;
              reason: string;
              created_at: string;
            }
          >();
          for (const row of realCostOverrides ?? [])
            if (!latest.has(row.category)) latest.set(row.category, row);
          const items = definitions.map(([category, label, estimated]) => {
            const row = latest.get(category);
            return {
              category,
              label,
              estimated,
              real: row ? Number(row.edited_value) : estimated,
              reason: row?.reason,
              updatedAt: row?.created_at,
            };
          });
          return {
            paper: Number(estimatedCosts.paper),
            items,
            estimatedTotal: Number(estimatedCosts.total),
            realTotal:
              Number(estimatedCosts.paper) +
              items.reduce((sum, item) => sum + item.real, 0),
          };
        })()
      : undefined,
    profitability: profitabilityStatement
      ? (() => {
          const revenue = Number(profitabilityStatement.revenue),
            estimated = Number(profitabilityStatement.estimated_cost),
            real = Number(profitabilityStatement.real_cost),
            personnel = Number(profitabilityStatement.personnel_cost),
            resources = Number(
              profitabilityStatement.operational_resources_cost,
            ),
            margin = Number(profitabilityStatement.net_margin);
          return {
            revenue: { finalSalePrice: revenue },
            estimated: { total: estimated },
            real: {
              ...(profitabilityStatement.cost_breakdown as Record<
                string,
                number
              >),
              personnelCost: personnel,
              operationalResourcesCost: resources,
              totalOperationalCost: Number(
                profitabilityStatement.total_operational_cost,
              ),
              total: real,
            },
            profitability: {
              grossRevenue: revenue,
              estimatedCost: estimated,
              realCost: real,
              operationalCost: real,
              grossProfit: Number(profitabilityStatement.gross_profit),
              netProfit: Number(profitabilityStatement.net_profit),
              margin,
            },
            variance: {
              amount: real - estimated,
              percentage: estimated
                ? ((real - estimated) / estimated) * 100
                : 0,
              reason: "Motor de Costos Operacionales",
            },
            classification: (margin >= 40
              ? "HIGHLY_PROFITABLE"
              : margin >= 20
                ? "NORMAL"
                : "LOW_MARGIN") as
              | "HIGHLY_PROFITABLE"
              | "NORMAL"
              | "LOW_MARGIN",
            createdAt: profitabilityStatement.calculated_at,
          };
        })()
      : undefined,
    receivable: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: Number(invoice.amount),
          paidAmount: Number(invoice.paid_amount),
          outstandingBalance: Number(invoice.outstanding_balance),
          dueDate: invoice.due_date,
          paymentTerm: invoice.payment_term,
          daysRemaining: invoice.days_remaining,
          status: invoice.effective_status,
          movements: (Array.isArray(invoice.payment_history)
            ? invoice.payment_history
            : []
          ).map((movement) => ({
            id: String(movement.id),
            amount: Number(movement.amount),
            paidAt: String(movement.paidAt),
            method: String(movement.method ?? ""),
            reason: String(movement.reason ?? ""),
            type: String(movement.type ?? "PAYMENT"),
            receiptPath: movement.receiptPath
              ? String(movement.receiptPath)
              : null,
          })),
        }
      : undefined,
    checklist: (() => {
      const items = (checklist?.event_checklist_items ?? []).sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.position - b.position,
      );
      const mandatory = items.filter((x) => x.mandatory).length;
      const completed = items.filter((x) => x.mandatory && x.completed).length;
      return {
        id: checklist?.id ?? "",
        status: checklist?.status ?? "IN_PROGRESS",
        items: items.map((x) => ({
          id: x.id,
          key: x.item_key,
          category: x.category,
          label: x.label,
          position: x.position,
          mandatory: x.mandatory,
          completed: x.completed,
          completedAt: x.completed_at,
        })),
        milestones: (checklist?.event_operational_milestones ?? []).map(
          (x) => ({
            milestone: x.milestone,
            occurredAt: x.occurred_at,
            notes: x.notes,
          }),
        ),
        completed,
        mandatory,
        progress: mandatory ? Math.round((completed / mandatory) * 100) : 0,
      };
    })(),
    experienceReview: {
      existing: currentReviewResult.data
        ? {
            id: currentReviewResult.data.id,
            rating: currentReviewResult.data.general_rating,
            createdAt: currentReviewResult.data.created_at,
          }
        : undefined,
      knowledge: mergeExperienceKnowledge([
        ...(customerKnowledgeResult.data ?? []),
        ...(venueKnowledgeResult.data ?? []),
        ...(staffKnowledgeResult.data ?? []).flatMap((item) =>
          Array.isArray(item.experience_reviews)
            ? item.experience_reviews
            : item.experience_reviews
              ? [item.experience_reviews]
              : [],
        ),
      ]),
    },
    staffAssignments: {
      projectId,
      published: staffPublication?.published ?? false,
      settlements: (payroll ?? []).filter((item)=>item.status!=="CANCELLED").map((item)=>{const adjustments=(settlementAdjustments??[]).filter(value=>value.settlement_id===item.id);const reimbursements=(settlementReimbursements??[]).filter(value=>value.event_staff_settlement_id===item.id);const originalOperator=Number(item.original_operator_payment??item.automatic_operator_payment??item.operator_payment),originalAssembly=Number(item.original_assembly_payment??item.automatic_assembly_payment??item.assembly_payment),originalDisassembly=Number(item.original_disassembly_payment??item.automatic_disassembly_payment??item.disassembly_payment),originalNet=originalOperator+originalAssembly+originalDisassembly,adjustmentTotal=adjustments.reduce((sum,value)=>sum+Number(value.amount),0),reimbursementTotal=reimbursements.reduce((sum,value)=>sum+Number(value.total),0),finalAmount=originalNet+adjustmentTotal+reimbursementTotal,paid=Number(item.paid_amount);return{id:item.id,staffName:Array.isArray(item.staff)?`${item.staff[0]?.first_name??""} ${item.staff[0]?.last_name??""}`.trim():"Staff",roles:item.tasks??[],originalOperator,originalAssembly,originalDisassembly,originalNet,adjustmentTotal,reimbursementTotal,finalAmount,paid,remaining:Math.max(0,finalAmount-paid),settlementStatus:item.settlement_status,paidAt:item.paid_at??"",receiptStatus:item.sii_receipt_status,adjustments:adjustments.map(value=>({id:value.id,reason:value.reason,amount:Number(value.amount),comment:value.comment,createdAt:value.created_at,founder:"Founder"})),reimbursements:reimbursements.map(value=>{let description="Reembolso operacional";try{const metadata=JSON.parse(value.approval_reason??"{}")as{description?:string};description=metadata.description??description}catch{}return{id:value.id,category:value.category,description,amount:Number(value.total),status:value.status,date:value.occurred_on}})}}),
      requests: (staffRequests ?? []).map((request) => {
        const member = Array.isArray(request.staff) ? request.staff[0] : request.staff;
        return { id: request.id, staffName: member ? `${member.first_name} ${member.last_name}` : "Staff", responsibility: request.responsibility, requestedAt: request.requested_at };
      }),
      assignments: productionAssignments
        .filter((item) => item.project_id === projectId)
        .map((item) => ({
          id: item.id,
          staffId: item.staff_id,
          staffName: `${item.staff.first_name} ${item.staff.last_name}`,
          role: item.assignment_type,
          status: item.status,
          arrivalTime: item.arrival_time?.slice(0, 5) ?? "",
          startTime: item.start_time?.slice(0, 5) ?? "",
          finishTime: item.finish_time?.slice(0, 5) ?? "",
          vehicleId: item.assigned_vehicle ?? "",
          vehicleName: item.operational_assets?.asset_code ?? "",
          observations: item.observations ?? "",
        })),
      staff: (staff ?? [])
        .filter((member) => member.status === "ACTIVE")
        .map((member) => ({
          id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          role: member.role,
          capabilities: member.capabilities ?? [],
        })),
      vehicles: (assets ?? [])
        .filter(
          (asset) =>
            asset.asset_type === "VEHICLE" && asset.status === "AVAILABLE",
        )
        .map((asset) => ({ id: asset.id, name: asset.asset_code })),
    },
  };
  const eventControlOperations = (await loadCrmCustomerOperations(client, [projectId]))[0];
  if (!eventControlOperations) notFound();
  const primaryService = (serviceRows ?? [])[0];
  const eventControl = {
    event: {
      id: projectId,
      projectId,
      orbitEventId: rawProject?.orbit_event_id ?? `ORB-${projectId}`,
      type: typeLabel,
      date,
      time: experienceProps.eventTime,
      status: rawProject?.status ?? project.status,
      name: experienceProps.projectName,
      location: project.event.location,
      eventAddress: typeof operations.eventAddress === "string" ? operations.eventAddress : null,
      municipality: project.event.city,
      service: primaryService?.service_code ?? "",
      duration: primaryService?.duration_hours ?? null,
      boothQuantity: Number(operations.boothQuantity ?? 1),
      transport: Number(quotation?.transport_total ?? 0),
      extras: Array.isArray(primaryService?.extras) ? primaryService.extras.map(String) : [],
      appliedPrice: Number(quotation?.final_customer_price ?? quotation?.grand_total ?? 0),
    },
    operations: eventControlOperations,
  };
  return (
    <ProjectWorkspaceExperience
      {...experienceProps}
      activities={activities}
      equipment={equipment}
      event360={event360}
      eventControl={eventControl}
      eventDateIso={date}
      portalStage={portalStage}
      productionIntegration={productionIntegration}
      projectKey={projectId}
      score={project.score ?? 0}
      signing={{
        agreementId: agreement?.id,
        status: agreement?.status ?? "PENDING",
      }}
      workspaceData={workspaceData}
      workspacePreferences={founderWorkspace}
    />
  );
}

function mergeExperienceKnowledge(rows: readonly Record<string, unknown>[]) {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const projects = Array.isArray(row.projects)
      ? row.projects[0]
      : (row.projects as { name?: string } | undefined);
    return [
      {
        id,
        eventName: projects?.name ?? "Evento anterior",
        venue: [row.venue_name, row.venue_city].filter(Boolean).join(" · "),
        rating: Number(row.general_rating),
        customerExperience: String(row.customer_experience ?? ""),
        operationalExperience: String(row.operational_experience ?? ""),
        venueKnowledge: String(row.venue_knowledge ?? ""),
        customerKnowledge: String(row.customer_knowledge ?? ""),
        repeat: String(row.lessons_repeat ?? ""),
        avoid: String(row.lessons_avoid ?? ""),
        recommendations: String(row.recommendations ?? ""),
        createdAt: String(row.created_at),
      },
    ];
  });
}
