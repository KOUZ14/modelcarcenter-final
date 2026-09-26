export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Wraps notification content in the shared Model Car Center email design.
 * The structural styles are inline for broad email-client support; the small
 * style block handles progressive enhancements and responsive spacing.
 */
export function renderEmailHtml(
  subject: string,
  content: string,
  siteUrl = "https://modelcarcenter.com",
  supportEmail = "support@modelcarcenter.com",
  preferences: { unsubscribeUrl?: string; businessName?: string; mailingAddress?: string } = {},
) {
  const safeSubject = escapeHtml(subject);
  const safeSiteUrl = escapeHtml(siteUrl);
  const safeSupportEmail = escapeHtml(supportEmail);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${safeSubject}</title>
  <style>
    body { margin: 0 !important; padding: 0 !important; background: #ebe9e4; color: #0b0b0c; }
    table { border-collapse: collapse; border-spacing: 0; }
    img { border: 0; display: block; }
    .email-content h1 { margin: 0 0 20px; color: #0b0b0c; font-family: Arial, Helvetica, sans-serif; font-size: 34px; line-height: 1.12; letter-spacing: -0.025em; }
    .email-content h2 { margin: 30px 0 12px; color: #0b0b0c; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; }
    .email-content p { margin: 0 0 18px; color: #4f4e4a; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.65; }
    .email-content strong { color: #0b0b0c; }
    .email-content a { display: inline-block; margin: 5px 0 4px; padding: 14px 20px; color: #ffffff !important; background: #0b0b0c; border-left: 4px solid #d5001c; font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; line-height: 1.2; text-decoration: none; }
    .email-content ul { margin: 6px 0 24px; padding: 0; border-top: 1px solid #d9d7d2; list-style: none; }
    .email-content li { padding: 13px 0; color: #333331; border-bottom: 1px solid #d9d7d2; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; }
    .email-content pre { margin: 0 0 22px; padding: 16px; overflow-wrap: anywhere; white-space: pre-wrap; color: #333331; background: #f7f6f3; border-left: 3px solid #d5001c; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.55; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
      .email-content h1 { font-size: 29px !important; }
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safeSubject}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#ebe9e4;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">
          <tr>
            <td class="email-padding" style="padding:26px 42px;background:#0b0b0c;border-bottom:4px solid #d5001c;">
              <a href="${safeSiteUrl}" style="color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                <span style="display:inline-block;margin-right:12px;padding:8px 9px;color:#0b0b0c;background:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.08em;vertical-align:middle;">MCC</span>
                <span style="font-size:15px;font-weight:400;letter-spacing:0.075em;vertical-align:middle;">MODEL CAR <strong style="color:#ffffff;font-weight:800;">CENTER</strong></span>
              </a>
            </td>
          </tr>
          <tr>
            <td class="email-padding email-content" style="padding:44px 42px 38px;">
              <div style="margin:0 0 18px;color:#777570;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;">Marketplace update</div>
              ${content}
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:28px 42px;color:#aaa8a3;background:#171718;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;">
              <p style="margin:0 0 8px;color:#ffffff;font-weight:700;">Made for collectors.</p>
              <p style="margin:0;">Questions? Reply to this email or contact <a href="mailto:${safeSupportEmail}" style="color:#ffffff;text-decoration:underline;">${safeSupportEmail}</a>.</p>
              ${preferences.businessName ? `<p style="margin:12px 0 0;">${escapeHtml(preferences.businessName)}${preferences.mailingAddress ? `<br>${escapeHtml(preferences.mailingAddress).replace(/\r?\n/g, "<br>")}` : ""}</p>` : ""}
              ${preferences.unsubscribeUrl ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(preferences.unsubscribeUrl)}" style="color:#ffffff;text-decoration:underline;">Unsubscribe from optional emails</a></p>` : ""}
              <p style="margin:12px 0 0;"><a href="${safeSiteUrl}" style="color:#aaa8a3;text-decoration:none;">Model Car Center</a> &middot; One search for the models worth collecting.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
