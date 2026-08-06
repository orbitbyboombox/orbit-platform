import { redirect } from "next/navigation";
import { LoginForm } from "@/features/authentication/components/login-form";
import { getCurrentUser } from "@/services/auth.service";
import { BrandLogo } from "@/components/brand-logo";
import { BrandSignature } from "@/components/brand-signature";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const user = await getCurrentUser();
    if (user) redirect("/operations");
  }
  return <main className="dark flex min-h-screen items-center justify-center bg-background p-4 text-foreground sm:p-6"><section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-black/20 sm:p-10"><div className="mb-10 text-center"><div className="mx-auto flex h-36 items-center justify-center rounded-xl px-3 sm:h-40 sm:px-2 lg:h-44 lg:px-0"><BrandLogo className="w-full max-w-[19.5rem] sm:max-w-[20.5rem] lg:max-w-[21.25rem]" priority surface="dark" /></div><h1 className="mt-6 text-2xl font-semibold tracking-[-0.025em]">Bienvenido a ORBIT</h1><p className="mt-2.5 text-sm leading-6 text-muted">La plataforma operativa de BOOMBOX</p></div><LoginForm initialMessage={error === "session-expired" ? "Tu sesión expiró. Vuelve a iniciar sesión." : undefined} /><BrandSignature className="mt-9 border-t pt-6 text-center" /></section></main>;
}
