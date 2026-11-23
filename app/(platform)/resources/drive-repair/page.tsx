import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { repairPendingDocumentBackupsAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";
import { DriveRepairBatch } from "./drive-repair-batch";
import { createAdminClient } from "@/lib/supabase/admin";

async function repairFromForm(formData: FormData) {
  "use server";
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!documentId) redirect("/resources/drive-repair?error=missing-document-id");
  try {
    const result = await repairPendingDocumentBackupsAction([documentId]);
    redirect(`/resources/drive-repair?result=${encodeURIComponent(JSON.stringify(result))}`);
  } catch (error) {
    const digest = typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
    if (digest.startsWith("NEXT_REDIRECT") || (error instanceof Error && error.message === "NEXT_REDIRECT")) throw error;
    redirect(`/resources/drive-repair?error=${encodeURIComponent(error instanceof Error ? error.message : "No fue posible reparar el documento.")}`);
  }
}

export default async function DriveRepairPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!isAdministrativeRole(profile?.role)) redirect("/resources");
  const admin = createAdminClient();
  const { data: pendingDocuments, error: pendingError } = await admin.from("documents").select("id").is("deleted_at", null).is("drive_file_id", null).in("document_type", ["PAYMENT_RECEIPT", "COMMERCIAL_DOCUMENT", "STAFF_EXPENSE_RECEIPT"]).order("id", { ascending: true }).limit(26);
  const params = await searchParams;
  let resultText = "";
  if (params.result) {
    try { resultText = JSON.stringify(JSON.parse(params.result), null, 2); } catch { resultText = params.result; }
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header className="rounded-2xl border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Founder / Administración</p>
      <h1 className="mt-2 text-2xl font-semibold">Reparación explícita de respaldos Drive</h1>
      <p className="mt-2 text-sm text-muted">Selecciona un documento pendiente por ID. Esta herramienta no ejecuta reparaciones masivas.</p>
    </header>
    <form action={repairFromForm} className="space-y-4 rounded-2xl border bg-card p-6">
      <label className="block text-sm font-medium" htmlFor="documentId">ID de public.documents</label>
      <input id="documentId" name="documentId" required className="min-h-11 w-full rounded-xl border bg-background px-3" placeholder="UUID del documento" />
      <button className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-black" type="submit">Reparar documento seleccionado</button>
      <p className="text-xs text-muted">Se valida Storage, SHA-256, tamaño, MIME, carpeta canónica, MD5 hexadecimal de Drive y vínculo idempotente.</p>
    </form>
    {pendingError
      ? <div role="alert" className="rounded-xl border border-red-500 p-4 text-sm">No se pudieron consultar los documentos pendientes: {pendingError.message}</div>
      : pendingDocuments && pendingDocuments.length > 25
        ? <div role="alert" className="rounded-xl border p-4 text-sm">Hay más de 25 documentos pendientes; requiere revisión por lotes.</div>
        : <DriveRepairBatch documents={pendingDocuments ?? []} />}
    {(params.error || resultText) && <pre className="overflow-auto rounded-2xl border bg-background p-4 text-xs">{params.error ? `ERROR: ${params.error}` : resultText}</pre>}
  </main>;
}
