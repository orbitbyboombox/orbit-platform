import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAccountsReceivable } from "@/features/accounts-receivable";
import { loadFinancialTruth } from "@/features/business-engine";
import { summarizeFixedMonthlyExpenses, type FixedExpenseRule } from "@/features/expense-center/fixed-expense-read-model";
import { selectCanonicalFuelLogs } from "./canonical-fuel";
import { calculateMonthlyFinancePerformance } from "./finance-performance";

export type FinanceMetric = {
  label: string;
  value: number;
  format: "money" | "percent" | "count";
  detail: string;
  href: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type FinanceRisk = {
  key: string;
  label: string;
  count: number;
  amount: number;
  detail: string;
  href: string;
  severity: "warning" | "danger";
};

export type FinanceDashboardReadModel = {
  generatedAt: string;
  periodLabel: string;
  cash: {
    total: number;
    unassigned: number;
    accounts: { label: string; value: number; href: string }[];
  };
  today: FinanceMetric[];
  month: FinanceMetric[];
  position: FinanceMetric[];
  forecast: FinanceMetric[];
  risks: FinanceRisk[];
};

type CashAccount={code:string;name:string;kind:string;primary:boolean};
const number = (value: unknown) => Number(value ?? 0) || 0;
const sum = <T,>(rows: readonly T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
const dateOnly = (value: string | null | undefined) => value?.slice(0, 10) ?? "";
const inRange = (value: string | null | undefined, from: string, to: string) => {
  const date = dateOnly(value);
  return Boolean(date && date >= from && date <= to);
};
const metadata = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try { return JSON.parse(String(value ?? "{}")) as Record<string, unknown>; } catch { return {}; }
};
const accountKey = (value: unknown,accounts:readonly CashAccount[]): string | null => {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const direct=accounts.find(account=>normalized.includes(account.code.toLowerCase().replaceAll("_"," "))||normalized.includes(account.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()));
  if(direct)return direct.code;
  if(normalized.includes("mercado pago")||normalized.includes("mercadopago"))return accounts.find(account=>account.kind==="PAYMENT_GATEWAY")?.code??null;
  if(normalized.includes("transfer"))return accounts.find(account=>account.primary)?.code??null;
  return null;
};
const monthName = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "America/Santiago" });
const moneyMetric = (label: string, value: number, detail: string, href: string, tone?: FinanceMetric["tone"]): FinanceMetric => ({ label, value, detail, href, format: "money", tone });
const financialRisk = (risk: FinanceRisk): FinanceRisk => risk;

/**
 * Canonical Finance Read Model for the Founder dashboard.
 * The UI consumes this projection and performs no financial calculations.
 */
