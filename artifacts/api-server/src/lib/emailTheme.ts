// Shared look for every ChessScout.net email: the app's current theme
// (near-black page, dark teal-black cards, brand green #81B64C). Table
// layout and inline styles only, so it renders the same in Gmail, Apple
// Mail and Outlook. Every template builds on emailLayout() so they stay
// identical.

export const EMAIL = {
  bg: '#050A0B',
  card: '#0D1516',
  cardInner: '#121B1D',
  border: '#1E2829',
  green: '#81B64C',
  greenDark: '#5F8F36',
  text: '#F5F7F6',
  muted: '#87918E',
  faint: '#5C6664',
  site: 'https://chessscout.net',
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export const EMAIL_FONT = FONT;

/** Footer line injected into admin broadcasts (their HTML is built in the browser). */
export function unsubscribeFooterHtml(url: string): string {
  return `<div style="text-align:center;padding:0 10px 28px;font-family:${FONT};font-size:12px;color:${EMAIL.faint};">Don't want these emails? <a href="${url}" style="color:${EMAIL.faint};text-decoration:underline;">Unsubscribe</a></div>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Neutral chip with a green dot (no green-on-green). */
export function emailBadge(label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
<td style="background:#16201F;border:1px solid ${EMAIL.border};border-radius:999px;padding:5px 12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${EMAIL.text};">
<span style="display:inline-block;width:7px;height:7px;border-radius:7px;background:${EMAIL.green};margin-right:6px;vertical-align:1px;"></span>${label}</td></tr></table>`;
}

/** Solid brand-green button with white text. */
export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>
<td bgcolor="${EMAIL.green}" style="border-radius:12px;background:${EMAIL.green};">
<a href="${href}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none;border-radius:12px;">${label}</a>
</td></tr></table>`;
}

/** A row of feature lines, each with a solid green tile and a white glyph. */
export function emailFeatures(items: { glyph: string; title: string; text: string }[]): string {
  const rows = items.map(i => `<tr>
<td width="44" valign="top" style="padding:8px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" align="center" valign="middle" bgcolor="${EMAIL.green}" style="width:34px;height:34px;border-radius:10px;background:${EMAIL.green};color:#FFFFFF;font-size:21px;line-height:34px;font-family:'Segoe UI Symbol','Apple Symbols',${FONT};">${i.glyph}</td></tr></table>
</td>
<td valign="top" style="padding:8px 0 8px 6px;font-family:${FONT};">
  <div style="color:${EMAIL.text};font-size:14.5px;font-weight:800;margin:0 0 2px;">${i.title}</div>
  <div style="color:${EMAIL.muted};font-size:13px;line-height:1.5;">${i.text}</div>
</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">${rows}</table>`;
}

/** Inset panel for a highlighted number or line. */
export function emailPanel(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td bgcolor="${EMAIL.cardInner}" style="background:${EMAIL.cardInner};border:1px solid ${EMAIL.border};border-radius:14px;padding:18px 20px;text-align:center;font-family:${FONT};">${inner}</td></tr></table>`;
}

export function emailP(html: string, opts: { center?: boolean; size?: number; color?: string; mb?: number } = {}): string {
  return `<p style="margin:0 0 ${opts.mb ?? 16}px;font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:1.6;color:${opts.color ?? EMAIL.muted};${opts.center ? 'text-align:center;' : ''}">${html}</p>`;
}

export function emailDivider(): string {
  return `<div style="height:1px;background:${EMAIL.border};margin:20px 0;line-height:1px;font-size:1px;">&nbsp;</div>`;
}

export function emailLayout(o: {
  /** Hidden inbox preview text. */
  preheader: string;
  badge?: string;
  title: string;
  subtitle?: string;
  body: string;
  cta?: { label: string; href: string };
  afterCta?: string;
  footerNote?: string;
  /** Optional emails only: adds an unsubscribe link to the footer. */
  unsubscribeUrl?: string;
  center?: boolean;
}): string {
  const align = o.center === false ? 'left' : 'center';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>ChessScout.net</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL.bg};" bgcolor="${EMAIL.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${EMAIL.bg};">${o.preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL.bg}" style="background:${EMAIL.bg};">
<tr><td align="center" style="padding:32px 14px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">
    <tr><td align="center" style="padding:0 0 22px;">
      <a href="${EMAIL.site}" style="text-decoration:none;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:10px;"><img src="${EMAIL.site}/icons/icon-192.png" width="40" height="40" alt="ChessScout.net" style="display:block;border:0;border-radius:10px;"></td>
          <td valign="middle" style="font-family:${FONT};font-size:22px;font-weight:900;letter-spacing:-.3px;color:${EMAIL.text};">ChessScout<span style="color:${EMAIL.green};">.net</span></td>
        </tr></table>
      </a>
    </td></tr>
    <tr><td bgcolor="${EMAIL.card}" style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-radius:22px;padding:32px 28px;">
      ${o.badge ? emailBadge(o.badge) : ''}
      <h1 style="margin:0 0 ${o.subtitle ? 6 : 18}px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:900;letter-spacing:-.3px;color:${EMAIL.text};text-align:${align};">${o.title}</h1>
      ${o.subtitle ? `<p style="margin:0 0 22px;font-family:${FONT};font-size:14px;line-height:1.5;color:${EMAIL.muted};text-align:${align};">${o.subtitle}</p>` : ''}
      ${o.body}
      ${o.cta ? `<div style="padding-top:6px;">${emailButton(o.cta.label, o.cta.href)}</div>` : ''}
      ${o.afterCta ?? ''}
    </td></tr>
    <tr><td align="center" style="padding:22px 10px 0;font-family:${FONT};">
      <div style="font-size:13px;font-weight:800;color:${EMAIL.text};margin:0 0 6px;">Play smarter. <span style="color:${EMAIL.green};">Win more.</span></div>
      ${o.footerNote ? `<div style="font-size:12px;line-height:1.5;color:${EMAIL.faint};margin:0 0 6px;">${o.footerNote}</div>` : ''}
      <div style="font-size:12px;color:${EMAIL.faint};"><a href="${EMAIL.site}" style="color:${EMAIL.faint};text-decoration:underline;">chessscout.net</a>${o.unsubscribeUrl ? ` &nbsp;·&nbsp; <a href="${o.unsubscribeUrl}" style="color:${EMAIL.faint};text-decoration:underline;">Unsubscribe</a>` : ''}</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
