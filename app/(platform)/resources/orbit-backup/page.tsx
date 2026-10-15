import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { runOrbitAdminBackupAction } from "@/features/connectors/google-drive/actions/orbit-admin-backup.actions";

async function runBackup(formData: FormData) {
  "use server";
  const scope = String(formData.get("scope") ?? "STORAGE") as "STORAGE" | "DATABASE";
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  try {
    const result = await runOrbitAdminBackupAction({ scope, idempotencyKey });
    redirect(`/resources/orbit-backup?result=${encodeURIComponent(JSON.stringify(result))}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect(`/resources/orbit-backup?error=${encodeURIComponent(error instanceof Error ? error.message : "No fue posible ejecutar el respaldo.")}`);
  }
}

export default async function OrbitBackupPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!isAdministrativeRole(profile?.role)) redirect("/resources");
  const params = await searchParams;
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header className="rounded-2xl border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Founder / Administración</p>
      <h1 className="mt-2 text-2xl font-semibold">Respaldos administrativos ORBIT</h1>
      <p className="mt-2 text-sm text-muted">Los tokens permanecen server-side. Cada ejecución requiere una clave de idempotencia única.</p>
    </header>
    <form action={runBackup} className="space-y-4 rounded-2xl border bg-card p-6">
      <label className="block text-sm font-medium" htmlFor="scope">Alcance</label>
      <select id="scope" name="scope" className="min-h-11 w-full rounded-xl border bg-background px-3" defaultValue="STORAGE">
        <option value="STORAGE">Storage físico</option>
        <option value="DATABASE">Database (requiere CI protegido)</option>
      </select>
      <label className="block text-sm font-medium" htmlFor="idempotencyKey">Clave de ejecución</label>
      <input id="idempotencyKey" name="idempotencyKey" required className="min-h-11 w-full rounded-xl border bg-background px-3" placeholder="orbit-backup-2026-10-15-01" />
      <button className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-black" type="submit">Ejecutar respaldo seleccionado</button>
    </form>
    {(params.error || params.result) && <pre className="overflow-auto rounded-2xl border bg-background p-4 text-xs">{params.error ? `ERROR: ${params.error}` : params.result}</pre>}
  </main>;
}
