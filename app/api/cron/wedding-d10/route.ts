import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planD10AutoEmails } from "@/features/accounts-receivable/d10-auto-policy";

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
  const { data: invoices, error } = await admin.from("accounts_receivable_projection")
    .select("id,project_id,status,outstanding_balance,customers(email),projects(project_type,event_date,status)")
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
    }, today, []);
    return [{ projectId: invoice.project_id, collectionCandidate: planned.collection, readyRequiresValidatedDetails: true }];
  });
  return NextResponse.json({ ok: true, mode: "PREVIEW_ONLY", today, target, candidates: results, sent: 0 });
}
