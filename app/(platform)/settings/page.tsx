import { ConnectionCenter,FinancialIntegrityStatus, loadMasterData, MasterDataCenter } from "@/features/settings";
import { CommunicationHub, loadCommunicationHubProjection } from "@/features/communication-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDisconnectedGoogleWorkspaceConnection } from "@/features/connectors";
import { loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { CompanySettingsCenter, loadCompanySettings } from "@/features/company-settings";
import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { ModuleManagerCenter } from "@/features/module-manager";
import { loadModuleStates } from "@/features/module-manager/repository";
import {ProfitabilitySettings}from"@/features/settings/profitability-settings";
import {ProductionInitializationCenter}from"@/features/settings/production-initialization/production-initialization-center";
import{FounderWorkspaceSettings,loadFounderWorkspace}from"@/features/founder-workspace";
import{ReservationDiagnostics,type ReservationDiagnostic}from"@/features/settings/reservation-diagnostics";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Sesión requerida.");
  await client.rpc("validate_financial_integrity");
  const [communication, masterData, companySettings,modules,founderWorkspace,{data:profitabilitySettings},{data:integrity},{data:diagnostics,error:diagnosticsError}] = await Promise.all([loadCommunicationHubProjection(client), loadMasterData(client),loadCompanySettings(client),loadModuleStates(client),loadFounderWorkspace(client,auth.user.id),client.from("profitability_settings").select("high_margin_threshold,normal_margin_threshold").eq("settings_key","PRIMARY").single(),client.from("financial_integrity_status").select("integrity_percent,reservation_sync,finance_sync,dashboard_sync,business_intelligence_sync,reports_sync,affected_records,checked_at").eq("status_key","PRIMARY").single(),client.from("reservation_execution_diagnostics").select("reference,status,failed_step,exception_message,affected_record,suggested_fix,steps,created_at").order("created_at",{ascending:false}).limit(10)]);
  if(diagnosticsError)throw diagnosticsError;
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
      <ReservationDiagnostics diagnostics={(diagnostics??[])as ReservationDiagnostic[]}/>
      {integrity&&<FinancialIntegrityStatus data={integrity}/>}
      <ModuleManagerCenter initialStates={modules}/>
      <FounderWorkspaceSettings initialPreferences={founderWorkspace}/>
      <ProfitabilitySettings high={Number(profitabilitySettings?.high_margin_threshold??40)} normal={Number(profitabilitySettings?.normal_margin_threshold??20)}/>
      <ProductionInitializationCenter/>
      <MasterDataCenter {...masterData} />
      <div id="connections">
      <ConnectionCenter googleConfigured={googleConfigured} googleConnection={googleConnection} />
      </div>
      <CommunicationHub {...communication} />
    </div>
  );
}
