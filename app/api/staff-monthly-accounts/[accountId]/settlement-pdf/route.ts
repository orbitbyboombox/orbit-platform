import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStaffMonthlySettlementPdf } from "@/features/staff-monthly-account/settlement-pdf";
import {
  mapStaffMonthlyAccount,
  monthlySettlementPath,
  STAFF_MONTHLY_ACCOUNT_SELECT,
} from "@/features/staff-monthly-account/model";
import {
  periodLabel,
  periodPdfAccount,
  type StaffPeriodPreview,
} from "@/features/staff-monthly-account/payment-periods.model";

async function access() {
  const portal = await loadPortalSession("STAFF");
  if (portal?.staff_id) return { staffId: portal.staff_id, admin: false };
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  return profile && ["CEO", "ADMINISTRATOR"].includes(profile.role)
    ? { staffId: null, admin: true }
    : null;
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const permission = await access();
  if (!permission)
    return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const { accountId } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("staff_monthly_accounts")
    .select(STAFF_MONTHLY_ACCOUNT_SELECT)
    .eq("id", accountId)
    .maybeSingle();
  if (!row || (!permission.admin && permission.staffId !== row.staff_id))
    return NextResponse.json({ message: "No autorizado." }, { status: 403 });
  const url = new URL(request.url);
  const periodId = url.searchParams.get("period");
  let body: Buffer;
  let fileSuffix = "";
  if (!periodId && row.settlement_document_id) {
    const { data: file, error } = await admin.storage
      .from("orbit-documents")
      .download(
        monthlySettlementPath(
          String(row.staff_id),
          String(row.accounting_month),
        ),
      );
    if (error || !file)
      return NextResponse.json(
        { message: "PDF protegido no encontrado." },
        { status: 404 },
      );
    body = Buffer.from(await file.arrayBuffer());
  } else {
    const { data: staff } = await admin
      .from("staff")
      .select("first_name,last_name,rut,role")
      .eq("id", row.staff_id)
      .maybeSingle();
    if (!staff)
      return NextResponse.json(
        { message: "Staff no encontrado." },
        { status: 404 },
      );
    let account = mapStaffMonthlyAccount(row);
    let periodTitle: string | undefined;
    let firstQuincena = false;
    if (periodId) {
      const { data: period } = await admin
        .from("staff_payment_periods")
        .select("*")
        .eq("id", periodId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (!period || (!permission.admin && period.status !== "FINALIZED"))
        return NextResponse.json(
          { message: "Período no disponible." },
          { status: 404 },
        );
      let calculation = period.snapshot;
      if (period.status !== "FINALIZED") {
        const result = await admin.rpc("staff_payment_period_calculation", {
          p_period_id: periodId,
        });
        if (result.error)
          return NextResponse.json(
            { message: "No se pudo previsualizar el bloque." },
            { status: 409 },
          );
        calculation = result.data;
      }
      account = periodPdfAccount(account, {
        ...period,
        calculation,
        paidAmount: 0,
        remaining: 0,
      } as StaffPeriodPreview);
      periodTitle = `${periodLabel(period.period_code)} | ${period.starts_on} - ${period.ends_on}`;
      firstQuincena = period.period_code !== "MONTH";
      fileSuffix = `-${period.period_code}`;
    }
    body = await createStaffMonthlySettlementPdf({
      account,
      staff: {
        name: `${staff.first_name} ${staff.last_name}`,
        rut: staff.rut ?? "",
        role: staff.role ?? "",
      },
      periodTitle,
      firstQuincena,
    });
  }
  const download = url.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="liquidacion-staff-${String(row.accounting_month).slice(0, 7)}${fileSuffix}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
