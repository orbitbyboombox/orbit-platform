import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return NextResponse.json({ error: "Sesión requerida." }, { status: 401, headers });
  const { projectId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) return NextResponse.json({ error: "Evento inválido." }, { status: 400, headers });
  const admin = createAdminClient();
  const assignment = await admin.from("assignments").select("id").eq("project_id", projectId).eq("staff_id", session.staff_id).is("deleted_at", null).not("status", "in", '(CANCELLED,REJECTED)').limit(1);
  if (assignment.error) return NextResponse.json({ error: "No fue posible verificar el acceso." }, { status: 503, headers });
  if (!assignment.data?.length) return NextResponse.json({ error: "Evento no asignado." }, { status: 403, headers });
  const [contract, paper] = await Promise.all([
    admin.from("project_operational_contracts").select("photo_style,operator_print_notes").eq("project_id", projectId).maybeSingle(),
    admin.from("event_paper_snapshots").select("paper_variant").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
  ]);
  if (contract.error || paper.error) return NextResponse.json({ error: "No fue posible cargar las indicaciones." }, { status: 503, headers });
  const style = contract.data?.photo_style;
  return NextResponse.json({ photoStyle: ["COLOR", "BLACK_WHITE", "SEPIA"].includes(style) ? style : null, operatorNote: contract.data?.operator_print_notes ?? "", paperVariant: paper.data?.[0]?.paper_variant ?? null }, { headers });
}
