import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReceivableCustomer,
  ReceivableDataset,
  ReceivableInvoice,
} from "./types";
export async function loadAccountsReceivable(
  client: SupabaseClient,
): Promise<ReceivableDataset> {
  await client.rpc("refresh_receivable_notifications");
  const [
    invoicesResult,
    customersResult,
    projectsResult,
    quotesResult,
    agreementsResult,
    paymentsResult,
  ] = await Promise.all([
    client
      .from("accounts_receivable_projection")
      .select(
        "id,invoice_number,customer_id,project_id,orbit_event_id,customer_type,status,effective_status,amount,paid_amount,outstanding_balance,issue_date,due_date,payment_term,custom_term_days,purchase_order,days_remaining,aging_bucket,version,customers(full_name),projects(name)",
      )
      .order("due_date", { ascending: true, nullsFirst: false }),
    client
      .from("customers")
      .select("id,full_name,metadata")
      .is("deleted_at", null)
      .order("full_name"),
    client
      .from("projects")
      .select(
        "id,name,orbit_event_id,customer_id,customers(full_name,company,metadata)",
      )
      .is("deleted_at", null)
      .order("event_date", { ascending: true, nullsFirst: false }),
    client
      .from("quotations")
      .select("id,project_id,status,grand_total,final_customer_price")
      .eq("status", "ACCEPTED")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("agreements")
      .select("id,project_id,status")
      .order("created_at", { ascending: false }),
    client.from("invoice_payments").select("invoice_id,paid_at,created_at"),
  ]);
  const failure = [
    invoicesResult,
    customersResult,
    projectsResult,
    quotesResult,
    agreementsResult,
    paymentsResult,
  ].find((x) => x.error)?.error;
  if (failure) throw failure;
  const invoices: ReceivableInvoice[] = (invoicesResult.data ?? []).map(
    (row) => {
      const customer = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      const project = Array.isArray(row.projects)
        ? row.projects[0]
        : row.projects;
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        customerId: row.customer_id,
        customerName: customer?.full_name ?? "Cliente",
        projectId: row.project_id,
        projectName: project?.name ?? "Evento",
        orbitEventId: row.orbit_event_id,
        customerType: row.customer_type,
        status: row.effective_status,
        amount: Number(row.amount),
        paidAmount: Number(row.paid_amount),
        outstandingBalance: Number(row.outstanding_balance),
        issueDate: row.issue_date,
        dueDate: row.due_date,
        paymentTerm: row.payment_term,
        customTermDays: row.custom_term_days,
        purchaseOrder: row.purchase_order,
        daysRemaining: row.days_remaining,
        agingBucket: row.aging_bucket,
        version: row.version,
      };
    },
  );
  const customerRows = (customersResult.data ?? []).filter((row) => {
    const m = row.metadata as Record<string, unknown>;
    return m.record_type !== "SYSTEM_CERTIFICATION";
  });
  const customers: ReceivableCustomer[] = customerRows.map((row) => {
    const own = invoices.filter((x) => x.customerId === row.id);
    const paid = own.filter(
      (x) => x.status === "PAID" && x.issueDate && x.dueDate,
    );
    const paymentDates = (paymentsResult.data ?? []).filter((p) =>
      own.some((x) => x.id === p.invoice_id),
    );
    const avg =
      paid.length && paymentDates.length
        ? Math.round(
            paymentDates.reduce((s, p) => {
              const invoice = own.find((x) => x.id === p.invoice_id);
              return (
                s +
                (invoice?.issueDate
                  ? Math.max(
                      0,
                      (new Date(p.paid_at).getTime() -
                        new Date(invoice.issueDate).getTime()) /
                        86400000,
                    )
                  : 0)
              );
            }, 0) / paymentDates.length,
          )
        : null;
    const creditHistory: ReceivableCustomer["creditHistory"] = own.length
      ? own.some((x) => x.status === "OVERDUE")
        ? "CON_ATRASO"
        : "AL_DIA"
      : "SIN_HISTORIAL";
    return {
      id: row.id,
      name: row.full_name,
      totalInvoiced: own
        .filter((x) => x.status !== "CANCELLED")
        .reduce((s, x) => s + x.amount, 0),
      outstandingBalance: own.reduce((s, x) => s + x.outstandingBalance, 0),
      overdueInvoices: own.filter((x) => x.status === "OVERDUE").length,
      averagePaymentDays: avg,
      creditHistory,
    };
  });
  type QuoteRow = {
    id: string;
    project_id: string;
    status: string;
    grand_total: number;
    final_customer_price: number | null;
  };
  type AgreementRow = { id: string; project_id: string; status: string };
  const latestQuotes = new Map<string, QuoteRow>();
  for (const q of quotesResult.data ?? [])
    if (!latestQuotes.has(q.project_id))
      latestQuotes.set(q.project_id, q as QuoteRow);
  const latestAgreements = new Map<string, AgreementRow>();
  for (const a of agreementsResult.data ?? [])
    if (!latestAgreements.has(a.project_id))
      latestAgreements.set(a.project_id, a as AgreementRow);
  const projects = (projectsResult.data ?? []).flatMap((row) => {
    const c = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const m = (c?.metadata ?? {}) as Record<string, unknown>;
    if (m.record_type === "SYSTEM_CERTIFICATION") return [];
    const q = latestQuotes.get(row.id);
    return [
      {
        id: row.id,
        name: row.name,
        orbitEventId: row.orbit_event_id,
        customerId: row.customer_id,
        customerName: c?.full_name ?? "Cliente",
        customerType: c?.company
          ? ("CORPORATE" as const)
          : ("PRIVATE" as const),
        quotationId: q?.id ?? null,
        agreementId: latestAgreements.get(row.id)?.id ?? null,
        amount: Number(q?.final_customer_price ?? q?.grand_total ?? 0),
      },
    ];
  });
  const active = invoices.filter(
    (x) => !["CANCELLED", "DRAFT"].includes(x.status),
  );
  const aging = { "15": 0, "30": 0, "60": 0, "90+": 0 };
  invoices.forEach((x) => {
    if (x.agingBucket in aging)
      aging[x.agingBucket as keyof typeof aging] += x.outstandingBalance;
  });
  return {
    generatedAt: new Date().toISOString(),
    invoices,
    customers,
    projects,
    metrics: {
      accountsReceivable: active.reduce((s, x) => s + x.amount, 0),
      outstandingBalance: active.reduce((s, x) => s + x.outstandingBalance, 0),
      overdueBalance: invoices
        .filter((x) => x.status === "OVERDUE")
        .reduce((s, x) => s + x.outstandingBalance, 0),
      averageCollectionDays: (() => {
        const values = customers
          .map((x) => x.averagePaymentDays)
          .filter((x): x is number => x !== null);
        return values.length
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : null;
      })(),
      aging,
    },
  };
}
