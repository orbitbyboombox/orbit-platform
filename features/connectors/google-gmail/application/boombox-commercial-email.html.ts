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
  benefits?: string[];
  closingLine?: string;
  logoUrl?: string;
};

const actionButton = (action: CommercialEmailAction, secondary = false) =>
  `<table role="presentation" class="orbit-action" cellpadding="0" cellspacing="0" border="0" style="margin:${secondary ? "10px" : "20px"} auto 0"><tr><td style="border-radius:12px;background:${secondary ? "#ffffff" : "#f78900"};border:1px solid ${secondary ? "#d9d2c7" : "#f78900"}"><a class="orbit-action-link" href="${escapeHtml(action.href)}" style="display:inline-block;box-sizing:border-box;min-width:260px;padding:15px 24px;color:#171717;text-align:center;text-decoration:none;font-size:14px;font-weight:700;line-height:1.35;letter-spacing:.04em">${escapeHtml(action.label)}</a></td></tr></table>`;

export function renderBoomboxCommercialEmail(
  input: BoomboxCommercialEmailInput,
) {
  const headerLabel = input.headerLabel ?? "EXPERIENCIAS QUE CONECTAN";
  const actions = [
    input.primaryAction ? actionButton(input.primaryAction) : "",
    input.primaryAction && input.primaryActionFallback
      ? `<p style="margin:10px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#716b63">${escapeHtml(input.primaryActionFallback)} <a href="${escapeHtml(input.primaryAction.href)}" style="color:#d76d00;text-decoration:underline">aquí</a>.</p>`
      : "",
    input.secondaryAction ? actionButton(input.secondaryAction, true) : "",
  ].join("");
  const attachment = input.attachmentNote
    ? `<table class="orbit-attachment" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;background:#fff7eb;border:1px solid #f4d5aa;border-radius:12px"><tr><td style="padding:15px 17px;color:#4b3a25;font-size:13px;line-height:1.5"><strong style="color:#d76d00">PDF ADJUNTO</strong><br>${escapeHtml(input.attachmentNote)}</td></tr></table>`
    : "";
  const signature = input.signatureHtml
    ? `<div class="orbit-signature" style="margin-top:10px">${input.signatureHtml}</div>`
    : "";
  const fixedLayout = input.fixedLayout ? "table-layout:fixed;" : "";
  const safeWrapping = input.fixedLayout ? ";overflow-wrap:anywhere" : "";
  const benefits = input.benefits?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:38px 0 0;border-top:1px solid #343538;padding-top:30px"><tr><td style="padding:0 0 20px;font-family:Arial,sans-serif;font-size:21px;line-height:1.3;font-weight:700;color:#ffffff">Una vez dentro podrás:</td></tr>${input.benefits.map((benefit, index) => `<tr><td style="padding:11px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#e9e9ea"><span style="display:inline-block;width:30px;height:30px;margin-right:16px;border:1px solid #f78900;border-radius:8px;color:#f78900;text-align:center;line-height:30px;font-weight:700;vertical-align:middle">${["⌑", "＋", "▤", "✓"][index % 4]}</span><span style="vertical-align:middle">${escapeHtml(benefit)}</span></td></tr>`).join("")}</table>`
    : "";
  const closing = input.closingLine
    ? `<p style="margin:28px 0 0;padding-top:22px;border-top:1px solid #343538;font-family:Arial,sans-serif;font-size:18px;line-height:1.45;font-weight:700;color:#ffffff">${escapeHtml(input.closingLine)}</p>`
    : "";

  const heading = `${input.eyebrow ? `<p style="margin:0 0 12px;color:#f78900;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>` : ""}${input.title ? `<h1 style="margin:0 0 24px;font-size:38px;line-height:1.08;letter-spacing:-.03em;color:#ffffff">${escapeHtml(input.title)}</h1>` : ""}`;
  const logoUrl = input.logoUrl ?? "https://app.bbox.cl/branding/boombox-official-logo.png";
  const header = input.stackedHeader
    ? `<div class="orbit-logo-frame" style="width:220px;height:54px;max-width:100%;margin:0 auto;overflow:hidden;position:relative"><img class="orbit-logo" src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="220" style="position:absolute;left:50%;top:50%;display:block;width:220px;max-width:none;height:auto;margin:0;border:0;transform:translate(-50%,-50%) scale(1.02);transform-origin:center"/></div><div class="orbit-header-label" style="margin-top:2px;font-family:Arial,sans-serif;font-size:10px;line-height:1.35;letter-spacing:.18em;color:#f78900">${escapeHtml(headerLabel)}</div>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><img src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0"/></td><td align="right" style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;color:#f78900">${escapeHtml(headerLabel)}</td></tr></table>`;

  const websiteLabel = "www.bbox.cl";
  const footerLogo = `<div class="orbit-footer-logo-frame" style="width:150px;height:37px;overflow:hidden;position:relative"><img src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="150" style="position:absolute;left:50%;top:50%;display:block;width:150px;max-width:none;height:auto;border:0;transform:translate(-50%,-50%)"/></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
.orbit-signature img{display:block!important;width:100%!important;max-width:400px!important;height:auto!important;margin-left:auto!important;margin-right:auto!important}
@media only screen and (max-width:520px){
  .orbit-logo-frame{width:188px!important;height:47px!important}
  .orbit-logo{width:188px!important}
  .orbit-header-label{margin-top:2px!important}
  .orbit-signature{margin-top:6px!important;margin-bottom:0!important}
  .orbit-signature img{max-width:310px!important}
  .orbit-footer-logo-frame{margin:0 auto!important}
  .orbit-shell-cell{padding:12px 6px!important}
  .orbit-card{border-radius:16px!important}
  .orbit-header{padding:26px 20px 22px!important}
  .orbit-body{padding:28px 20px 26px!important;line-height:1.72!important}
  .orbit-body p{margin-bottom:14px!important}\n  .orbit-body .orbit-signature p{margin:0!important}
  .orbit-body h1{font-size:30px!important;line-height:1.12!important;margin-bottom:26px!important}
  .orbit-body h2{margin-top:24px!important;margin-bottom:12px!important}
  .orbit-action{width:100%!important;margin-top:14px!important}
  .orbit-action td{width:100%!important}
  .orbit-action-link{display:block!important;width:100%!important;min-width:0!important;padding:16px 14px!important;font-size:13px!important}
  .orbit-footer td{display:block!important;width:100%!important;text-align:center!important}
  .orbit-footer td+td{padding-top:10px!important;text-align:center!important}
  .orbit-attachment td{padding:17px 16px!important}
}
</style></head><body style="margin:0;padding:0;background:#ece9e3"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${fixedLayout}background:#ece9e3"><tr><td class="orbit-shell-cell" align="center" style="padding:24px 10px"><table class="orbit-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;${fixedLayout}background:#0b0c0e;border:1px solid #333437;border-radius:24px;overflow:hidden"><tr><td style="height:6px;background:#f78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="orbit-header" style="padding:34px 30px 26px;background:#111214;color:#ffffff;text-align:center">${header}</td></tr><tr><td class="orbit-body" style="padding:36px 30px 30px;font-family:Arial,sans-serif;color:#e9e9ea;line-height:1.68${safeWrapping}">${heading}${input.contentHtml}${benefits}${attachment}${actions}${input.contentAfterActionsHtml ?? ""}${closing}${signature}<table class="orbit-footer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-top:1px solid #343538"><tr><td style="padding-top:10px;font-family:Arial,sans-serif">${footerLogo}<br><a href="https://www.bbox.cl" style="font-family:Arial,sans-serif;font-size:13px;color:#f78900;text-decoration:underline">${websiteLabel}</a></td><td align="right" style="padding-top:10px;font-size:10px;line-height:1.7;letter-spacing:.18em;color:#b8b8ba">EXPERIENCIAS<br>RECUERDOS<br>MOMENTOS</td></tr></table><p style="margin:12px 0 0;font-size:10px;line-height:1.5;letter-spacing:.08em;color:#77787c">COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®</p></td></tr></table></td></tr></table></body></html>`;
}
