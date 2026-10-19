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

const actionButton = (action: CommercialEmailAction, secondary = false) => {
  const background = secondary ? "#FFFFFF" : "#F78900";
  const border = secondary ? "#D9D2C7" : "#F78900";
  const textColor = "#171717";
  const vmlWidth = secondary ? "300px" : "300px";
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(action.href)}" style="height:48px;v-text-anchor:middle;width:${vmlWidth};" arcsize="20%" strokecolor="${border}" fillcolor="${background}"><w:anchorlock/><center style="color:${textColor};font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:.04em">${escapeHtml(action.label)}</center></v:roundrect><![endif]-->`;
  const link = `<!--[if !mso]><!--><a class="orbit-action-link" href="${escapeHtml(action.href)}" style="display:inline-block;box-sizing:border-box;width:300px;max-width:100%;padding:15px 24px;background-color:${background};border:1px solid ${border};border-radius:12px;color:${textColor};text-align:center;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.35;letter-spacing:.04em">${escapeHtml(action.label)}</a><!--<![endif]-->`;
  return `<table role="presentation" class="orbit-action" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:${secondary ? "10px" : "20px"} 0 0;background-color:#000000"><tr><td align="center" bgcolor="${background.replace("#", "")}" style="padding:0;text-align:center;background-color:${background};border-radius:12px">${vml}${link}</td></tr></table>`;
};

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
    ? `<table class="orbit-attachment" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;background-color:#FFF7EB;border:1px solid #F4D5AA;border-radius:12px"><tr><td bgcolor="FFF7EB" style="padding:15px 17px;background-color:#FFF7EB;color:#4B3A25;font-family:Arial,sans-serif;font-size:13px;line-height:1.5"><strong style="color:#D76D00">PDF ADJUNTO</strong><br>${escapeHtml(input.attachmentNote)}</td></tr></table>`
    : "";
  const signature = input.signatureHtml
    ? `<div class="orbit-signature" style="margin-top:10px">${input.signatureHtml}</div>`
    : "";
  const fixedLayout = input.fixedLayout ? "table-layout:fixed;" : "";
  const safeWrapping = input.fixedLayout ? ";overflow-wrap:anywhere" : "";
  const benefits = input.benefits?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:38px 0 0;background-color:#000000;border-top:1px solid #343538;padding-top:30px"><tr><td bgcolor="000000" style="padding:0 0 20px;background-color:#000000;font-family:Arial,sans-serif;font-size:21px;line-height:1.3;font-weight:700;color:#FFFFFF">Una vez dentro podrás:</td></tr>${input.benefits.map((benefit, index) => `<tr><td bgcolor="000000" style="padding:11px 0;background-color:#000000;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#E9E9EA"><span style="display:inline-block;width:30px;height:30px;margin-right:16px;border:1px solid #F78900;border-radius:8px;color:#F78900;text-align:center;line-height:30px;font-weight:700;vertical-align:middle">${["⌑", "＋", "▤", "✓"][index % 4]}</span><span style="vertical-align:middle">${escapeHtml(benefit)}</span></td></tr>`).join("")}</table>`
    : "";
  const closing = input.closingLine
    ? `<p style="margin:28px 0 0;padding-top:22px;border-top:1px solid #343538;font-family:Arial,sans-serif;font-size:18px;line-height:1.45;font-weight:700;color:#ffffff">${escapeHtml(input.closingLine)}</p>`
    : "";

  const heading = `${input.eyebrow ? `<p style="margin:0 0 12px;color:#f78900;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>` : ""}${input.title ? `<h1 style="margin:0 0 24px;font-size:38px;line-height:1.08;letter-spacing:-.03em;color:#ffffff">${escapeHtml(input.title)}</h1>` : ""}`;
  const logoUrl = input.logoUrl ?? "https://app.bbox.cl/branding/boombox-official-logo.png";
  const header = input.stackedHeader
    ? `<img class="orbit-logo" src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="220" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto;border:0"/><div class="orbit-header-label" style="margin-top:0;font-family:Arial,sans-serif;font-size:10px;line-height:1.35;letter-spacing:.18em;color:#F78900">${escapeHtml(headerLabel)}</div>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="000000" style="width:100%;background-color:#000000"><tr><td bgcolor="000000" style="background-color:#000000"><img src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0"/></td><td bgcolor="000000" align="right" style="background-color:#000000;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.18em;color:#F78900">${escapeHtml(headerLabel)}</td></tr></table>`;

  const websiteLabel = "www.bbox.cl";
  const footerLogo = `<img class="orbit-footer-logo" src="${escapeHtml(logoUrl)}" alt="BOOMBOX®" width="150" style="display:block;width:150px;max-width:100%;height:auto;margin:0;border:0"/>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><style>
.orbit-signature img{display:block!important;width:auto!important;max-width:280px!important;max-height:72px!important;height:auto!important;margin-left:auto!important;margin-right:auto!important}
@media only screen and (max-width:520px){
  .orbit-logo-frame{width:188px!important;height:47px!important}
  .orbit-logo{width:188px!important;height:auto!important}
  .orbit-header-label{margin-top:0!important}
  .orbit-signature{margin-top:6px!important;margin-bottom:0!important}
  .orbit-signature img{max-width:280px!important;max-height:72px!important}
  .orbit-footer-logo{width:132px!important;height:auto!important;margin:0 auto!important}
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
</style></head><body bgcolor="000000" style="margin:0;padding:0;background-color:#000000"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="000000" style="width:100%;${fixedLayout}background-color:#000000"><tr><td class="orbit-shell-cell" align="center" bgcolor="000000" style="padding:24px 10px;background-color:#000000"><table class="orbit-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="000000" style="width:100%;max-width:640px;${fixedLayout}background-color:#000000;border:1px solid #333437;border-radius:24px;overflow:hidden"><tr><td bgcolor="F78900" style="height:6px;background-color:#F78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="orbit-header" bgcolor="000000" style="padding:34px 30px 26px;background-color:#000000;color:#FFFFFF;text-align:center">${header}</td></tr><tr><td class="orbit-body" bgcolor="000000" style="padding:36px 30px 30px;background-color:#000000;font-family:Arial,sans-serif;color:#E9E9EA;line-height:1.68${safeWrapping}">${heading}${input.contentHtml}${benefits}${attachment}${actions}${input.contentAfterActionsHtml ?? ""}${closing}${signature}<table class="orbit-footer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="000000" style="margin-top:10px;background-color:#000000;border-top:1px solid #343538"><tr><td bgcolor="000000" style="padding-top:10px;background-color:#000000;font-family:Arial,sans-serif">${footerLogo}<br><a href="https://www.bbox.cl" style="font-family:Arial,sans-serif;font-size:13px;color:#F78900;text-decoration:underline">${websiteLabel}</a></td><td bgcolor="000000" align="right" style="padding-top:10px;background-color:#000000;color:#B8B8BA;font-size:10px;line-height:1.7;letter-spacing:.18em">EXPERIENCIAS<br>RECUERDOS<br>MOMENTOS</td></tr></table><p style="margin:12px 0 0;color:#77787C;font-size:10px;line-height:1.5;letter-spacing:.08em">COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®</p></td></tr></table></td></tr></table></body></html>`;
}
