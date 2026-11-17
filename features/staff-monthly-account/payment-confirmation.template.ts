/** Premium payment-confirmation content. No email is sent from this module. */
export type StaffPaymentConfirmationInput = {
  firstName: string;
  periodLabel: string;
  paidOn: string;
  reference: string;
  honoraria: number;
  reimbursements: number;
  total: number;
};
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
export function buildStaffPaymentConfirmationEmail(input: StaffPaymentConfirmationInput) {
  for (const n of [input.honoraria, input.reimbursements, input.total]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Monto de pago inválido.");
  }
  if (input.honoraria + input.reimbursements !== input.total || input.total <= 0) {
    throw new Error("La confirmación no coincide con el total registrado.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || !input.reference.trim()) {
    throw new Error("Falta fecha o referencia bancaria.");
  }
  const details: Array<[string, string]> = [
    ["Período", input.periodLabel],
    ["Fecha de pago", input.paidOn],
    ["Referencia bancaria", input.reference],
    ["Honorarios", clp(input.honoraria)],
    ["Reembolsos", clp(input.reimbursements)],
    ["Total transferido", clp(input.total)],
  ];
  const textBody = [
    `Hola ${input.firstName},`,
    "Confirmamos el pago registrado por BOOMBOX.",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "Adjuntamos el comprobante bancario original.",
    "BOOMBOX® · Comunicación emitida mediante ORBIT",
  ].join("\n");
  const rows = details.map(([label, value]) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #eee;color:#666">${esc(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${esc(value)}</td></tr>`).join("");
  const htmlBody = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#efede8;font:15px/1.6 Arial,sans-serif;color:#202124"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:640px;background:#fff;border-collapse:collapse"><tr><td align="center" bgcolor="#101113" style="padding:26px"><img src="https://app.bbox.cl/branding/boombox-logo-official-white-email.png" width="220" height="50" alt="BOOMBOX®" style="display:block;width:220px;max-width:100%;height:auto"><p style="color:#f78900;font-size:12px;letter-spacing:2px">FINANZAS STAFF</p><h1 style="color:#fff;font-size:25px;margin:4px 0">Confirmación de pago</h1></td></tr><tr><td style="padding:28px"><p>Hola ${esc(input.firstName)},</p><p>Confirmamos el pago registrado por BOOMBOX.</p><table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table><p>Adjuntamos el comprobante bancario original.</p><p style="font-size:12px;color:#777;border-top:1px solid #eee;padding-top:18px">BOOMBOX® · Comunicación emitida mediante ORBIT</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: "BOOMBOX® | Confirmación de pago", textBody, htmlBody };
}
