import { CheckCircle2 } from "lucide-react";

export function Workspace() {
  return <section className="flex min-h-[calc(100dvh-5.25rem)] items-center justify-center rounded-xl border bg-card p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:min-h-[calc(100dvh-6rem)] sm:p-8"><div><span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-foreground text-lg font-bold text-background">O</span><p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-muted">ORBIT</p><h1 className="text-3xl font-semibold tracking-tight">Workspace</h1><p className="mt-3 inline-flex items-center gap-2 text-sm text-muted"><CheckCircle2 aria-hidden="true" className="size-4" />Ready for development</p></div></section>;
}
