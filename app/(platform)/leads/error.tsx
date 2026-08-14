"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CommercialHubError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Commercial Hub failed to render", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-white/10 bg-[#111317] p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f78900]">
          Commercial Hub
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          No pudimos abrir esta sección
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Tu información está segura. Intenta cargar nuevamente o administra los catálogos desde Configuración.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-[#f78900] px-5 py-3 text-sm font-semibold text-black"
          >
            Intentar nuevamente
          </button>
          <Link
            href="/settings?section=commercial-documents"
            className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-semibold text-white"
          >
            Ir a Documentos Comerciales
          </Link>
        </div>
      </section>
    </main>
  );
}
