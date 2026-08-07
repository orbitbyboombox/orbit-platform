import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { CompanySettingsProvider, loadCompanySettings } from "@/features/company-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata():Promise<Metadata>{const settings=await loadCompanySettings(await createSupabaseServerClient());return{title:`${settings.productName} ${settings.productVersion}`,description:settings.loginTagline,icons:{icon:[{url:settings.isotypeUrl}],apple:[{url:settings.isotypeUrl}]}}}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings=await loadCompanySettings(await createSupabaseServerClient());
  return (
    <html className="dark" lang="es" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider><CompanySettingsProvider settings={settings}>{children}</CompanySettingsProvider></ThemeProvider>
      </body>
    </html>
  );
}
