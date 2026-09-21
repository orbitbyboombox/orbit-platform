"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/client-errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fingerprint: `global:${(error?.message ?? "unknown").slice(0, 120)}`, message: error?.message ?? "Unknown global error", route: window.location.pathname, component: "global-error", build: document.querySelector('meta[name="build-sha"]')?.getAttribute("content") ?? "unknown", browser: navigator.userAgent }), keepalive: true }).catch(() => undefined);
  }, [error]);
  return <html lang="es" className="dark"><body className="bg-[#08090b] text-white"><main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12"><section className="w-full rounded-2xl border border-white/10 bg-[#111317] p-6"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f78900]">ORBIT</p><h1 className="mt-3 text-2xl font-semibold">ORBIT encontró un problema al cargar esta sección.</h1><p className="mt-2 text-sm leading-6 text-white/65">Puedes reintentar o volver al escritorio.</p><div className="mt-6 flex gap-3"><button className="min-h-11 rounded-xl bg-[#f78900] px-5 text-sm font-semibold text-black" onClick={reset} type="button">Reintentar</button><Link className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-5 text-sm font-semibold" href="/">Volver al escritorio</Link></div></section></main></body></html>;
}
