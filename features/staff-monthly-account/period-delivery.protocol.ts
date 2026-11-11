export type PeriodDeliveryDependencies = {
  claim(): Promise<boolean>;
  prepare(): Promise<{
    evidence: Record<string, unknown>;
    send(): Promise<{ messageId: string; threadId: string }>;
  }>;
  mark(patch: Record<string, unknown>): Promise<void>;
};
/** An ambiguous transport result is quarantined, never treated as a safe retry. */
export async function executePeriodDelivery(deps: PeriodDeliveryDependencies) {
  if (!(await deps.claim()))
    return {
      sent: false,
      message: "Envío en proceso o pendiente de conciliación; no se reenvió.",
    };
  let transmitting = false;
  try {
    const prepared = await deps.prepare();
    await deps.mark({ ...prepared.evidence, email_status: "SENDING" });
    transmitting = true;
    const sent = await prepared.send();
    if (!sent.messageId || !sent.threadId)
      throw new Error("Gmail no devolvió un identificador verificable.");
    await deps.mark({
      email_status: "SENT",
      message_id: sent.messageId,
      thread_id: sent.threadId,
      sent_at: new Date().toISOString(),
      delivery_evidence: "GMAIL_ACCEPTED",
    });
    return {
      sent: true,
      message:
        "Liquidación cerrada. Gmail aceptó el correo con su PDF adjunto.",
    };
  } catch (error) {
    try {
      await deps.mark({
        email_status: transmitting ? "UNKNOWN" : "PENDING",
        last_error:
          error instanceof Error ? error.message : "Error de preparación",
      });
    } catch {
      /* Prior claim remains held if persistence fails. */
    }
    return {
      sent: false,
      message: transmitting
        ? "Cierre confirmado. Resultado de Gmail por conciliar; no se reintentará para evitar duplicados."
        : "Cierre confirmado. El PDF/correo quedó pendiente; puedes reintentar la preparación.",
    };
  }
}