export async function loadFinanceDashboardReadModel(client: SupabaseClient): Promise<FinanceDashboardReadModel> {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const next30Date = new Date(`${today}T12:00:00Z`);
  next30Date.setUTCDate(next30Date.getUTCDate() + 30);
  const next30 = next30Date.toISOString().slice(0, 10);

  const [truth, receivableDataset, receivablesResult, paymentsResult, expensesResult, settlementsResult, staffMovementsResult, fuelResult, routesResult, routeEventsResult, integrityResult,bankAccountsResult,fixedRulesResult] = await Promise.all([
    loadFinancialTruth(client),
    loadAccountsReceivable(client),
    client.from("accounts_receivable_projection").select("id,project_id,customer_id,due_date,amount,paid_amount,outstanding_balance,effective_status"),
    client.from("invoice_payments").select("id,invoice_id,amount,movement_type,paid_at,method,deleted_at,invoices!inner(financial_record_state,record_origin,status,deleted_at)").is("deleted_at", null).eq("invoices.financial_record_state", "ACTIVE").eq("invoices.record_origin", "PRODUCTION").neq("invoices.status", "CANCELLED").is("invoices.deleted_at", null),
    client.from("expenses").select("id,project_id,occurred_on,total,status,receipt_path,approval_reason,event_staff_settlement_id").is("deleted_at", null),
    client.from("staff_settlement_financials").select("settlement_id,project_id,staff_id,accounting_month,payroll_net,final_amount,paid_amount,remaining_balance,sii_receipt_status"),
    client.from("event_staff_settlement_movements").select("id,settlement_id,movement_type,amount,movement_date,method").is("deleted_at", null),
    client.from("vehicle_fuel_logs").select("id,fuel_date,total_amount,receipt_path,gas_station,route_id"),
    client.from("vehicle_routes").select("id,status,deleted_at,notes"),
    client.from("vehicle_route_events").select("route_id,project_id"),
    client.from("financial_integrity_issues").select("id,status").eq("status", "OPEN"),
    client.from("finance_bank_accounts").select("code,name,account_kind,is_primary").eq("active",true).order("is_primary",{ascending:false}),
    client.from("finance_recurring_expense_rules").select("id,name,category,amount,currency,frequency,next_due_date,active,metadata"),
  ]);
  const error = receivablesResult.error ?? paymentsResult.error ?? expensesResult.error ?? settlementsResult.error ?? staffMovementsResult.error ?? fuelResult.error??routesResult.error??routeEventsResult.error??bankAccountsResult.error??fixedRulesResult.error;
  if (error) throw error;

  const activeTruth = truth.filter((row) => row.status === "CONFIRMED");
  const activeProjectIds = new Set(activeTruth.map((row) => row.projectId));
  const todayTruth = activeTruth.filter((row) => row.eventDate === today);
  const monthTruth = activeTruth.filter((row) => row.eventDate?.startsWith(month));
  const receivables = receivablesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const cashImpactResults = await Promise.all(payments.map((row) => client.rpc("invoice_payment_cash_impact", { p_movement_type: row.movement_type, p_amount: row.amount })));
  const cashImpactError = cashImpactResults.find((result) => result.error)?.error;
  if (cashImpactError) throw cashImpactError;
  const canonicalPayments = payments.map((row, index) => ({ ...row, cashImpact: number(cashImpactResults[index]?.data) }));
  const expenses = (expensesResult.data ?? []).filter((row) => !row.project_id || activeProjectIds.has(row.project_id));
  const settlements = (settlementsResult.data ?? []).filter((row) => activeProjectIds.has(row.project_id));
  const activeSettlementIds = new Set(settlements.map((row) => row.settlement_id));
  const staffMovements = (staffMovementsResult.data ?? []).filter((row) => activeSettlementIds.has(row.settlement_id));
  const expenseReceipts = new Set(expenses.map((row) => row.receipt_path).filter((path): path is string => Boolean(path)));
  const routes = new Map((routesResult.data ?? []).map((row) => [row.id, row]));
  const productionRouteIds = new Set((routeEventsResult.data ?? []).filter((row) => activeProjectIds.has(row.project_id)).map((row) => row.route_id));
  const fuel = selectCanonicalFuelLogs((fuelResult.data ?? []).map((row) => {
    const route = row.route_id ? routes.get(row.route_id) : null;
    return { ...row, receiptPath: row.receipt_path, gasStation: row.gas_station, routeId: row.route_id, routeStatus: route?.status ?? null, routeDeletedAt: route?.deleted_at ?? null, routeNotes: route?.notes ?? null, hasActiveProductionProject: Boolean(row.route_id && productionRouteIds.has(row.route_id)) };
  }), expenseReceipts);

  const collectedAll = sum(canonicalPayments, (row) => row.cashImpact);
  const paidExpenses = expenses.filter((row) => row.status === "PAID");
  const staffCashMovements = staffMovements.map((row) => ({ ...row, signedAmount: row.movement_type === "REVERSAL" ? -number(row.amount) : number(row.amount) }));
  const outgoingAll = sum(paidExpenses, (row) => number(row.total)) + sum(staffCashMovements, (row) => row.signedAmount) + sum(fuel, (row) => number(row.total_amount));
  const availableCash = collectedAll - outgoingAll;

  const configuredAccounts:CashAccount[]=(bankAccountsResult.data??[]).map(row=>({code:row.code,name:row.name,kind:row.account_kind,primary:row.is_primary}));
  const cashAccounts = new Map<string, number>(configuredAccounts.map(account=>[account.code,0]));
  let unassignedCash = 0;
  const registerCash = (source: unknown, amount: number) => {
    const key = accountKey(source,configuredAccounts);
    if (key) cashAccounts.set(key, (cashAccounts.get(key) ?? 0) + amount);
    else unassignedCash += amount;
  };
  canonicalPayments.forEach((row) => registerCash(row.method, row.cashImpact));
  paidExpenses.forEach((row) => {
    const meta = metadata(row.approval_reason);
    registerCash(meta.sourceAccount ?? meta.bank ?? meta.paymentMethod, -number(row.total));
  });
  staffCashMovements.forEach((row) => registerCash(row.method, -row.signedAmount));
  fuel.forEach((row) => registerCash(null, -number(row.total_amount)));

  const todayPayments = canonicalPayments.filter((row) => dateOnly(row.paid_at) === today);
  const monthPayments = canonicalPayments.filter((row) => dateOnly(row.paid_at).startsWith(month));
  const todayExpenses = paidExpenses.filter((row) => row.occurred_on === today);
  const monthExpenses = paidExpenses.filter((row) => row.occurred_on?.startsWith(month));
  const todayStaff = staffCashMovements.filter((row) => row.movement_date === today);
  const todayFuel = fuel.filter((row) => row.fuel_date === today);
  const monthFuel = fuel.filter((row) => row.fuel_date?.startsWith(month));
  const monthlyPayroll = settlements.filter((row) => row.accounting_month?.startsWith(month));
  const outstanding = sum(receivables.filter((row) => !["PAID", "CANCELLED"].includes(row.effective_status)), (row) => number(row.outstanding_balance));
  const monthlyRevenue = sum(monthTruth, (row) => row.revenue);
  const monthlyCosts = sum(monthTruth, (row) => row.realCost);
  const fixedRules: FixedExpenseRule[] = (fixedRulesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, category: row.category, amount: number(row.amount), currency: row.currency as "CLP" | "USD", frequency: row.frequency, active: row.active, nextDueDate: row.next_due_date, metadata: (row.metadata ?? {}) as Record<string, unknown> }));
  const fixedMonthlyExpenses = summarizeFixedMonthlyExpenses(fixedRules, now).monthlyTotal;
  const performance = calculateMonthlyFinancePerformance({ revenue: monthlyRevenue, directEventCosts: monthlyCosts, fixedMonthlyExpenses });
  const todayRevenue = sum(todayTruth, (row) => row.revenue);
  const todayCost = sum(todayTruth, (row) => row.realCost);
  const todayProfit = sum(todayTruth, (row) => row.netProfit);
  const collectionsToday = sum(todayPayments, (row) => row.cashImpact);
  const collectionsMonth = sum(monthPayments, (row) => row.cashImpact);
  const paymentsToday = sum(todayExpenses, (row) => number(row.total)) + sum(todayStaff, (row) => row.signedAmount) + sum(todayFuel, (row) => number(row.total_amount));
  const expensesMonth = sum(monthExpenses, (row) => number(row.total)) + sum(monthFuel, (row) => number(row.total_amount));

  const upcomingReceivables = receivables.filter((row) => !["PAID", "CANCELLED"].includes(row.effective_status) && inRange(row.due_date, today, next30));
  const upcomingExpenses = expenses.filter((row) => row.status === "PENDING" && inRange(row.occurred_on, today, next30));
  const upcomingStaff = settlements.filter((row) => number(row.remaining_balance) > 0 && inRange(row.accounting_month, monthStart, next30));
  const projectedCollections = sum(upcomingReceivables, (row) => number(row.outstanding_balance));
  const projectedPayments = sum(upcomingExpenses, (row) => number(row.total)) + sum(upcomingStaff, (row) => number(row.remaining_balance));
  const projectedCash = availableCash + projectedCollections - projectedPayments;

  const overdue = receivables.filter((row) => row.effective_status === "OVERDUE" && number(row.outstanding_balance) > 0);
  const missingTaxDocuments = expenses.filter((row) => row.status === "PAID" && !row.receipt_path);
  const pendingReceipts = settlements.filter((row) => row.sii_receipt_status === "PENDING" && number(row.paid_amount) > 0);
  const orphanCount = integrityResult.error?.code === "42P01" ? 0 : (integrityResult.data ?? []).length;
  if (integrityResult.error && integrityResult.error.code !== "42P01") throw integrityResult.error;

  const risks: FinanceRisk[] = [
    financialRisk({ key: "OVERDUE_COLLECTIONS", label: "Cobros vencidos", count: overdue.length, amount: sum(overdue, (row) => number(row.outstanding_balance)), detail: "Cuentas activas con fecha de vencimiento superada.", href: "/finance/receivables?status=overdue", severity: "danger" }),
    financialRisk({ key: "UPCOMING_STAFF", label: "Próximos pagos de Staff", count: upcomingStaff.length, amount: sum(upcomingStaff, (row) => number(row.remaining_balance)), detail: "Liquidaciones confirmadas pendientes del período.", href: "/resources/staff?workspace=payroll", severity: "warning" }),
    financialRisk({ key: "SUPPLIER_PAYMENTS", label: "Pagos a proveedores", count: upcomingExpenses.length, amount: sum(upcomingExpenses, (row) => number(row.total)), detail: "Gastos activos pendientes dentro de 30 días.", href: "/finance/expenses?status=pending", severity: "warning" }),
    ...(projectedCash < 0 ? [financialRisk({ key: "NEGATIVE_CASH", label: "Proyección de caja negativa", count: 1, amount: projectedCash, detail: "Los compromisos del horizonte superan la caja y los cobros proyectados.", href: "/finance/cash-flow", severity: "danger" })] : []),
    financialRisk({ key: "MISSING_TAX_DOCUMENTS", label: "Documentos tributarios faltantes", count: missingTaxDocuments.length, amount: sum(missingTaxDocuments, (row) => number(row.total)), detail: "Gastos pagados sin comprobante asociado.", href: "/finance/expenses?filter=missing-document", severity: "warning" }),
    financialRisk({ key: "PENDING_STAFF_RECEIPTS", label: "Boletas de Staff pendientes", count: pendingReceipts.length, amount: sum(pendingReceipts, (row) => number(row.paid_amount)), detail: "Liquidaciones pagadas con boleta SII pendiente.", href: "/resources/staff?filter=receipt-pending", severity: "warning" }),
    financialRisk({ key: "ORPHAN_RECORDS", label: "Registros financieros huérfanos", count: orphanCount, amount: 0, detail: "Incidencias abiertas detectadas por Integridad Financiera.", href: "/settings#financial-integrity", severity: "danger" }),
    ...(Math.abs(unassignedCash) > 0 ? [financialRisk({ key: "UNASSIGNED_CASH", label: "Caja sin cuenta identificada", count: 1, amount: unassignedCash, detail: "Movimientos canónicos sin cuenta de origen/destino; requieren clasificación.", href: "/finance/cash-flow", severity: "warning" })] : []),
  ].filter((risk) => risk.count > 0);

  const riskCount = risks.reduce((total, risk) => total + risk.count, 0);
  const payrollTotal = sum(monthlyPayroll, (row) => number(row.payroll_net));
  return {
    generatedAt: now.toISOString(),
    periodLabel: monthName.format(now),
    cash: {
      total: availableCash,
      unassigned: unassignedCash,
      accounts: configuredAccounts.map(account => ({ label:account.name, value: cashAccounts.get(account.code) ?? 0, href: `/finance/cash-flow?account=${account.code}` })),
    },
    today: [
      moneyMetric("Ventas de hoy", todayRevenue, "Eventos activos con fecha de hoy.", "/projects?date=today"),
      moneyMetric("Cobros de hoy", collectionsToday, "Movimientos recibidos hoy.", "/finance/receivables?date=today"),
      moneyMetric("Pagos de hoy", paymentsToday, "Egresos pagados hoy.", "/finance/cash-flow?date=today"),
      moneyMetric("Costo operacional de hoy", todayCost, "Costo real de Eventos de hoy.", "/projects?date=today&view=profitability"),
      moneyMetric("Profit de hoy", todayProfit, "Ventas menos costo real de Eventos de hoy.", "/projects?date=today&view=profitability", todayProfit >= 0 ? "success" : "danger"),
    ],
    month: [
      moneyMetric("Ventas del mes", monthlyRevenue, "Financial Truth confirmado por fecha de Evento.", "/projects?period=month"),
      moneyMetric("Cobrado del mes", collectionsMonth, "Impacto de caja canónico del Payment Ledger.", "/finance/receivables?period=month"),
      moneyMetric("Costos directos de Eventos", monthlyCosts, "Costo real de Eventos confirmados del mes.", "/projects?period=month&view=profitability"),
      moneyMetric("Gastos fijos comprometidos", fixedMonthlyExpenses, "Overhead mensual vigente; no reduce caja hasta su pago.", "/finance/expenses"),
      moneyMetric("Resultado de Eventos", performance.eventResult, "Ventas menos costos directos.", "/projects?period=month&view=profitability", performance.eventResult >= 0 ? "success" : "danger"),
      moneyMetric("Resultado operativo", performance.operatingResult, "Resultado de Eventos menos overhead mensual.", "/finance/expenses", performance.operatingResult >= 0 ? "success" : "danger"),
      { label: "Margen de Eventos", value: performance.eventMargin, format: "percent", detail: "Resultado de Eventos sobre ventas del mes.", href: "/projects?period=month&view=profitability", tone: performance.eventMargin >= 0 ? "success" : "danger" },
      { label: "Margen operativo", value: performance.operatingMargin, format: "percent", detail: "Resultado operativo sobre ventas del mes.", href: "/finance/expenses", tone: performance.operatingMargin >= 0 ? "success" : "danger" },
      moneyMetric("Nómina devengada del mes", payrollTotal, "Liquidaciones del mes contable; no equivale necesariamente a pago.", "/resources/staff?workspace=payroll"),
      moneyMetric("Egresos pagados del mes", expensesMonth, "Gastos y combustible materializados durante el mes.", "/finance/expenses?period=month"),
    ],
    position: [
      moneyMetric("Cobrado acumulado", collectedAll, "Impacto de caja canónico acumulado.", "/finance/receivables?status=paid"),
      moneyMetric("Por cobrar total", outstanding, "Saldo global de cuentas activas.", "/finance/receivables", outstanding > 0 ? "warning" : "default"),
      moneyMetric("Saldos Clientes / Eventos", receivableDataset.metrics.paymentCategorySummary.ordinary, "Pendiente ordinario sin crédito empresarial.", "/finance/receivables?category=ordinary"),
      moneyMetric("Crédito Empresas", receivableDataset.metrics.companyCredits, "Saldo corporativo, con o sin plazo definido.", "/finance/receivables?category=company-credit"),
      moneyMetric("Caja registrada", availableCash, "Cobrado acumulado menos egresos pagados registrados; no es saldo bancario.", "/finance/cash-flow", availableCash >= 0 ? "success" : "danger"),
      moneyMetric("Egresos acumulados registrados", outgoingAll, "Gastos, Staff y combustible efectivamente registrados.", "/finance/cash-flow?direction=outgoing"),
      { label: "Riesgos próximos", value: riskCount, format: "count", detail: "Alertas financieras accionables.", href: "#financial-risks", tone: riskCount ? "danger" : "success" },
    ],
    forecast: [
      moneyMetric("Cobros proyectados", projectedCollections, "Vencimientos activos de los próximos 30 días.", "/finance/receivables?range=30"),
      moneyMetric("Pagos proyectados", projectedPayments, "Gastos y liquidaciones pendientes del horizonte.", "/finance/cash-flow?range=30"),
      moneyMetric("Caja proyectada", projectedCash, "Caja disponible + cobros − pagos proyectados.", "/finance/cash-flow?range=30", projectedCash >= 0 ? "success" : "danger"),
      { label: "Advertencia de caja negativa", value: projectedCash < 0 ? 1 : 0, format: "count", detail: projectedCash < 0 ? "La proyección a 30 días es negativa." : "No se proyecta caja negativa.", href: "/finance/cash-flow?range=30", tone: projectedCash < 0 ? "danger" : "success" },
    ],
    risks,
  };
}
