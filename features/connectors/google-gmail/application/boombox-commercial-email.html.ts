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
  contentAfterActionsHtml?: string;
  headerLabel?: string;
  stackedHeader?: boolean;
  fixedLayout?: boolean;
  website: string;
  primaryAction?: CommercialEmailAction;
  primaryActionFallback?: string;
  secondaryAction?: CommercialEmailAction;
  attachmentNote?: string;
  signatureHtml?: string;
};

const actionButton = (action: CommercialEmailAction, secondary = false) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${secondary ? "10px" : "20px"} auto 0"><tr><td style="border-radius:12px;background:${secondary ? "#111214" : "#f78900"};border:1px solid ${secondary ? "#555555" : "#f78900"}"><a href="${escapeHtml(action.href)}" style="display:inline-block;box-sizing:border-box;min-width:260px;padding:15px 24px;color:${secondary ? "#ffffff" : "#111214"};text-align:center;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.04em">${escapeHtml(action.label)}</a></td></tr></table>`;

export function renderBoomboxCommercialEmail(
  input: BoomboxCommercialEmailInput,
) {
  const headerLabel = input.headerLabel ?? "EXPERIENCIAS QUE CONECTAN";
  const actions = [
    input.primaryAction ? actionButton(input.primaryAction) : "",
    input.primaryAction && input.primaryActionFallback
      ? `<p style="margin:10px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#d1d1d1">${escapeHtml(input.primaryActionFallback)} <a href="${escapeHtml(input.primaryAction.href)}" style="color:#f78900;text-decoration:underline">aquí</a>.</p>`
      : "",
    input.secondaryAction ? actionButton(input.secondaryAction, true) : "",
  ].join("");
  const attachment = input.attachmentNote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;background:#202124;border:1px solid #454545;border-radius:12px"><tr><td style="padding:15px 17px;color:#ffffff;font-size:13px;line-height:1.5"><strong style="color:#f78900">PDF ADJUNTO</strong><br>${escapeHtml(input.attachmentNote)}</td></tr></table>`
    : "";
  const signature = input.signatureHtml
    ? `<div style="margin-top:10px">${input.signatureHtml}</div>`
    : "";
  const fixedLayout = input.fixedLayout ? "table-layout:fixed;" : "";
  const safeWrapping = input.fixedLayout ? ";overflow-wrap:anywhere" : "";

  const heading = `${input.eyebrow ? `<p style="margin:0 0 9px;color:#f78900;font-size:11px;font-weight:700;letter-spacing:.16em">${escapeHtml(input.eyebrow)}</p>` : ""}${input.title ? `<h1 style="margin:0 0 24px;font-size:30px;line-height:1.15;letter-spacing:-.02em;color:#ffffff">${escapeHtml(input.title)}</h1>` : ""}`;
  const header = input.stackedHeader
    ? `<div style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:.08em">BOOMBOX</div><div style="margin-top:3px;font-family:Arial,sans-serif;font-size:10px;line-height:1.5;letter-spacing:.18em;color:#f78900">${escapeHtml(headerLabel)}</div>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:.08em">BOOMBOX</td><td align="right" style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;color:#f78900">${escapeHtml(headerLabel)}</td></tr></table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background-color:#111214;background:#111214"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${fixedLayout}background-color:#111214;background:#111214"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;${fixedLayout}background-color:#111214;background:#111214;border:1px solid #343434;border-radius:18px;overflow:hidden"><tr><td style="height:5px;background:#f78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:24px 28px;background-color:#111214;background:#111214;color:#111214">${header}</td></tr><tr><td style="padding:28px 28px 24px;font-family:Arial,sans-serif;color:#ffffff;line-height:1.6${safeWrapping}">${heading}${input.contentHtml}${attachment}${actions}${input.contentAfterActionsHtml ?? ""}${signature}<p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #454545;font-size:12px;line-height:1.6;color:#d1d1d1">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="${escapeHtml(input.website)}" style="color:#f78900;text-decoration:none">www.bbox.cl</a></p></td></tr></table></td></tr></table></body></html>`;
}
