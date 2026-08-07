import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; access?: string }> }) {
  const { error, access } = await searchParams;
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (access) params.set("access", access);
  redirect(params.size ? `/?${params.toString()}` : "/");
}
