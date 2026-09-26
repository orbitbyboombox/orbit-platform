import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import { CompanySettingsProvider, loadCompanySettings } from "@/features/company-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
import { ReadOnlyPreviewBanner } from "@/components/ui/read-only-preview-banner";

export async function generateMetadata():Promise<Metadata>{const settings=await loadCompanySettings(await createSupabaseServerClient());const buildSha=process.env.NEXT_PUBLIC_BUILD_SHA??process.env.VERCEL_GIT_COMMIT_SHA??"unknown";return{title:`${settings.productName} ${settings.productVersion}`,description:settings.loginTagline,other:{"build-sha":buildSha},icons:{icon:[{url:"/branding/orbit-bbox-icon-v2.png",sizes:"1254x1254",type:"image/png"}],apple:[{url:"/branding/orbit-bbox-icon-v2.png",sizes:"1254x1254",type:"image/png"}]}}}

async function SettingsGate({children}:{children:React.ReactNode}){
  const settings=await loadCompanySettings(await createSupabaseServerClient());
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
