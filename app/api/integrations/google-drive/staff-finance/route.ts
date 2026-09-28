import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { syncStaffFinanceDocuments } from "@/features/connectors/google-drive/application/staff-finance-document-sync.service";

export async function GET() {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const client = createAdminClient();
  const [expenses, reimbursements, payments] = await Promise.all([
    client.from("staff_expense_submissions").select("id,staff_id,receipt_path,document_id").not("receipt_path", "is", null),
    client.from("staff_reimbursement_payments").select("id,staff_id,receipt_document_id"),
    client.from("event_staff_settlement_movements").select("id,receipt_path,receipt_document_id").is("deleted_at", null).not("receipt_path", "is", null),
  ]);
  return NextResponse.json({
    ok: true,
    expenseReceipts: expenses.data?.length ?? 0,
    reimbursementReceipts: reimbursements.data?.length ?? 0,
    paymentReceipts: payments.data?.length ?? 0,
    missingExpenseDocuments: (expenses.data ?? []).filter((row) => !row.document_id).length,
    missingReimbursementDocuments: (reimbursements.data ?? []).filter((row) => !row.receipt_document_id).length,
    missingPaymentDocuments: (payments.data ?? []).filter((row) => !row.receipt_document_id).length,
  });
}

export async function POST(request: NextRequest) {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const result = await syncStaffFinanceDocuments({ client: createAdminClient(), from: body.from, to: body.to });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[staff-finance-drive-sync]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No fue posible sincronizar documentos Staff." }, { status: 500 });
  }
}
