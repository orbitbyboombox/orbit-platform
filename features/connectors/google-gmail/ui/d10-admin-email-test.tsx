"use client";

import { useState } from "react";
import { sendAdminD10EmailTestAction } from "@/features/connectors/google-gmail/application/pre-event-reminder-admin-test.actions";

export function D10AdminEmailTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section aria-label="Prueba administrativa de correo D-10" className="rounded-2xl border border-brand/20 bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Control administrativo</p>
          <h2 className="mt-1 text-lg font-semibold">Prueba premium D-10</h2>
          <p className="mt-1 text-sm text-muted">Usa un evento sintético y envía únicamente a matias.maira.larrain@gmail.com. No consulta ni consume recordatorios pendientes.</p>
        </div>
        <button
          className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Se enviará una sola prueba D-10 sintética a matias.maira.larrain@gmail.com usando Gmail Workspace de ORBIT. ¿Continuar?")) return;
            setBusy(true);
            setMessage(null);
            try {
              const result = await sendAdminD10EmailTestAction();
              setMessage(result.message ?? (result.status === "SENT" ? "Prueba enviada." : "No se envió la prueba."));
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "No fue posible enviar la prueba.");
            } finally {
              setBusy(false);
            }
          }}
          type="button"
        >
          {busy ? "ENVIANDO…" : "ENVIAR PRUEBA A MATÍAS"}
        </button>
      </div>
      {message ? <p aria-live="polite" className="mt-3 rounded-xl border bg-background/60 px-3 py-2 text-sm">{message}</p> : null}
    </section>
  );
}
