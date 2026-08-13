import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialTruth } from "@/features/business-engine";

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
  headline: FinanceMetric[];
  cash: {
    total: number;
    unassigned: number;
    accounts: { label: string; value: number; href: string }[];
  };
  today: FinanceMetric[];
  month: FinanceMetric[];
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

  const [truth, receivablesResult, paymentsResult, expensesResult, settlementsResult, staffMovementsResult, fuelResult, integrityResult,bankAccountsResult] = await Promise.all([
    loadFinancialTruth(client),
    client.from("accounts_receivable_projection").select("id,project_id,customer_id,due_date,amount,paid_amount,outstanding_balance,effective_status"),
    client.from("invoice_payments").select("id,invoice_id,amount,paid_at,method,deleted_at,invoices!inner(financial_record_state,record_origin,status,deleted_at)").is("deleted_at", null).eq("invoices.financial_record_state", "ACTIVE").eq("invoices.record_origin", "PRODUCTION").neq("invoices.status", "CANCELLED").is("invoices.deleted_at", null),
    client.from("expenses").select("id,project_id,occurred_on,total,status,receipt_path,approval_reason,event_staff_settlement_id").is("deleted_at", null),
    client.from("staff_settlement_financials").select("settlement_id,project_id,staff_id,accounting_month,payroll_net,final_amount,paid_amount,remaining_balance,sii_receipt_status"),
    client.from("event_staff_settlement_movements").select("id,settlement_id,movement_type,amount,movement_date,method").is("deleted_at", null),
    client.from("vehicle_fuel_logs").select("id,fuel_date,total_amount,receipt_path"),
    client.from("financial_integrity_issues").select("id,status").eq("status", "OPEN"),
    client.from("finance_bank_accounts").select("code,name,account_kind,is_primary").eq("active",true).order("is_primary",{ascending:false}),
  ]);
  const error = receivablesResult.error ?? paymentsResult.error ?? expensesResult.error ?? settlementsResult.error ?? staffMovementsResult.error ?? fuelResult.error??bankAccountsResult.error;
  if (error) throw error;

  const activeTruth = truth.filter((row) => row.status === "CONFIRMED");
  const activeProjectIds = new Set(activeTruth.map((row) => row.projectId));
  const todayTruth = activeTruth.filter((row) => row.eventDate === today);
  const monthTruth = activeTruth.filter((row) => row.eventDate?.startsWith(month));
  const receivables = receivablesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const expenses = (expensesResult.data ?? []).filter((row) => !row.project_id || activeProjectIds.has(row.project_id));
  const settlements = (settlementsResult.data ?? []).filter((row) => activeProjectIds.has(row.project_id));
  const activeSettlementIds = new Set(settlements.map((row) => row.settlement_id));
  const staffMovements = (staffMovementsResult.data ?? []).filter((row) => activeSettlementIds.has(row.settlement_id));
  const expenseReceipts = new Set(expenses.map((row) => row.receipt_path).filter(Boolean));
  const fuel = (fuelResult.data ?? []).filter((row) => !expenseReceipts.has(row.receipt_path));

  const collectedAll = sum(payments, (row) => number(row.amount));
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
  payments.forEach((row) => registerCash(row.method, number(row.amount)));
  paidExpenses.forEach((row) => {
    const meta = metadata(row.approval_reason);
    registerCash(meta.sourceAccount ?? meta.bank ?? meta.paymentMethod, -number(row.total));
  });
  staffCashMovements.forEach((row) => registerCash(row.method, -row.signedAmount));
  fuel.forEach((row) => registerCash(null, -number(row.total_amount)));

  const todayPayments = payments.filter((row) => dateOnly(row.paid_at) === today);
  const monthPayments = payments.filter((row) => dateOnly(row.paid_at).startsWith(month));
  const todayExpenses = paidExpenses.filter((row) => row.occurred_on === today);
  const monthExpenses = paidExpenses.filter((row) => row.occurred_on?.startsWith(month));
  const todayStaff = staffCashMovements.filter((row) => row.movement_date === today);
  const todayFuel = fuel.filter((row) => row.fuel_date === today);
  const monthFuel = fuel.filter((row) => row.fuel_date?.startsWith(month));
  const monthlyPayroll = settlements.filter((row) => row.accounting_month?.startsWith(month));
  const outstanding = sum(receivables.filter((row) => !["PAID", "CANCELLED"].includes(row.effective_status)), (row) => number(row.outstanding_balance));
  const monthlyRevenue = sum(monthTruth, (row) => row.revenue);
  const monthlyCosts = sum(monthTruth, (row) => row.realCost);
  const monthlyProfit = sum(monthTruth, (row) => row.netProfit);
  const monthlyMargin = monthlyRevenue ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const todayRevenue = sum(todayTruth, (row) => row.revenue);
  const todayCost = sum(todayTruth, (row) => row.realCost);
  const todayProfit = sum(todayTruth, (row) => row.netProfit);
  const collectionsToday = sum(todayPayments, (row) => number(row.amount));
  const collectionsMonth = sum(monthPayments, (row) => number(row.amount));
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
  const headline: FinanceMetric[] = [
    moneyMetric("Ventas", monthlyRevenue, "Ventas del mes desde Financial Truth.", "/projects?period=month"),
    moneyMetric("Cobrado", collectionsMonth, "Movimientos del Payment Ledger este mes.", "/finance/receivables?status=paid"),
    moneyMetric("Por cobrar", outstanding, "Saldo de cuentas por cobrar activas.", "/finance/receivables?status=outstanding", outstanding > 0 ? "warning" : "default"),
    moneyMetric("Nómina", payrollTotal, "Liquidaciones del mes contable.", "/resources/staff?workspace=payroll"),
    moneyMetric("Costos operacionales", monthlyCosts, "Costo real de Eventos del mes.", "/projects?view=profitability"),
    moneyMetric("Profit neto", monthlyProfit, "Ventas netas menos costos reales.", "/projects?view=profitability", monthlyProfit >= 0 ? "success" : "danger"),
    { label: "Margen", value: monthlyMargin, format: "percent", detail: "Margen neto del mes.", href: "/projects?view=profitability", tone: monthlyMargin >= 0 ? "success" : "danger" },
    moneyMetric("Caja disponible", availableCash, "Cobros menos egresos pagados registrados.", "/finance/cash-flow", availableCash >= 0 ? "success" : "danger"),
    { label: "Riesgos próximos", value: riskCount, format: "count", detail: "Alertas accionables abiertas.", href: "#financial-risks", tone: riskCount ? "danger" : "success" },
  ];

  return {
    generatedAt: now.toISOString(),
    periodLabel: monthName.format(now),
    headline,
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
      moneyMetric("Ventas", monthlyRevenue, "Eventos del mes.", "/projects?period=month"),
      moneyMetric("Cobrado", collectionsMonth, "Payment Ledger del mes.", "/finance/receivables?period=month"),
      moneyMetric("Por cobrar", outstanding, "Cuentas activas abiertas.", "/finance/receivables?status=outstanding"),
      moneyMetric("Nómina", payrollTotal, "Liquidaciones del mes contable.", "/resources/staff?workspace=payroll"),
      moneyMetric("Gastos", expensesMonth, "Gastos y combustible pagados este mes.", "/finance/expenses?period=month"),
      moneyMetric("Profit neto", monthlyProfit, "Financial Truth del mes.", "/projects?period=month&view=profitability", monthlyProfit >= 0 ? "success" : "danger"),
      { label: "Margen", value: monthlyMargin, format: "percent", detail: "Margen neto del mes.", href: "/projects?period=month&view=profitability", tone: monthlyMargin >= 0 ? "success" : "danger" },
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
