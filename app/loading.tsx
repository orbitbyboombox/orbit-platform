import { BrandLogo } from "@/components/brand-logo";

export default function Loading() {
  return <main className="dark flex min-h-screen items-center justify-center bg-background p-6"><div className="flex flex-col items-center gap-5"><BrandLogo className="h-20 w-72" priority surface="dark" /><span aria-label="Cargando ORBIT" className="size-5 animate-spin rounded-full border-2 border-muted border-t-brand" role="status" /></div></main>;
}
