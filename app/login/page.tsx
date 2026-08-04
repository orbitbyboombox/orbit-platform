import { redirect } from "next/navigation";
import { LoginForm } from "@/features/authentication/components/login-form";
import { getCurrentUser } from "@/services/auth.service";
import { BrandLogo } from "@/components/brand-logo";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const user = await getCurrentUser();
    if (user) redirect("/");
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6"><section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-10"><div className="mb-9 text-center"><div className="mx-auto flex h-20 items-center justify-center rounded-xl bg-[#080808] px-7"><BrandLogo className="w-full max-w-[15rem]" priority surface="dark" /></div><h1 className="mt-8 text-2xl font-semibold tracking-tight">Bienvenido a ORBIT</h1><p className="mt-2 text-sm text-muted">La plataforma operativa de BOOMBOX</p></div><LoginForm /></section></main>;
}
