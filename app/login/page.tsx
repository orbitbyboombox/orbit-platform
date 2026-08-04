import { redirect } from "next/navigation";
import { LoginForm } from "@/features/authentication/components/login-form";
import { getCurrentUser } from "@/services/auth.service";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    const user = await getCurrentUser();
    if (user) redirect("/");
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-4"><section className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg sm:p-8"><div className="mb-7 text-center"><span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-foreground text-base font-bold text-background">O</span><p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">ORBIT Platform</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Welcome back</h1><p className="mt-2 text-sm text-muted">Sign in to access your workspace.</p></div><LoginForm /></section></main>;
}
