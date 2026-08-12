import {type ExecutiveControlData,type CommandCenterProjectReadiness,type ProductionAssignment} from "@/features/operations/components";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFinancialTruth } from "@/features/business-engine";
import {FounderWorkspaceExperience,loadFounderWorkspace,type WorkspaceValues} from "@/features/founder-workspace";
import {OperationsPlanningBoard,OperationsStaffPortalControl,type PlanningEvent,type PlanningRequest} from "@/features/operations/operations-planning-board";

export default async function OperationsPage() {
  const client = await createSupabaseServerClient();
  const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Sesión requerida.");
  const founderWorkspace=await loadFounderWorkspace(client,auth.user.id);
  const { error: taskMaterializationError } = await client.rpc("materialize_scheduled_event_tasks");
  if (taskMaterializationError) throw taskMaterializationError;
  const financialTruth = await loadFinancialTruth(client);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const [allProjects, assignmentsResult, staffResult, assetsResult, assetAssignmentsResult, agreementsResult, evidenceResult, quotationsResult, calendarResult, driveResult, documentsResult, payrollResult, profitResult, timelineResult, rawProjectsResult, customersResult, tasksResult, receivablesResult, expensesResult,portalResult,vehicleEventsResult,publicationsResult,staffRequestsResult] = await Promise.all([
    new SupabaseCustomerRepository(client).findAll(),
    client.from("assignments").select("id,project_id,staff_id,assignment_type,status,resources,staff(first_name,last_name)").is("deleted_at", null),
    client.from("staff").select("id,first_name,last_name,status,capabilities").eq("status", "ACTIVE").is("deleted_at", null),
    client.from("operational_assets").select("id,asset_type,status").is("deleted_at", null),
    client.from("asset_assignments").select("project_id,asset_id,assignment_status,operational_assets(asset_type)").eq("assignment_status", "ASSIGNED").is("deleted_at", null),
    client.from("agreements").select("id,project_id,status,created_at").order("created_at", { ascending: false }),
    client.from("agreement_evidence").select("agreement_id"),
    client.from("quotations").select("project_id,status,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
    client.from("calendar_sync").select("project_id,status"),
    client.from("drive_sync").select("project_id,status"),
    client.from("documents").select("project_id,document_type").is("deleted_at", null),
    client.from("event_staff_payments").select("id,project_id,staff_id,total_internal_payment,operator_payment,assembly_payment,disassembly_payment,status").is("deleted_at", null),
    Promise.resolve({data:financialTruth,error:null}),
    client.from("timeline_events").select("project_id"),
    client.from("projects").select("id,customer_id,name,project_type,event_date,event_time,location,city,operations,finance,customers(full_name),project_services(service_code,duration_hours)").is("deleted_at", null),
    client.from("customers").select("id,metadata").is("deleted_at", null),
    client.from("tasks").select("priority,status,due_at").is("deleted_at",null),
    client.from("accounts_receivable_projection").select("project_id,amount,paid_amount,outstanding_balance,effective_status,due_date,customer_type"),
    client.from("expenses").select("occurred_on,total,status").is("deleted_at", null),
    client.from("customer_portal_tokens").select("project_id,revoked_at"),
    client.from("event_vehicle_assignments").select("project_id,asset_id,status,operational_assets(asset_code)").is("deleted_at",null),
    client.from("staff_event_publications").select("project_id,published"),
    client.from("staff_assignment_requests").select("id,project_id,responsibility,requested_at,staff(first_name,last_name),projects(name,event_date,project_services(service_code),customers(full_name))").eq("status","PENDING").order("requested_at",{ascending:true}),
  ]);

  const results = [assignmentsResult, staffResult, assetsResult, assetAssignmentsResult, agreementsResult, evidenceResult, quotationsResult, calendarResult, driveResult, documentsResult, payrollResult, profitResult, timelineResult, rawProjectsResult, customersResult, tasksResult, receivablesResult, expensesResult,portalResult,vehicleEventsResult,publicationsResult,staffRequestsResult];
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
  const profit = financialTruth;
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
        { label: "Profit", state: state(profit.some((item) => item.projectId === project.id), true) },
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
  void [availableTotems,availableCases,availablePrinters,availableCameras];
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
  const monthlyRevenue=financialTruth.filter((item)=>item.status==="CONFIRMED"&&item.eventDate?.startsWith(monthKey)).reduce((sum,item)=>sum+item.revenue,0);
  const monthlyExpenses=(expensesResult.data??[]).filter((item)=>item.occurred_on?.startsWith(monthKey)).reduce((sum,item)=>sum+Number(item.total??0),0);
  const availableVehicles=assets.filter((asset)=>asset.asset_type==="VEHICLE"&&asset.status==="AVAILABLE").length;
  const activeAssignments=assignments.filter(item=>!["CANCELLED","REJECTED","COMPLETED"].includes(item.status));
  const countBySkill=(skill:string)=>staff.map(member=>({member,count:assignments.filter(item=>item.staffId===member.id&&item.type===skill&&item.status==="COMPLETED").length})).sort((a,b)=>b.count-a.count)[0];
  const topOperator=countBySkill("OPERATOR"),topAssembly=countBySkill("ASSEMBLY");
  const totalStaffCost=payroll.filter(item=>item.status!=="CANCELLED").reduce((sum,item)=>sum+Number(item.total_internal_payment),0);
  const paidProjects=new Set(payroll.filter(item=>item.status!=="CANCELLED").map(item=>item.project_id));
  const staffIntelligence={mostActiveOperator:topOperator?.count?`${topOperator.member.first_name} ${topOperator.member.last_name}`:"Sin datos",mostActiveAssembly:topAssembly?.count?`${topAssembly.member.first_name} ${topAssembly.member.last_name}`:"Sin datos",totalStaffCost,averageCostPerEvent:paidProjects.size?totalStaffCost/paidProjects.size:0,upcomingAssignments:activeAssignments.length};
  const pending=projects.filter(project=>project.commercialStage==="Reserved"||project.commercialStage==="Waiting").length;

  const money=(value:number)=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(value);const pct=(value:number)=>`${value.toFixed(1)}%`;const projectMap=new Map(projects.map(project=>[project.id,project]));const confirmed=financialTruth.filter(row=>row.status==="CONFIRMED"&&projectMap.has(row.projectId));const todayRevenue=confirmed.filter(row=>row.eventDate===today).reduce((sum,row)=>sum+row.revenue,0);const monthStatements=confirmed.filter(row=>row.eventDate?.startsWith(monthKey));const monthRevenue=monthStatements.reduce((sum,row)=>sum+row.revenue,0);const estimatedProfit=monthStatements.reduce((sum,row)=>sum+row.revenue-row.estimatedCost,0);const realProfit=monthStatements.reduce((sum,row)=>sum+row.netProfit,0);const totalMonthRevenue=monthStatements.reduce((sum,row)=>sum+row.revenue,0);const grossMargin=totalMonthRevenue?estimatedProfit/totalMonthRevenue*100:0;const netMargin=totalMonthRevenue?realProfit/totalMonthRevenue*100:0;const receivables=receivablesResult.data??[];const accountsPayable=(expensesResult.data??[]).filter(row=>row.status==="PENDING").reduce((sum,row)=>sum+Number(row.total),0)+(payrollResult.data??[]).filter(row=>row.status!=="PAID"&&row.status!=="CANCELLED").reduce((sum,row)=>sum+Number(row.total_internal_payment),0);const cashPosition=confirmed.reduce((sum,row)=>sum+row.paidAmount,0)-(expensesResult.data??[]).filter(row=>row.status==="PAID").reduce((sum,row)=>sum+Number(row.total),0);const tomorrowDate=new Date(`${today}T12:00:00Z`);tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);const tomorrow=tomorrowDate.toISOString().slice(0,10);const projectScore=confirmed.map(row=>({row,project:projectMap.get(row.projectId)!,profit:row.netProfit,margin:row.netMargin}));const best=[...projectScore].sort((a,b)=>b.profit-a.profit)[0],lowest=[...projectScore].sort((a,b)=>a.margin-b.margin)[0];const groupProfit=(key:(p:(typeof projects)[number])=>string)=>{const grouped=new Map<string,number>();for(const item of projectScore){const label=key(item.project)||"Sin registro";grouped.set(label,(grouped.get(label)??0)+item.profit)}return[...grouped].sort((a,b)=>b[1]-a[1])[0]};const serviceWinner=groupProfit(project=>project.services.join(" + ")),municipalityWinner=groupProfit(project=>project.event.city);const costSum=(key:string)=>confirmed.reduce((sum,row)=>sum+Number(row.costBreakdown[key]??0),0);const totalReal=confirmed.reduce((sum,row)=>sum+row.realCost,0);const activeInvoices=receivables.filter(row=>!["PAID","CANCELLED"].includes(row.effective_status));const overdue=activeInvoices.filter(row=>row.effective_status==="OVERDUE");const unsigned=(agreementsResult.data??[]).filter(row=>row.status!=="SIGNED").length;const corporatePending=activeInvoices.filter(row=>row.customer_type==="CORPORATE").length;const missingStaff=projects.filter(project=>project.event.date>=today&&!assignments.some(item=>item.projectId===project.id&&!['CANCELLED','REJECTED'].includes(item.status))).length;const truthIds=new Set(financialTruth.map(row=>row.projectId));const missingCosts=projects.filter(project=>project.event.date>=today&&!truthIds.has(project.id)).length;const lowMargin=projectScore.filter(item=>item.margin<20).length;const vehicleEvents=vehicleEventsResult.data??[];const vehicleCounts=new Map<string,number>();for(const row of vehicleEvents){const asset=Array.isArray(row.operational_assets)?row.operational_assets[0]:row.operational_assets;const key=asset?.asset_code??"Sin vehículo";vehicleCounts.set(key,(vehicleCounts.get(key)??0)+1)}const topVehicle=[...vehicleCounts].sort((a,b)=>b[1]-a[1])[0];const metric=(label:string,value:string,detail:string,href:string,tone?:"default"|"success"|"warning"|"danger")=>({label,value,detail,href,tone});const controlData:ExecutiveControlData={generatedAt:new Date().toISOString(),top:[metric("Ingresos de hoy",money(todayRevenue),"Desde Business Truth","/projects?date=today"),metric("Ingresos mensuales",money(monthRevenue),"Desde Business Truth","/projects?period=month"),metric("Cuentas por cobrar",money(accountsReceivable),`${activeInvoices.length} documentos abiertos`,"/finance/receivables"),metric("Cuentas por pagar",money(accountsPayable),"Gastos y pagos de Staff pendientes","/finance/expenses"),metric("Profit estimado",money(estimatedProfit),"Ingreso menos costo estimado","/projects?view=profitability"),metric("Profit real",money(realProfit),"Desde Business Truth","/projects?view=profitability"),metric("Margen bruto",pct(grossMargin),"Sobre costos estimados","/projects?view=profitability"),metric("Margen neto",pct(netMargin),"Desde Business Truth","/projects?view=profitability"),metric("Posición de caja",money(cashPosition),"Cobros menos egresos pagados","/finance/cash-flow")],sections:[{title:"Operación en vivo",icon:"operation",metrics:[metric("Eventos de hoy",String(projects.filter(p=>p.event.date===today).length),"Agenda actual","/projects?date=today"),metric("Eventos de mañana",String(projects.filter(p=>p.event.date===tomorrow).length),"Próxima jornada","/projects?date=tomorrow"),metric("Próximos 15 días",String(next15Events),"Reservas activas","/projects?range=15"),metric("Reservas pendientes",String(pending),"Pendientes de confirmación","/projects?status=pending"),metric("Contratos pendientes",String(unsigned),"Esperando firma","/projects?contract=pending"),metric("Crédito empresa",String(corporatePending),"Facturas corporativas abiertas","/finance/receivables?customer=corporate"),metric("Pagos pendientes",String(activeInvoices.length),"Documentos con saldo","/finance/receivables")]},{title:"Rentabilidad",icon:"profit",metrics:[metric("Evento más rentable",best?.project.name??"Sin datos",best?money(best.profit):"—",best?`/projects/${best.project.id}#profitability`:"/projects"),metric("Servicio más rentable",serviceWinner?.[0]??"Sin datos",serviceWinner?money(serviceWinner[1]):"—","/projects?view=profitability"),metric("Comuna más rentable",municipalityWinner?.[0]??"Sin datos",municipalityWinner?money(municipalityWinner[1]):"—","/projects?view=profitability"),metric("Menor margen",lowest?.project.name??"Sin datos",lowest?pct(lowest.margin):"—",lowest?`/projects/${lowest.project.id}#profitability`:"/projects"),metric("Margen promedio",pct(projectScore.length?projectScore.reduce((sum,item)=>sum+item.margin,0)/projectScore.length:0),"Eventos con estado financiero","/projects?view=profitability")]},{title:"Costos operacionales",icon:"cost",metrics:[metric("Consumo de papel",money(costSum("paper")),"Costo vigente","/projects?cost=paper"),metric("Combustible",money(costSum("fuel")),"Costo vigente","/projects?cost=fuel"),metric("Operadores",money(costSum("operator")),"Costo vigente","/projects?cost=operator"),metric("Montaje",money(costSum("assembly")),"Montaje y desmontaje","/projects?cost=assembly"),metric("Transporte",money(costSum("transport")),"Costo vigente","/projects?cost=transport"),metric("Promedio por evento",money(confirmed.length?totalReal/confirmed.length:0),"Costo real promedio","/projects?view=profitability")]},{title:"Staff",icon:"staff",metrics:[metric("Próximas asignaciones",String(activeAssignments.length),"Asignaciones activas","/resources/staff"),metric("Pagos pendientes",money((payrollResult.data??[]).filter(row=>row.status!=="PAID"&&row.status!=="CANCELLED").reduce((sum,row)=>sum+Number(row.total_internal_payment),0)),"Honorarios por pagar","/resources/staff"),metric("Operador más activo",staffIntelligence.mostActiveOperator,"Eventos completados","/resources/staff")]},{title:"Vehículos",icon:"vehicle",metrics:[metric("Vehículo más utilizado",topVehicle?.[0]??"Sin datos",topVehicle?`${topVehicle[1]} eventos`:"—","/resources?tab=fleet"),metric("Costo combustible",money(costSum("fuel")),"Asignado a eventos","/resources?tab=fleet"),metric("Próxima mantención","Preparado","Disponible para futura configuración","/resources?tab=fleet")]},{title:"Experiencia del cliente",icon:"customer",metrics:[metric("Contratos firmados",String((agreementsResult.data??[]).filter(row=>row.status==="SIGNED").length),"Documentos oficiales firmados","/projects?contract=signed"),metric("Documentos comerciales",String((agreementsResult.data??[]).filter(row=>row.status==="COMMERCIAL_DOCUMENT").length),"Sin firma requerida","/projects?document=commercial"),metric("Portales activos",String((portalResult.data??[]).filter(row=>!row.revoked_at).length),"Acceso cliente disponible","/projects?portal=active")]}],alerts:[...(unsigned?[metric("Contratos esperando firma",String(unsigned),"Requieren seguimiento","/projects?contract=pending","warning")]:[]),...(corporatePending?[metric("Facturas corporativas pendientes",String(corporatePending),"Crédito abierto","/finance/receivables?customer=corporate","warning")]:[]),...(overdue.length?[metric("Pagos vencidos",String(overdue.length),money(overdue.reduce((sum,row)=>sum+Number(row.outstanding_balance),0)),"/finance/receivables?status=overdue","danger")]:[]),...(lowMargin?[metric("Eventos con margen bajo",String(lowMargin),"Revisar costos reales","/projects?margin=low","danger")]:[]),...(missingStaff?[metric("Eventos sin Staff",String(missingStaff),"Asignación operacional pendiente","/projects?staff=missing","danger")]:[]),...(missingCosts?[metric("Costos operacionales faltantes",String(missingCosts),"Sin estado financiero","/projects?costs=missing","warning")]:[])]};

  const monthlyPersonnelCost=monthStatements.reduce((sum,row)=>sum+row.personnelCost,0);
  const monthlyOperationalResourcesCost=monthStatements.reduce((sum,row)=>sum+row.operationalResourcesCost,0);
  const monthlyTotalOperationalCost=monthStatements.reduce((sum,row)=>sum+row.totalOperationalCost,0);
  controlData.top.unshift(
    metric("Ingresos",money(monthRevenue),"Reservas confirmadas del mes","/projects?period=month"),
    metric("Costo de personal",money(monthlyPersonnelCost),"Operador + montaje + desmontaje","/projects?cost=personnel"),
    metric("Recursos operacionales",money(monthlyOperationalResourcesCost),"Cost Master y ajustes reales","/projects?cost=resources"),
    metric("Costo operacional total",money(monthlyTotalOperationalCost),"Personal + recursos operacionales","/projects?view=profitability"),
    metric("Profit",money(realProfit),"Ingreso menos costo operacional total","/projects?view=profitability"),
    metric("Margen",pct(netMargin),"Motor financiero único","/projects?view=profitability"),
  );

  const workspaceValues:WorkspaceValues={TODAY_EVENTS:{value:String(projects.filter(project=>project.event.date===today).length),detail:"Agenda operacional de hoy"},UPCOMING_EVENTS:{value:String(next15Events),detail:"Próximos 15 días"},ACCOUNTS_RECEIVABLE:{value:money(accountsReceivable),detail:`${activeInvoices.length} documentos abiertos`},ACCOUNTS_PAYABLE:{value:money(accountsPayable),detail:`${money(monthlyExpenses)} en gastos del mes`},MONTHLY_REVENUE:{value:money(monthlyRevenue),detail:"Reservas confirmadas del mes"},OPERATIONAL_COST:{value:money(monthlyTotalOperationalCost),detail:"Personal + recursos operacionales"},PROFITABILITY:{value:money(realProfit),detail:`Margen ${pct(netMargin)}`},BUSINESS_INTELLIGENCE:{value:"Abrir",detail:"Indicadores productivos"},FUEL:{value:money(costSum("fuel")),detail:"Costo asignado a eventos"},PAPER_CONSUMPTION:{value:money(costSum("paper")),detail:"Consumo valorizado"},STAFF:{value:String(activeAssignments.length),detail:`${availableOperators} operadores disponibles`},FLEET:{value:String(availableVehicles),detail:"Vehículos disponibles"},NOTIFICATIONS:{value:String(controlData.alerts.length),detail:`${readiness.length} eventos supervisados`}};
  const currentDate=new Intl.DateTimeFormat("es-CL",{dateStyle:"full",timeZone:"America/Santiago"}).format(new Date());
  const planningEndDate=new Date(`${today}T12:00:00Z`);planningEndDate.setUTCDate(planningEndDate.getUTCDate()+15);const planningEnd=planningEndDate.toISOString().slice(0,10);
  const publicationMap=new Map((publicationsResult.data??[]).map(row=>[row.project_id,row.published]));
  const officialEventMap=new Map((rawProjectsResult.data??[]).map(row=>[row.id,row]));
  const planningEvents:PlanningEvent[]=projects.filter(project=>Boolean(project.event.date&&project.event.date>=today&&project.event.date<=planningEnd)).map(project=>{const official=officialEventMap.get(project.id);const services=official?(Array.isArray(official.project_services)?official.project_services:[]):[];const operations=(official?.operations??{})as Record<string,unknown>;const customer=official?(Array.isArray(official.customers)?official.customers[0]:official.customers):null;const projectAssignments=(assignmentsResult.data??[]).filter(item=>item.project_id===project.id&&!['CANCELLED','REJECTED'].includes(item.status));const hours=Number(services[0]?.duration_hours??0);const findRole=(code:"OPERATOR"|"ASSEMBLY"|"DISASSEMBLY",label:string)=>{const assignment=projectAssignments.find(item=>item.assignment_type===code);const person=assignment?.staff?(Array.isArray(assignment.staff)?assignment.staff[0]:assignment.staff):null;const payment=(payrollResult.data??[]).find(item=>item.project_id===project.id&&item.staff_id===assignment?.staff_id&&item.status!=="CANCELLED");const stored=code==='OPERATOR'?payment?.operator_payment:code==='ASSEMBLY'?payment?.assembly_payment:payment?.disassembly_payment;return{code,label,pay:Number(stored??0),paymentId:payment?.id??null,staffId:assignment?.staff_id??null,assignee:person?`${person.first_name} ${person.last_name}`:null,status:assignment?.status??'UNASSIGNED'}};const finance=financeByProject.get(project.id)??{};return{id:project.id,date:official?.event_date??project.event.date,customer:customer?.full_name??project.client.name,service:services.map(item=>item.service_code).filter(Boolean).join(' + ')||official?.project_type||'Servicio BOOMBOX',hours,address:String(operations.eventAddress??official?.location??''),district:official?.city??'',venue:String(operations.venue??operations.venueName??official?.location??''),booths:Number(operations.booths??finance.booths??1),roles:{operator:findRole('OPERATOR','Operador'),assembly:findRole('ASSEMBLY','Montaje'),disassembly:findRole('DISASSEMBLY','Desmontaje')},status:project.status,published:publicationMap.get(project.id)??false}});
  const pendingRequests:PlanningRequest[]=(staffRequestsResult.data??[]).map(row=>{const member=Array.isArray(row.staff)?row.staff[0]:row.staff,project=Array.isArray(row.projects)?row.projects[0]:row.projects,customer=project?(Array.isArray(project.customers)?project.customers[0]:project.customers):null,services=project?(Array.isArray(project.project_services)?project.project_services:[]):[];return{id:row.id,staffName:member?`${member.first_name} ${member.last_name}`:"Staff",customer:customer?.full_name??project?.name??"Evento",service:services.map(service=>service.service_code).filter(Boolean).join(" + ")||"Servicio BOOMBOX",date:project?.event_date??"",responsibility:row.responsibility}});
  const staffOptions=staff.map(member=>({id:member.id,name:`${member.first_name} ${member.last_name}`,skills:member.capabilities??[]}));
  return <div className="space-y-6"><OperationsStaffPortalControl events={planningEvents} requests={pendingRequests}/><OperationsPlanningBoard events={planningEvents} staff={staffOptions}/><FounderWorkspaceExperience currentDate={currentDate} founderName="Matías" initialPreferences={founderWorkspace} pendingTasks={taskSummary.pending} todayEvents={projects.filter(project=>project.event.date===today).length} values={workspaceValues}/></div>;
}
