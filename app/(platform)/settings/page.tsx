import { ConnectionCenter, loadMasterData, MasterDataCenter } from "@/features/settings";
import { CommunicationHub, loadCommunicationHubProjection } from "@/features/communication-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDisconnectedGoogleWorkspaceConnection } from "@/features/connectors";
import { loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { CompanySettingsCenter, loadCompanySettings } from "@/features/company-settings";
import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { ModuleManagerCenter } from "@/features/module-manager";
import { loadModuleStates } from "@/features/module-manager/repository";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const [communication, masterData, companySettings,modules] = await Promise.all([loadCommunicationHubProjection(client), loadMasterData(client),loadCompanySettings(client),loadModuleStates(client)]);
  const googleConfigured = Boolean(process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_REDIRECT_URI);
  const googleConnection = googleConfigured
    ? await loadGoogleWorkspaceConnection().catch(() => createDisconnectedGoogleWorkspaceConnection("AUTHENTICATION_ERROR"))
    : createDisconnectedGoogleWorkspaceConnection();
  return (
    <div className="space-y-10 lg:space-y-12">
      <Link className="group flex items-center justify-between gap-5 rounded-3xl border bg-card p-5 transition hover:border-brand/35 hover:bg-brand/[.03] sm:p-7" href="/settings/health">
        <div className="flex items-start gap-4"><span className="rounded-2xl border bg-background p-3 text-brand"><Activity className="size-5"/></span><div><p className="font-semibold">System Health Center</p><p className="mt-1 text-sm text-muted">Estado ejecutivo de ORBIT, infraestructura, Google y seguridad.</p></div></div><ArrowRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-brand"/>
      </Link>
      <CompanySettingsCenter settings={companySettings}/>
      <ModuleManagerCenter initialStates={modules}/>
      <MasterDataCenter {...masterData} />
      <div id="connections">
      <ConnectionCenter googleConfigured={googleConfigured} googleConnection={googleConnection} />
      </div>
      <CommunicationHub {...communication} />
    </div>
  );
}
