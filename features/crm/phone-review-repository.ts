import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneE164 } from "@/lib/phone/e164";

export type PhoneReviewRecord = {
  id: string;
  fullName: string;
  company: string;
  phone: string;
  phoneE164: string | null;
  status: string;
  reviewedAt: string | null;
  reviewedDecision: string | null;
  duplicateGroup: string | null;
  projects: number;
  quotes: number;
  reservations: number;
  invoices: number;
  hasPaidHistory: boolean;
};

export type PhoneReviewData = {
  records: PhoneReviewRecord[];
  counts: { ambiguous: number; duplicates: number; empty: number; reviewed: number };
};

type CustomerRow = {
  id: string;
  full_name: string;
  company: string | null;
  phone: string | null;
  phone_e164: string | null;
  phone_e164_status: string;
  phone_reviewed_at: string | null;
  phone_review_decision: string | null;
};

export async function loadPhoneReviewData(client: SupabaseClient): Promise<PhoneReviewData> {
  const [{ data: customers, error }, { data: projects, error: projectsError }, { data: quotes, error: quotesError }, { data: reservations, error: reservationsError }, { data: invoices, error: invoicesError }] = await Promise.all([
    client.from("customers").select("id,full_name,company,phone,phone_e164,phone_e164_status,phone_reviewed_at,phone_review_decision").is("deleted_at", null).order("full_name"),
    client.from("projects").select("id,customer_id").is("deleted_at", null),
    client.from("quotations").select("id,customer_id").is("deleted_at", null),
    client.from("crm_reservations").select("id,customer_id"),
    client.from("invoices").select("id,customer_id,paid_amount").is("deleted_at", null),
  ]);
  if (error) throw error;
  if (projectsError) throw projectsError;
  if (quotesError) throw quotesError;
  if (reservationsError) throw reservationsError;
  if (invoicesError) throw invoicesError;

  const duplicateCounts = new Map<string, number>();
  for (const row of (customers ?? []) as CustomerRow[]) {
    const canonical = normalizePhoneE164(row.phone);
    if (canonical) duplicateCounts.set(canonical, (duplicateCounts.get(canonical) ?? 0) + 1);
  }
  const countBy = (rows: Array<{ customer_id: string }> | null | undefined) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
    return counts;
  };
  const projectCounts = countBy(projects);
  const quoteCounts = countBy(quotes);
  const reservationCounts = countBy(reservations);
  const invoiceRows = (invoices ?? []) as Array<{ customer_id: string; paid_amount: number | null }>;
  const invoiceCounts = countBy(invoiceRows);
  const paidCustomers = new Set(invoiceRows.filter((row) => Number(row.paid_amount ?? 0) > 0).map((row) => row.customer_id));

  const records = ((customers ?? []) as CustomerRow[]).map((row) => {
    const canonical = normalizePhoneE164(row.phone);
    return {
      id: row.id,
      fullName: row.full_name,
      company: row.company ?? "",
      phone: row.phone ?? "",
      phoneE164: row.phone_e164,
      status: row.phone_e164_status,
      reviewedAt: row.phone_reviewed_at,
      reviewedDecision: row.phone_review_decision,
      duplicateGroup: canonical && (duplicateCounts.get(canonical) ?? 0) > 1 ? canonical : null,
      projects: projectCounts.get(row.id) ?? 0,
      quotes: quoteCounts.get(row.id) ?? 0,
      reservations: reservationCounts.get(row.id) ?? 0,
      invoices: invoiceCounts.get(row.id) ?? 0,
      hasPaidHistory: paidCustomers.has(row.id),
    } satisfies PhoneReviewRecord;
  });

  return {
    records,
    counts: {
      ambiguous: records.filter((row) => row.status === "AMBIGUOUS" && !row.reviewedAt).length,
      duplicates: records.filter((row) => row.status === "DUPLICATE_REVIEW" && !row.reviewedAt).length,
      empty: records.filter((row) => row.status === "EMPTY" && !row.reviewedAt).length,
      reviewed: records.filter((row) => Boolean(row.reviewedAt)).length,
    },
  };
}
