"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reloaded = useRef(false);
  useEffect(() => {
    const message = error?.message || "Unknown client exception";
    const chunkFailure = /ChunkLoadError|Loading chunk failed|dynamically imported module/i.test(message);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fingerprint: `${chunkFailure ? "chunk" : "render"}:${message.slice(0, 120)}`,
        message,
        route: window.location.pathname,
        component: "app-error",
        build: document.querySelector('meta[name="build-sha"]')?.getAttribute("content") ?? "unknown",
        browser: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => undefined);
    let alreadyRecovered = false;
    try { alreadyRecovered = sessionStorage.getItem("orbit-chunk-recovery") === "1"; } catch { /* privacy mode */ }
    if (chunkFailure && !reloaded.current && !alreadyRecovered) {
      reloaded.current = true;
      try { sessionStorage.setItem("orbit-chunk-recovery", "1"); } catch { /* privacy mode */ }
      window.location.reload();
    }
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">ORBIT</p>
        <h1 className="mt-3 text-2xl font-semibold">ORBIT encontró un problema al cargar esta sección.</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Puedes reintentar o volver al escritorio. El incidente fue registrado sin información sensible.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-black" onClick={() => { try { sessionStorage.removeItem("orbit-chunk-recovery"); } catch { /* privacy mode */ } reset(); }} type="button">Reintentar</button><Link className="inline-flex min-h-11 items-center justify-center rounded-xl border px-5 text-sm font-semibold" href="/">Volver al escritorio</Link></div>
      </section>
    </main>
  );
}
