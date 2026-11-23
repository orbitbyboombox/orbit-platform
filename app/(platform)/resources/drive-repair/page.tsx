import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { repairPendingDocumentBackupsAction, repairAllPendingDocumentBackupsAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";
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

async function repairAllFromForm() {
  "use server";
  try {
    const results = await repairAllPendingDocumentBackupsAction();
    const summary = {
      total: results.length,
      synced: results.filter((item) => item.status === "SYNCED").length,
      review: results.filter((item) => item.status !== "SYNCED").map((item) => ({ id: item.documentId, reason: item.reason })),
    };
    redirect(`/resources/drive-repair?result=${encodeURIComponent(JSON.stringify(summary))}`);
  } catch (error) {
    const digest = typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "") : "";
    if (digest.startsWith("NEXT_REDIRECT") || (error instanceof Error && error.message === "NEXT_REDIRECT")) throw error;
    redirect(`/resources/drive-repair?error=${encodeURIComponent(error instanceof Error ? error.message : "Error de recuperación")}`);
  }
}

export default async function DriveRepairPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!isAdministrativeRole(profile?.role)) redirect("/resources");
  const admin = createAdminClient();
  const { count: pendingCount } = await admin.from("documents").select("id", { count: "exact", head: true }).is("deleted_at", null).is("drive_file_id", null).in("document_type", ["PAYMENT_RECEIPT", "COMMERCIAL_DOCUMENT", "STAFF_EXPENSE_RECEIPT"]);
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
    <section className="space-y-3 rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">Recuperación de documentos pendientes</h2>
      <p className="text-sm text-muted">Pendientes actuales: {pendingCount ?? "sin lectura"}. Cada original se descarga desde Storage, se verifica mediante SHA-256 y tamaño cuando existe, y solo después se reutiliza o sube a su carpeta canónica. Se procesan hasta 25 archivos, de forma secuencial, y los errores quedan individualizados. No borra archivos anteriores.</p>
      <form action={repairAllFromForm}>
        <button className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-black disabled:opacity-50" type="submit" disabled={!pendingCount || pendingCount > 25}>Reparar pendientes verificados ({pendingCount ?? 0})</button>
      </form>
      <p className="text-xs text-muted">Esta acción escribe únicamente los vínculos de documentos verificados, previa autorización administrativa al pulsar el botón.</p>
    </section>
    {(params.error || resultText) && <pre className="overflow-auto rounded-2xl border bg-background p-4 text-xs">{params.error ? `ERROR: ${params.error}` : resultText}</pre>}
  </main>;
}
