import Link from "next/link";
import { notFound } from "next/navigation";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { OrbitBackupsCenter, loadOrbitBackupRuns } from "@/features/orbit-backups";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";

export default async function BackupSettingsPage() {
  if (!(await getConnectorAdministrator())) notFound();
  const runs = await loadOrbitBackupRuns(createAdminClient()).catch(() => null);
  const tokenConfigured = Boolean(process.env.GITHUB_BACKUP_DISPATCH_TOKEN);
  const expiresOn = process.env.GITHUB_BACKUP_DISPATCH_TOKEN_EXPIRES_ON ?? "2026-12-28";
  const todayInChile = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date());
  const daysToExpiry = (Date.parse(expiresOn) - Date.parse(todayInChile)) / 86_400_000;
  const showExpiry = tokenConfigured && Number.isFinite(daysToExpiry) && daysToExpiry <= 14;
  return <main className="space-y-4">
    <Link href="/settings" className="text-sm font-semibold text-brand">Volver a Configuración</Link>
    {showExpiry && <p role="status" className="rounded-xl border border-warning/30 p-3 text-sm text-warning">
      {daysToExpiry < 0 ? "El token del disparador superó su fecha de vencimiento." : `El token del disparador vence el ${expiresOn} (Chile).`} Renueva la credencial y actualiza su fecha en Vercel.
    </p>}
    {runs
      ? <OrbitBackupsCenter runs={runs} ready={tokenConfigured && !isReadOnlyVisualPreview()} />
      : <p role="alert">No se pudo cargar el historial de respaldos.</p>}
  </main>;
}
