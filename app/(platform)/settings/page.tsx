import {
  ConnectionCenter,
  FinancialIntegrityStatus,
  loadMasterData,
  MasterDataCenter,
} from "@/features/settings";
import {
  CommunicationHub,
  loadCommunicationHubProjection,
} from "@/features/communication-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDisconnectedGoogleWorkspaceConnection } from "@/features/connectors";
import { loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import {
  CompanySettingsCenter,
  EmailSignatureSettings,
  loadCompanySettings,
} from "@/features/company-settings";
import Link from "next/link";
import { Activity, ArrowRight, Files, PenTool } from "lucide-react";
import { ModuleManagerCenter } from "@/features/module-manager";
import { loadModuleStates } from "@/features/module-manager/repository";
import { ProfitabilitySettings } from "@/features/settings/profitability-settings";
import { ProductionInitializationCenter } from "@/features/settings/production-initialization/production-initialization-center";
import {
  FounderWorkspaceSettings,
  loadFounderWorkspace,
  PersonalWorkspaceSections,
} from "@/features/founder-workspace";
import {
  ReservationDiagnostics,
  type ReservationDiagnostic,
} from "@/features/settings/reservation-diagnostics";
import {
  FounderNotificationDiagnostics,
  type FounderNotificationDelivery,
} from "@/features/settings/founder-notification-diagnostics";
import {
  CrmDiagnostics,
  type CrmDiagnostic,
} from "@/features/settings/crm-diagnostics";
import { loadBankingReadModel } from "@/features/finance/banking/repository";
import { BankSettings } from "@/features/finance/banking/bank-settings";
import { CommercialSettings } from "@/features/commercial-hub";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string; category?: string; returnTo?: string }> }) {
  const query = await searchParams;
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user)
    throw authError ?? new Error("Sesión requerida.");
  await client.rpc("validate_financial_integrity");
  const [
    communication,
    masterData,
    companySettings,
    modules,
    founderWorkspace,
    banking,
    { data: profitabilitySettings },
    { data: integrity },
    { data: diagnostics, error: diagnosticsError },
    { data: founderDeliveries, error: founderDeliveryError },
    { data: crmDiagnostics, error: crmDiagnosticsError },
    { data: commercialTemplates, error: commercialTemplatesError },
    { data: commercialDocuments, error: commercialDocumentsError },
  ] = await Promise.all([
    loadCommunicationHubProjection(client),
    loadMasterData(client),
    loadCompanySettings(client),
    loadModuleStates(client),
    loadFounderWorkspace(client, auth.user.id),
    loadBankingReadModel(client),
    client
      .from("profitability_settings")
      .select("high_margin_threshold,normal_margin_threshold")
      .eq("settings_key", "PRIMARY")
      .single(),
    client
      .from("financial_integrity_status")
      .select(
        "integrity_percent,reservation_sync,finance_sync,dashboard_sync,business_intelligence_sync,reports_sync,affected_records,checked_at",
      )
      .eq("status_key", "PRIMARY")
      .single(),
    client
      .from("reservation_execution_diagnostics")
      .select(
        "reference,status,failed_step,exception_message,affected_record,suggested_fix,steps,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10),
    client
      .from("founder_notification_deliveries")
      .select(
        "id,project_id,recipient,attempt_number,status,provider_response,failure_reason,attempted_at,projects(name,orbit_event_id),customers(full_name)",
      )
      .order("attempted_at", { ascending: false })
      .limit(30),
    client
      .from("crm_profile_diagnostics")
      .select(
        "id,customer_name,module,failed_component,exception,suggested_cause,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("commercial_email_templates")
      .select("id,category,subject,body")
      .eq("active", true)
      .order("category"),
    client
      .from("commercial_documents")
      .select("id,name,category,version,filename,status,uploaded_at")
      .order("uploaded_at", { ascending: false }),
  ]);
  if (
    diagnosticsError ||
    founderDeliveryError ||
    crmDiagnosticsError ||
    commercialTemplatesError ||
    commercialDocumentsError
  )
    throw (
      diagnosticsError ??
      founderDeliveryError ??
      crmDiagnosticsError ??
      commercialTemplatesError ??
      commercialDocumentsError
    );
  const googleConfigured = Boolean(
    process.env.GOOGLE_WORKSPACE_CLIENT_ID &&
      process.env.GOOGLE_WORKSPACE_CLIENT_SECRET &&
      process.env.GOOGLE_WORKSPACE_REDIRECT_URI,
  );
  const googleConnection = googleConfigured
    ? await loadGoogleWorkspaceConnection().catch(() =>
        createDisconnectedGoogleWorkspaceConnection("AUTHENTICATION_ERROR"),
      )
    : createDisconnectedGoogleWorkspaceConnection();
  const commercialDocumentRows = (commercialDocuments ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    version: item.version,
    filename: item.filename,
    status: item.status,
    uploadedAt: item.uploaded_at,
  })) as never;
  const commercialTemplatesData = (commercialTemplates ?? []) as never;
  const commercialOpen = query.section === "commercial-documents";
  const signatureOpen = query.section === "email-signature";
  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="grid gap-4 md:grid-cols-2"><Link
        className="group flex items-center justify-between gap-5 rounded-3xl border border-brand/30 bg-card p-5 transition hover:border-brand/60 hover:bg-brand/[.04] sm:p-7"
        href="/settings?section=commercial-documents#commercial-documents"
      >
        <div className="flex min-w-0 items-start gap-4">
          <span className="rounded-2xl border bg-background p-3 text-brand"><Files className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">Documentos Comerciales</p>
            <p className="mt-1 text-sm text-muted">Administra los catálogos de Matrimonios, Empresas y Eventos.</p>
          </div>
        </div>
        <ArrowRight className="size-5 shrink-0 text-brand transition group-hover:translate-x-1" />
      </Link><Link className="group flex items-center justify-between gap-5 rounded-3xl border border-brand/30 bg-card p-5 transition hover:border-brand/60 hover:bg-brand/[.04] sm:p-7" href="/settings?section=email-signature#email-signature-settings"><div className="flex min-w-0 items-start gap-4"><span className="rounded-2xl border bg-background p-3 text-brand"><PenTool className="size-5" /></span><div className="min-w-0"><p className="text-lg font-semibold">Firma de correo</p><p className="mt-1 text-sm text-muted">Carga y revisa la firma gráfica oficial de BOOMBOX.</p></div></div><ArrowRight className="size-5 shrink-0 text-brand transition group-hover:translate-x-1" /></Link></div>
      {commercialOpen && (
        <CommercialSettings
          documents={commercialDocumentRows}
          initialCategory={query.category}
          returnTo={query.returnTo === "/leads" ? "/leads" : undefined}
          templates={commercialTemplatesData}
        />
      )}
      {signatureOpen && <EmailSignatureSettings url={typeof companySettings.emailConfiguration.signatureGifUrl === "string" ? companySettings.emailConfiguration.signatureGifUrl : ""} />}
      {!commercialOpen && !signatureOpen && <PersonalWorkspaceSections
      moduleKey="SETTINGS"
      sections={[
        {
          key: "SYSTEM_HEALTH",
          label: "System Health",
          content: (
            <Link
              className="group flex items-center justify-between gap-5 rounded-3xl border bg-card p-5 transition hover:border-brand/35 hover:bg-brand/[.03] sm:p-7"
              href="/settings/health"
            >
              <div className="flex items-start gap-4">
                <span className="rounded-2xl border bg-background p-3 text-brand">
                  <Activity className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">System Health Center</p>
                  <p className="mt-1 text-sm text-muted">
                    Estado ejecutivo de ORBIT, infraestructura, Google y
                    seguridad.
                  </p>
                </div>
              </div>
              <ArrowRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-brand" />
            </Link>
          ),
        },
        {
          key: "COMPANY_SETTINGS",
          label: "Configuración de Empresa",
          content: <CompanySettingsCenter settings={companySettings} />,
        },
        {
          key: "FINANCE_BANK_ACCOUNTS",
          label: "Finance · Cuentas Bancarias",
          content: (
            <BankSettings
              accounts={banking.accounts}
              rules={banking.recurringRules}
            />
          ),
        },
        {
          key: "RESERVATION_DIAGNOSTICS",
          label: "Diagnóstico de Reservas",
          content: (
            <ReservationDiagnostics
              diagnostics={(diagnostics ?? []) as ReservationDiagnostic[]}
            />
          ),
        },
        {
          key: "FOUNDER_NOTIFICATIONS",
          label: "Notificaciones del Founder",
          content: (
            <FounderNotificationDiagnostics
              deliveries={
                (founderDeliveries ??
                  []) as unknown as FounderNotificationDelivery[]
              }
            />
          ),
        },
        {
          key: "CRM_DIAGNOSTICS",
          label: "Diagnóstico CRM",
          content: (
            <CrmDiagnostics
              diagnostics={(crmDiagnostics ?? []) as CrmDiagnostic[]}
            />
          ),
        },
        ...(integrity
          ? [
              {
                key: "FINANCIAL_INTEGRITY",
                label: "Integridad Financiera",
                content: <FinancialIntegrityStatus data={integrity} />,
              },
            ]
          : []),
        {
          key: "MODULE_MANAGER",
          label: "Module Manager",
          content: <ModuleManagerCenter initialStates={modules} />,
        },
        {
          key: "FOUNDER_WORKSPACE",
          label: "Founder Workspace",
          content: (
            <FounderWorkspaceSettings initialPreferences={founderWorkspace} />
          ),
        },
        {
          key: "PROFITABILITY_SETTINGS",
          label: "Configuración de Rentabilidad",
          content: (
            <ProfitabilitySettings
              high={Number(profitabilitySettings?.high_margin_threshold ?? 40)}
              normal={Number(
                profitabilitySettings?.normal_margin_threshold ?? 20,
              )}
            />
          ),
        },
        {
          key: "PRODUCTION_INITIALIZATION",
          label: "Inicialización de Producción",
          content: <ProductionInitializationCenter />,
        },
        {
          key: "MASTER_DATA",
          label: "Master Data",
          content: <MasterDataCenter {...masterData} />,
        },
        {
          key: "CONNECTIONS",
          label: "Conexiones",
          content: (
            <div id="connections">
              <ConnectionCenter
                googleConfigured={googleConfigured}
                googleConnection={googleConnection}
              />
            </div>
          ),
        },
        {
          key: "COMMUNICATION_HUB",
          label: "Communication Hub",
          content: <CommunicationHub {...communication} />,
        },
      ]}
      />}
    </main>
  );
}
