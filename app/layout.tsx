import type { Metadata } from "next";
import "./globals.css";
import { CompanySettingsProvider, loadCompanySettings } from "@/features/company-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata():Promise<Metadata>{const settings=await loadCompanySettings(await createSupabaseServerClient());const buildSha=process.env.NEXT_PUBLIC_BUILD_SHA??process.env.VERCEL_GIT_COMMIT_SHA??"unknown";return{title:`${settings.productName} ${settings.productVersion}`,description:settings.loginTagline,other:{"build-sha":buildSha},icons:{icon:[{url:"/branding/orbit-bbox-icon-v2.png",sizes:"1254x1254",type:"image/png"}],apple:[{url:"/branding/orbit-bbox-icon-v2.png",sizes:"1254x1254",type:"image/png"}]}}}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings=await loadCompanySettings(await createSupabaseServerClient());
  return (
    <html className="dark" lang="es">
      <body className="antialiased">
        <CompanySettingsProvider settings={settings}>{children}</CompanySettingsProvider>
      </body>
    </html>
  );
}
