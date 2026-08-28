const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

type CommercialEmailAction = {
  href: string;
  label: string;
};

export type BoomboxCommercialEmailInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  contentHtml: string;
  website: string;
  primaryAction?: CommercialEmailAction;
  primaryActionFallback?: string;
  secondaryAction?: CommercialEmailAction;
  attachmentNote?: string;
  signatureHtml?: string;
};

const actionButton = (action: CommercialEmailAction, secondary = false) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${secondary ? "12px" : "26px"} auto 0"><tr><td style="border-radius:12px;background:${secondary ? "#ffffff" : "#f78900"};border:1px solid ${secondary ? "#d9d2c7" : "#f78900"}"><a href="${escapeHtml(action.href)}" style="display:inline-block;box-sizing:border-box;min-width:260px;padding:15px 24px;color:#171717;text-align:center;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.04em">${escapeHtml(action.label)}</a></td></tr></table>`;

export function renderBoomboxCommercialEmail(
  input: BoomboxCommercialEmailInput,
) {
  const actions = [
    input.primaryAction ? actionButton(input.primaryAction) : "",
    input.primaryAction && input.primaryActionFallback
      ? `<p style="margin:14px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#716b63">${escapeHtml(input.primaryActionFallback)} <a href="${escapeHtml(input.primaryAction.href)}" style="color:#d76d00;text-decoration:underline">aquí</a>.</p>`
      : "",
    input.secondaryAction ? actionButton(input.secondaryAction, true) : "",
  ].join("");
  const attachment = input.attachmentNote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;background:#fff7eb;border:1px solid #f4d5aa;border-radius:12px"><tr><td style="padding:15px 17px;color:#4b3a25;font-size:13px;line-height:1.5"><strong style="color:#d76d00">PDF ADJUNTO</strong><br>${escapeHtml(input.attachmentNote)}</td></tr></table>`
    : "";
  const signature = input.signatureHtml
    ? `<div style="margin-top:28px">${input.signatureHtml}</div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f0e9"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f0e9"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5ded2;border-radius:18px;overflow:hidden"><tr><td style="height:5px;background:#f78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:24px 28px;background:#111214;color:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:.08em">BOOMBOX</td><td align="right" style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;color:#f78900">EXPERIENCIAS QUE CONECTAN</td></tr></table></td></tr><tr><td style="padding:32px 28px 30px;font-family:Arial,sans-serif;color:#171717;line-height:1.6"><p style="margin:0 0 9px;color:#d76d00;font-size:11px;font-weight:700;letter-spacing:.16em">${escapeHtml(input.eyebrow)}</p><h1 style="margin:0 0 24px;font-size:30px;line-height:1.15;letter-spacing:-.02em;color:#171717">${escapeHtml(input.title)}</h1>${input.contentHtml}${attachment}${actions}${signature}<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #eee7dc;font-size:12px;line-height:1.6;color:#716b63">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="${escapeHtml(input.website)}" style="color:#d76d00;text-decoration:none">www.bbox.cl</a></p></td></tr></table></td></tr></table></body></html>`;
}
