import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planD10AutoEmails } from "@/features/accounts-receivable/d10-auto-policy";
import { buildCollectionEmailDraft } from "@/features/accounts-receivable/collection-email.template";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { resolveCollectionEventDetail } from "@/features/accounts-receivable/collection-event-detail";

/**
 * Safe operational preview. Does not send email or write data.
 * Keep this endpoint in preview-only mode until atomic delivery claims,
 * audited communications and Gmail reconciliation pass isolated QA.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const eventDate = new Date(`${today}T12:00:00Z`);
  eventDate.setUTCDate(eventDate.getUTCDate() + 10);
  const target = eventDate.toISOString().slice(0, 10);
  const admin = createAdminClient();
  const company = await loadCompanySettings(admin);
  const bankDetails = resolveCollectionBankDetails(company);
  const { data: invoices, error } = await admin.from("accounts_receivable_projection")
    .select("id,invoice_number,customer_id,project_id,status,amount,paid_amount,outstanding_balance,due_date,days_remaining,customers(full_name,email,secondary_email),projects(name,project_type,event_date,status,location,city,operations,project_services(service_code,duration_hours),project_operational_contracts(service_start_at,service_end_at))")
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const { data: history, error: historyError } = await admin.from("communications")
    .select("project_id,communication_type,status,thread_key")
    .in("communication_type", ["COLLECTION_D10", "EVENT_READY_D10", "COLLECTION_EMAIL"]);
  if (historyError) return NextResponse.json({ ok: false, error: historyError.message }, { status: 500 });
  const results = (invoices ?? []).flatMap(invoice => {
    const project = Array.isArray(invoice.projects) ? invoice.projects[0] : invoice.projects;
    if (!project || project.event_date !== target) return [];
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const outstanding = Number(invoice.outstanding_balance) || 0;
    const planned = planD10AutoEmails({
      projectId: invoice.project_id,
      projectType: project.project_type ?? "",
      eventDate: project.event_date,
      status: project.status ?? "",
      outstandingBalance: outstanding,
      customerEmail: customer?.email ?? null,
      confirmed: project.status === "CONFIRMED",
      readyDetailsComplete: false,
    }, today, (history ?? []).filter(item => item.thread_key?.startsWith(`d10:${invoice.project_id}:`)).map(item => ({
      projectId: item.project_id ?? "",
      type: item.communication_type === "COLLECTION_EMAIL" ? "COLLECTION_D10" as const : item.communication_type as "COLLECTION_D10" | "EVENT_READY_D10",
      status: item.status as "PENDING" | "SENT" | "FAILED",
    })));
    const operational = Array.isArray(project.project_operational_contracts) ? project.project_operational_contracts[0] : project.project_operational_contracts;
    const detail = resolveCollectionEventDetail({
      eventDate: project.event_date, location: project.location, city: project.city,
      operations: project.operations,
      services: (project.project_services ?? []).map(item => ({ serviceCode: item.service_code, durationHours: Number(item.duration_hours ?? 0) || null })),
      operationalContract: operational ? { serviceStartAt: operational.service_start_at, serviceEndAt: operational.service_end_at } : null,
    });
    const draft = planned.collection ? buildCollectionEmailDraft({
      invoiceNumber: invoice.invoice_number, customerName: customer?.full_name ?? "Cliente",
      customerEmail: customer?.email ?? null, customerSecondaryEmail: customer?.secondary_email ?? null,
      projectName: project.name ?? "BOOMBOX", amount: Number(invoice.amount),
      outstandingBalance: outstanding, dueDate: invoice.due_date,
      daysRemaining: invoice.days_remaining, status: invoice.status as "PENDING",
      eventDate: detail.eventDate, eventLocation: detail.eventLocation,
      service: detail.service, eventDuration: detail.eventDuration, collectionActions: [],
    }, bankDetails) : null;
    return [{ projectId: invoice.project_id, collectionCandidate: planned.collection,
      collectionSubject: draft?.subject ?? null, readyRequiresValidatedDetails: true }];
  });
  return NextResponse.json({ ok: true, mode: "PREVIEW_ONLY", today, target, candidates: results, sent: 0 });
}
