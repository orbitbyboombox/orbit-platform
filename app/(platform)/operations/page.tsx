import { CommandCenter, type CommandCenterProjectReadiness, type ProductionAssignment } from "@/features/operations/components";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OperationsPage() {
  const client = await createSupabaseServerClient();
  const { error: taskMaterializationError } = await client.rpc("materialize_scheduled_event_tasks");
  if (taskMaterializationError) throw taskMaterializationError;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const [allProjects, assignmentsResult, staffResult, assetsResult, assetAssignmentsResult, agreementsResult, evidenceResult, quotationsResult, calendarResult, driveResult, documentsResult, payrollResult, profitResult, timelineResult, rawProjectsResult, customersResult, tasksResult, receivablesResult] = await Promise.all([
    new SupabaseCustomerRepository(client).findAll(),
    client.from("assignments").select("id,project_id,staff_id,assignment_type,status,resources").is("deleted_at", null),
    client.from("staff").select("id,status,capabilities").eq("status", "ACTIVE").is("deleted_at", null),
    client.from("operational_assets").select("id,asset_type,status").is("deleted_at", null),
    client.from("asset_assignments").select("project_id,asset_id,assignment_status,operational_assets(asset_type)").eq("assignment_status", "ASSIGNED").is("deleted_at", null),
    client.from("agreements").select("id,project_id,status,created_at").order("created_at", { ascending: false }),
    client.from("agreement_evidence").select("agreement_id"),
    client.from("quotations").select("project_id,status,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
    client.from("calendar_sync").select("project_id,status"),
    client.from("drive_sync").select("project_id,status"),
    client.from("documents").select("project_id,document_type").is("deleted_at", null),
    client.from("event_staff_payments").select("project_id,status").is("deleted_at", null),
    client.from("profit_snapshots").select("project_id,revenue").is("deleted_at", null),
    client.from("timeline_events").select("project_id"),
    client.from("projects").select("id,customer_id,finance").is("deleted_at", null),
    client.from("customers").select("id,metadata").is("deleted_at", null),
    client.from("tasks").select("priority,status,due_at").is("deleted_at",null),
    client.from("accounts_receivable_projection").select("outstanding_balance,effective_status"),
  ]);

  const results = [assignmentsResult, staffResult, assetsResult, assetAssignmentsResult, agreementsResult, evidenceResult, quotationsResult, calendarResult, driveResult, documentsResult, payrollResult, profitResult, timelineResult, rawProjectsResult, customersResult, tasksResult, receivablesResult];
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  const assignments:ProductionAssignment[] = (assignmentsResult.data ?? []).map((item) => ({ id:item.id, projectId:item.project_id, staffId:item.staff_id, type:item.assignment_type, status:item.status, resources:(item.resources ?? {}) as Record<string,unknown> }));
  const staff = staffResult.data ?? [];
  const assets = assetsResult.data ?? [];
  const assetAssignments = (assetAssignmentsResult.data ?? []) as unknown as Array<{ project_id:string; asset_id:string; assignment_status:string; operational_assets:{asset_type:string}|null }>;
  const agreements = agreementsResult.data ?? [];
  const evidence = new Set((evidenceResult.data ?? []).map((item) => item.agreement_id));
  const quotations = quotationsResult.data ?? [];
  const calendar = calendarResult.data ?? [];
  const drive = driveResult.data ?? [];
  const documents = documentsResult.data ?? [];
  const payroll = payrollResult.data ?? [];
  const profit = profitResult.data ?? [];
  const timeline = timelineResult.data ?? [];
  const financeByProject = new Map((rawProjectsResult.data ?? []).map((item) => [item.id, (item.finance ?? {}) as Record<string, unknown>]));
  const certificationCustomers = new Set((customersResult.data ?? []).filter((item) => {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    return metadata.record_type === "SYSTEM_CERTIFICATION" || metadata.recordType === "QA_OPERATIONAL_CERTIFICATION" || typeof metadata.validation === "string";
  }).map((item) => item.id));
  const certificationProjects = new Set((rawProjectsResult.data ?? []).filter((item) => certificationCustomers.has(item.customer_id)).map((item) => item.id));
  const projects = allProjects.filter((project) => !certificationProjects.has(project.id));

  const readiness: CommandCenterProjectReadiness[] = projects.filter((project) => project.status !== "Archived").map((project) => {
    const agreement = agreements.find((item) => item.project_id === project.id);
    const quotation = quotations.find((item) => item.project_id === project.id);
    const projectAssets = assetAssignments.filter((item) => item.project_id === project.id);
    const finance = financeByProject.get(project.id) ?? {};
    const paymentReady = ["APPROVED", "CONFIRMED", "PAID"].includes(String(finance.status ?? finance.paymentStatus ?? "")) || Number(finance.deposit ?? 0) > 0;
    const state = (condition:boolean, attention=false) => condition ? "READY" as const : attention ? "ATTENTION" as const : "MISSING" as const;
    return {
      projectId: project.id,
      customerName: project.client.name,
      projectName: project.name,
      eventDate: project.event.date,
      eventTime: project.event.time,
      statuses: [
        { label: "Cliente", state: state(Boolean(project.client.name)) },
        { label: "Cotización", state: state(quotation?.status === "ACCEPTED") },
        { label: "Acuerdo", state: state(agreement?.status === "SIGNED") },
        { label: "Firma", state: state(Boolean(agreement && evidence.has(agreement.id))) },
        { label: "Calendar", state: state(calendar.some((item) => item.project_id === project.id && item.status === "SYNCHRONIZED"), true) },
        { label: "Drive", state: state(drive.some((item) => item.project_id === project.id && ["CREATED", "UPDATED"].includes(item.status)) || documents.some((item) => item.project_id === project.id), true) },
        { label: "Operador", state: state(assignments.some((item) => item.projectId === project.id && item.type === "OPERATOR" && item.status !== "REJECTED")) },
        { label: "Tótem", state: state(projectAssets.some((item) => item.operational_assets?.asset_type === "TOTEM")) },
        { label: "Case", state: state(projectAssets.some((item) => item.operational_assets?.asset_type === "CASE")) },
        { label: "Payroll", state: state(payroll.some((item) => item.project_id === project.id), true) },
        { label: "Profit", state: state(profit.some((item) => item.project_id === project.id), true) },
        { label: "Timeline", state: state(timeline.some((item) => item.project_id === project.id), true) },
      ],
      paymentReady,
    };
  });

  const todayProjectIds = new Set(projects.filter((project) => project.event.date === today).map((project) => project.id));
  const assignedToday = new Set(assignments.filter((item) => todayProjectIds.has(item.projectId) && item.type === "OPERATOR" && item.status !== "REJECTED").map((item) => item.staffId).filter(Boolean));
  const availableOperators = staff.filter((member) => Array.isArray(member.capabilities) && member.capabilities.includes("OPERATOR") && !assignedToday.has(member.id)).length;
  const availableTotems = assets.filter((asset) => asset.asset_type === "TOTEM" && asset.status === "AVAILABLE").length;
  const availableCases = assets.filter((asset) => asset.asset_type === "CASE" && asset.status === "AVAILABLE").length;
  const availablePrinters = assets.filter((asset) => asset.asset_type === "PRINTER" && asset.status === "AVAILABLE").length;
  const availableCameras = assets.filter((asset) => asset.asset_type === "CAMERA" && asset.status === "AVAILABLE").length;
  const openTasks=(tasksResult.data??[]).filter((task)=>!["COMPLETED","CANCELLED"].includes(task.status));
  const taskSummary={
    pending:openTasks.length,
    critical:openTasks.filter((task)=>task.priority==="CRITICAL").length,
    overdue:openTasks.filter((task)=>task.due_at&&new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago"}).format(new Date(task.due_at))<today).length,
    today:openTasks.filter((task)=>task.due_at&&new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago"}).format(new Date(task.due_at))===today).length,
  };
  const next15Events=projects.filter((project)=>{if(!project.event.date)return false;const days=Math.ceil((new Date(`${project.event.date}T12:00:00Z`).getTime()-Date.now())/86_400_000);return days>=0&&days<=15;}).length;
  const accountsReceivable=(receivablesResult.data??[]).filter((item)=>!["PAID","CANCELLED"].includes(item.effective_status)).reduce((sum,item)=>sum+Number(item.outstanding_balance??0),0);
  const monthKey=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
  const monthlyRevenue=(profitResult.data??[]).filter((item)=>projects.find((project)=>project.id===item.project_id)?.event.date.startsWith(monthKey)).reduce((sum,item)=>sum+Number((item as {revenue?:number|string}).revenue??0),0);

  return <CommandCenter availableCameras={availableCameras} availableCases={availableCases} availableOperators={availableOperators} availablePrinters={availablePrinters} availableTotems={availableTotems} executive={{next15Events,accountsReceivable,monthlyRevenue,monthlyGoal:0}} readiness={readiness} taskSummary={taskSummary} />;
}
