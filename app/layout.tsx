import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import { CompanySettingsProvider, DEFAULT_COMPANY_SETTINGS, loadCompanySettingsCached } from "@/features/company-settings";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
import { ReadOnlyPreviewBanner } from "@/components/ui/read-only-preview-banner";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hasAdminConfiguration = Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  const settings = hasAdminConfiguration
    ? await loadCompanySettingsCached()
    : DEFAULT_COMPANY_SETTINGS;
  const buildSha =
    process.env.NEXT_PUBLIC_BUILD_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "unknown";
  return {
    title: `${settings.productName} ${settings.productVersion}`,
    description: settings.loginTagline,
    other: { "build-sha": buildSha },
    icons: {
      icon: [
        {
          url: "/branding/orbit-bbox-icon-v2.png",
          sizes: "1254x1254",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: "/branding/orbit-bbox-icon-v2.png",
          sizes: "1254x1254",
          type: "image/png",
        },
      ],
    },
  };
}

async function SettingsGate({children}:{children:React.ReactNode}){
  const settings=await loadCompanySettingsCached();
  return <CompanySettingsProvider settings={settings}>{children}</CompanySettingsProvider>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="dark" lang="es">
      <body className="antialiased">
        {isReadOnlyVisualPreview() ? <ReadOnlyPreviewBanner /> : null}
        <Suspense fallback={<OrbitLoader label="Cargando ORBIT…" variant="fullscreen"/>}><SettingsGate>{children}</SettingsGate></Suspense>
      </body>
    </html>
  );
}
