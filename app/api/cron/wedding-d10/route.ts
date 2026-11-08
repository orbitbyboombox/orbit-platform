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
  const { data: projects, error } = await admin.from("projects")
    .select("id,project_type,event_date,status,customers(email),accounts_receivable_projection(outstanding_balance,status)")
    .eq("event_date", target)
    .limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const results = (projects ?? []).map(project => {
    const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
    const invoices = project.accounts_receivable_projection ?? [];
    const outstanding = invoices.reduce((sum, item) => sum + Math.max(0, Number(item.outstanding_balance) || 0), 0);
    const planned = planD10AutoEmails({
      projectId: project.id,
      projectType: project.project_type ?? "",
      eventDate: project.event_date,
      status: project.status ?? "",
      outstandingBalance: outstanding,
      customerEmail: customer?.email ?? null,
      confirmed: project.status === "CONFIRMED",
      readyDetailsComplete: false,
    }, today, []);
    return { projectId: project.id, collectionCandidate: planned.collection, readyRequiresValidatedDetails: true };
  });
  return NextResponse.json({ ok: true, mode: "PREVIEW_ONLY", today, target, candidates: results, sent: 0 });
}
