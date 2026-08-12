import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmCustomerEventOperations } from "./types";

type Relation<T> = T | T[] | null;
const one = <T,>(value: Relation<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export async function loadCrmCustomerOperations(
  client: SupabaseClient,
  projectIds: string[],
): Promise<CrmCustomerEventOperations[]> {
  if (!projectIds.length) return [];
  const [receivables, assignments, staff, assets, agreements, documents, calendars, portals, invoices, profitability, financialTruth] =
    await Promise.all([
      client.from("accounts_receivable_projection").select("id,project_id,invoice_number,amount,paid_amount,outstanding_balance,due_date,effective_status,payment_history").in("project_id", projectIds),
      client.from("assignments").select("id,project_id,staff_id,assignment_type,status,arrival_time,start_time,finish_time,assigned_vehicle,observations,staff(first_name,last_name),operational_assets(asset_code)").in("project_id", projectIds).is("deleted_at", null),
      client.from("staff").select("id,first_name,last_name,role,status,capabilities").is("deleted_at", null).order("last_name"),
      client.from("operational_assets").select("id,asset_code,asset_type,status").is("deleted_at", null).order("asset_code"),
      client.from("agreements").select("id,project_id,status,created_at").in("project_id", projectIds).order("created_at", { ascending: false }),
      client.from("documents").select("id,project_id,document_type,storage_path,drive_file_id,created_at").in("project_id", projectIds).is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("calendar_sync").select("project_id,status,external_event_id,external_url").in("project_id", projectIds),
      client.from("customer_portal_tokens").select("project_id").in("project_id", projectIds).is("revoked_at", null),
      client.from("invoices").select("id,project_id,invoice_number,status,amount,due_date").in("project_id", projectIds).is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("event_profitability_statements").select("project_id,real_costs,profitability,classification,created_at").in("project_id", projectIds).order("created_at", { ascending: false }),
      client.from("financial_event_records").select("project_id,revenue,personnel_cost,operational_resources_cost,total_operational_cost,net_profit,net_margin,cost_breakdown,calculated_at").in("project_id", projectIds),
    ]);
  const failures = [receivables, assignments, staff, assets, agreements, documents, calendars, portals, invoices, profitability, financialTruth].filter((result) => result.error);
  if (failures.length) throw failures[0].error;
  const activeStaff = (staff.data ?? []).filter((member) => member.status === "ACTIVE").map((member) => ({
    id: member.id,
    name: `${member.first_name} ${member.last_name}`,
    role: member.role,
    capabilities: member.capabilities ?? [],
  }));
  const vehicles = (assets.data ?? []).filter((asset) => asset.asset_type === "VEHICLE" && asset.status === "AVAILABLE").map((asset) => ({ id: asset.id, name: asset.asset_code }));
  return projectIds.map((projectId) => {
    const invoice = (receivables.data ?? []).find((item) => item.project_id === projectId);
    const agreement = (agreements.data ?? []).find((item) => item.project_id === projectId);
    const calendar = (calendars.data ?? []).find((item) => item.project_id === projectId);
    const profit = (profitability.data ?? []).find((item) => item.project_id === projectId);
    const truth = (financialTruth.data ?? []).find((item) => item.project_id === projectId);
    const realCosts = (profit?.real_costs ?? {}) as Record<string, unknown>;
    const profitValues = (profit?.profitability ?? {}) as Record<string, unknown>;
    const costValues = (truth?.cost_breakdown ?? realCosts) as Record<string, unknown>;
    const costBreakdown = [
      ["operator", "Operador", "PERSONNEL"],
      ["assembly", "Montaje", "PERSONNEL"],
      ["disassembly", "Desmontaje", "PERSONNEL"],
      ["paper", "Papel", "OPERATIONAL"],
      ["fuel", "Combustible", "OPERATIONAL"],
      ["transport", "Transporte", "OPERATIONAL"],
      ["scrapbook", "Scrapbook", "OPERATIONAL"],
      ["magnets", "Imanes", "OPERATIONAL"],
      ["pens", "Lápices", "OPERATIONAL"],
      ["doubleSidedTape", "Cinta doble contacto", "OPERATIONAL"],
      ["other", "Otros costos operacionales", "OPERATIONAL"],
    ].map(([key, label, group]) => ({ key, label, group: group as "PERSONNEL" | "OPERATIONAL", amount: Number(costValues[key] ?? 0) }));
    return {
      projectId,
      receivable: invoice ? {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        amount: Number(invoice.amount ?? 0),
        paidAmount: Number(invoice.paid_amount ?? 0),
        outstandingBalance: Number(invoice.outstanding_balance ?? 0),
        status: invoice.effective_status,
        dueDate: invoice.due_date,
        movements: (Array.isArray(invoice.payment_history) ? invoice.payment_history : []).map((movement: Record<string, unknown>) => ({
          id: String(movement.id ?? ""),
          amount: Number(movement.amount ?? 0),
          paidAt: String(movement.paid_at ?? movement.paidAt ?? ""),
          method: String(movement.method ?? ""),
          reason: String(movement.reason ?? "Movimiento de pago"),
          type: String(movement.type ?? "PAYMENT"),
          receiptPath: typeof movement.receiptPath === "string" ? movement.receiptPath : typeof movement.receipt_path === "string" ? movement.receipt_path : null,
          receiptName: typeof movement.receiptName === "string" ? movement.receiptName : null,
          createdBy: typeof movement.createdBy === "string" ? movement.createdBy : null,
          createdAt: String(movement.createdAt ?? movement.paidAt ?? ""),
        })),
      } : null,
      staffAssignments: {
        projectId,
        assignments: (assignments.data ?? []).filter((item) => item.project_id === projectId).map((item) => {
          const member = one(item.staff as Relation<{ first_name: string; last_name: string }>);
          const vehicle = one(item.operational_assets as Relation<{ asset_code: string }>);
          return {
            id: item.id, staffId: item.staff_id,
            staffName: member ? `${member.first_name} ${member.last_name}` : "Staff sin ficha",
            role: item.assignment_type, status: item.status,
            arrivalTime: item.arrival_time?.slice(0, 5) ?? "", startTime: item.start_time?.slice(0, 5) ?? "", finishTime: item.finish_time?.slice(0, 5) ?? "",
            vehicleId: item.assigned_vehicle ?? "", vehicleName: vehicle?.asset_code ?? "", observations: item.observations ?? "",
          };
        }),
        staff: activeStaff,
        vehicles,
      },
      agreement: agreement ? { id: agreement.id, status: agreement.status } : null,
      documents: (documents.data ?? []).filter((item) => item.project_id === projectId).map((item) => ({ id: item.id, type: item.document_type, storagePath: item.storage_path, driveFileId: item.drive_file_id, createdAt: item.created_at })),
      calendar: calendar ? { status: calendar.status, externalUrl: calendar.external_url, externalEventId: calendar.external_event_id } : null,
      portalActive: (portals.data ?? []).some((item) => item.project_id === projectId),
      invoices: (invoices.data ?? []).filter((item) => item.project_id === projectId).map((item) => ({ id: item.id, number: item.invoice_number, status: item.status, amount: Number(item.amount ?? 0), dueDate: item.due_date })),
      profitability: profit || truth ? {
        revenue: Number(truth?.revenue ?? profitValues.grossRevenue ?? 0),
        personnelCost: Number(truth?.personnel_cost ?? realCosts.personnelCost ?? 0),
        operationalCost: Number(truth?.operational_resources_cost ?? realCosts.operationalResourcesCost ?? 0),
        totalCost: Number(truth?.total_operational_cost ?? realCosts.totalOperationalCost ?? realCosts.total ?? 0),
        costBreakdown,
        profit: Number(truth?.net_profit ?? profitValues.netProfit ?? 0),
        margin: Number(truth?.net_margin ?? profitValues.margin ?? 0),
        classification: profit?.classification ?? "NORMAL",
        calculatedAt: truth?.calculated_at ?? profit?.created_at ?? new Date().toISOString(),
      } : null,
    };
  });
}
