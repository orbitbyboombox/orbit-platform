import { notFound } from "next/navigation";
import Link from "next/link";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { accountantPeriodPattern, accountantPreviewProof, buildAccountantDelivery, loadAccountantDeliveryState } from "@/features/finance/accountant-delivery";
import { saveAccountantRecipient, sendApprovedAccountantPackage } from "@/features/finance/accountant-delivery-actions";
import { recordRcvPeriodEvent } from "@/features/finance/sii-rcv-actions";

export default async function AccountantDeliveryPage({ searchParams }: { searchParams: Promise<{ period?: string; preview?: string }> }) {
  const actor = await getGoogleWorkspaceAdministrator();
  if (!actor) notFound();
  const { period, preview } = await searchParams;
  if (!period || !accountantPeriodPattern.test(period)) notFound();
  const state = await loadAccountantDeliveryState(period);
  const chileMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(new Date());
  const packagePreview = preview === "1" ? await buildAccountantDelivery(period).catch(() => null) : null;
  const proof = state.closed && state.recipient && !state.delivery && packagePreview
    ? accountantPreviewProof(actor.id, period, state.recipient, packagePreview.checksum) : null;
  return <main className="space-y-5">
    <Link href={`/finance/tributary?module=accountant&period=${period}`} className="text-sm font-semibold text-brand">Volver a Contador</Link>
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <h1 className="text-2xl font-semibold">Paquete contador · {period}</h1>
      <p>Período {state.closed ? "cerrado" : "abierto"}</p>
      <form action={saveAccountantRecipient} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Destinatario contable
          <input type="email" name="recipient" required maxLength={254} defaultValue={state.recipient}
            className="mt-1 block rounded-lg border bg-background p-2"/>
        </label>
        <button className="min-h-11 rounded-xl border px-4">Guardar destinatario</button>
      </form>
      <Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-brand"
        href={`?period=${period}&preview=1`}>Preparar vista previa</Link>
      {!state.closed && period < chileMonth && packagePreview && <form action={recordRcvPeriodEvent} className="space-y-3">
        <input type="hidden" name="period" value={period}/>
        <input type="hidden" name="action" value="CLOSED"/>
        <label className="block text-sm">Motivo de cierre
          <input name="reason" required maxLength={500} className="mt-1 block rounded-lg border bg-background p-2"/>
        </label>
        <button className="min-h-11 rounded-xl border px-4">Aprobar cierre del período</button>
      </form>}
    </section>
    {preview === "1" && !packagePreview && <p role="alert">No se pudo generar el paquete para revisión.</p>}
    {packagePreview && <section className="space-y-4 rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Vista previa del correo BOOMBOX®</h2>
      <p>Para {state.recipient ?? "Destinatario pendiente"}</p>
      <pre className="whitespace-pre-wrap text-sm">{packagePreview.summary}</pre>
      <ul className="list-disc pl-5 text-sm">{packagePreview.attachments.map(file => <li key={file.filename}>{file.filename}</li>)}</ul>
      {proof && <form action={sendApprovedAccountantPackage} className="space-y-4">
        <input type="hidden" name="period" value={period}/>
        <input type="hidden" name="proof" value={proof}/>
        <label className="flex gap-2"><input type="checkbox" name="approved" value="yes" required/> Apruebo el envío al destinatario indicado.</label>
        <button className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground">Enviar paquete al contador</button>
      </form>}
    </section>}
    {state.delivery && <section className="space-y-2 rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Historial del período</h2>
      <p>{state.delivery.recipient} · {state.delivery.status === "SENT" ? "Enviado" : "Envío en proceso o por verificar"}</p>
      <time>{new Date(state.delivery.sent_at ?? state.delivery.approved_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</time>
    </section>}
  </main>;
}
