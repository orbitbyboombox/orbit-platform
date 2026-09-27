import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";

export async function GET() {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const admin = createAdminClient();
  const [closeResult, settingsResult, settlementsResult] = await Promise.all([
    admin.from("staff_monthly_closes").select("accounting_month,status,due_date,closed_at,paid_at").order("accounting_month", { ascending: false }),
    admin.from("company_settings").select("legal_name,tax_id,address,city").eq("settings_key", "PRIMARY").maybeSingle(),
    admin.from("event_staff_payments").select("id,accounting_month").eq("staff_id", session.staff_id).is("deleted_at", null),
  ]);
  const settlementIds = (settlementsResult.data ?? []).map((row) => row.id);
  const movementsResult = settlementIds.length
    ? await admin.from("event_staff_settlement_movements").select("id,settlement_id,movement_type,amount,movement_date,notes").in("settlement_id", settlementIds).is("deleted_at", null).order("movement_date", { ascending: false })
    : { data: [], error: null };
  const error = closeResult.error ?? settingsResult.error ?? settlementsResult.error ?? movementsResult.error;
  if (error) return NextResponse.json({ message: "No fue posible cargar Finanzas." }, { status: 500 });
  const monthBySettlement = new Map((settlementsResult.data ?? []).map((row) => [row.id, String(row.accounting_month)]));
  return NextResponse.json({
    company: settingsResult.data ? { legalName: settingsResult.data.legal_name, taxId: settingsResult.data.tax_id, address: settingsResult.data.address, city: settingsResult.data.city } : null,
    closes: closeResult.data ?? [],
    movements: (movementsResult.data ?? []).map((row) => ({ id: row.id, settlementId: row.settlement_id, month: monthBySettlement.get(row.settlement_id) ?? "", type: row.movement_type, amount: Number(row.amount), date: row.movement_date, notes: row.notes ?? "" })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
