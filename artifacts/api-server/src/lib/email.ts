import { Resend } from 'resend';
import { emailLayout, emailP, emailFeatures, emailPanel, emailDivider, escapeHtml, EMAIL, EMAIL_FONT } from './emailTheme';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not configured');
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ChessScout <hello@chessscout.net>';

// Free email providers can never be verified as a Resend sending domain —
// you don't control their DNS. If RESEND_FROM_EMAIL is accidentally set to
// one of these (e.g. a personal Gmail address instead of a domain you own),
// every send will fail with a confusing Resend error. Catch it here with a
// clear, actionable message instead.
const FREE_EMAIL_PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com'];
function validateFromEmail() {
  const match = FROM_EMAIL.match(/@([^\s>]+)/);
  const domain = match?.[1]?.toLowerCase();
  if (domain && FREE_EMAIL_PROVIDERS.includes(domain)) {
    throw new Error(
      `RESEND_FROM_EMAIL is set to a "${domain}" address, which can never be verified as a sending domain — ` +
      `you don't own its DNS. Set RESEND_FROM_EMAIL to an address on a domain you control and have verified in Resend (e.g. hello@chessscout.net).`
    );
  }
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  validateFromEmail();
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function sendBulkEmail(recipients: string[], subject: string, html: string, text?: string) {
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  console.log(`[email] Starting bulk send to ${recipients.length} recipients, from: ${FROM_EMAIL}`);

  for (const to of recipients) {
    try {
      const data = await sendEmail({ to, subject, html, text });
      results.sent++;
      console.log(`[email] Sent to ${to}, id: ${data?.id}`);
      await delay(600);
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${to}: ${err.message}`);
      console.error(`[email] FAILED for ${to}:`, err.message);
      if (err.message?.includes('rate') || err.message?.includes('429')) {
        console.log('[email] Rate limited, waiting 5s...');
        await delay(5000);
        try {
          await sendEmail({ to, subject, html, text });
          results.failed--;
          results.sent++;
          results.errors.pop();
        } catch (retryErr: any) {
          console.error(`[email] Retry also failed for ${to}:`, retryErr.message);
        }
      }
    }
  }

  console.log(`[email] Bulk send complete: ${results.sent} sent, ${results.failed} failed`);
  return results;
}

export function welcomeEmailHtml(firstName: string | null): string {
  const name = firstName ? escapeHtml(firstName) : 'there';
  return emailLayout({
    preheader: 'Your account is ready. Play, scout your opponents and get every game reviewed.',
    badge: 'Account ready',
    title: `Welcome, ${name}!`,
    subtitle: 'Play. Scout. Improve. All in one place.',
    body: [
      emailP("Here's what you can do on ChessScout.net:", { mb: 6 }),
      emailFeatures([
        { glyph: '&#9822;', title: 'Play', text: 'Live and daily games against real players, or practice against bots at your level.' },
        { glyph: '&#9819;', title: 'Improve', text: 'Every game reviewed by your coach: the key moments, your mistakes and what to play instead.' },
        { glyph: '&#9820;', title: 'Scout', text: "Look up any Chess.com or Lichess player and see their openings and habits before you face them." },
        { glyph: '&#9821;', title: 'Train', text: 'Puzzles, the opening trainer, chess traps and courses built from your own games.' },
      ]),
      emailPanel(`<div style="color:${EMAIL.text};font-size:14px;font-weight:800;margin:0 0 4px;">Play on Chess.com or Lichess too?</div><div style="color:${EMAIL.muted};font-size:13px;line-height:1.5;">Link your account in <a href="${EMAIL.site}/profile" style="color:${EMAIL.green};text-decoration:none;font-weight:700;">Profile</a> and we'll import your games so your coach can find the patterns.</div>`),
    ].join(''),
    cta: { label: 'Play your first game &rarr;', href: `${EMAIL.site}/play` },
    afterCta: `<p style="margin:14px 0 0;text-align:center;font-size:13px;font-family:${EMAIL_FONT};"><a href="${EMAIL.site}/opponents" style="color:${EMAIL.green};text-decoration:none;font-weight:700;">or scout an opponent</a></p>`,
    footerNote: "You're getting this because you just created a ChessScout.net account.",
  });
}

const RAFFLE_DRAWING_DATE = 'November 17, 2026';
const RAFFLE_MIN_SUBS = 500;

function raffleRules(): string {
  return emailP(`The prize is only awarded if we reach ${RAFFLE_MIN_SUBS} qualifying subscriptions by the drawing date. Your subscription needs to still be active at the time of the drawing to win. No purchase necessary — a free entry method is available. <a href="${EMAIL.site}/raffle-rules" style="color:${EMAIL.green};text-decoration:none;font-weight:700;">Read the full official rules &rarr;</a>`, { size: 12, mb: 22 });
}

// Sent when someone subscribes to Pro during the raffle entry period
// WITHOUT a referral code applied -- one entry.
export function raffleEntryEmailHtml(firstName: string | null): string {
  const name = firstName ? escapeHtml(firstName) : 'there';
  return emailLayout({
    preheader: 'Your Pro subscription earned you a raffle entry for a ChessNut Air.',
    badge: "You're entered",
    title: `You're in the running, ${name}!`,
    subtitle: 'Your Pro subscription just earned you an entry to win',
    body: [
      emailPanel(`<div style="color:${EMAIL.text};font-size:16px;font-weight:800;margin:0 0 4px;">1 raffle entry — ChessNut Air electronic chessboard</div><div style="color:${EMAIL.muted};font-size:13px;">Drawing on ${RAFFLE_DRAWING_DATE}</div>`),
      emailP("Thanks for subscribing to ChessScout.net Pro. You've been automatically entered into our raffle for a chance to win a ChessNut Air.", { size: 14 }),
      `<div style="color:${EMAIL.text};font-size:14px;font-weight:800;margin:0 0 6px;font-family:${EMAIL_FONT};">Want a second entry?</div>`,
      emailP(`Refer a friend and use referral code <strong style="color:${EMAIL.text};">CHESSEDITZ</strong> the next time you resubscribe, or share it with someone who hasn't joined yet — anyone who subscribes using that code gets 2 entries instead of 1.`, { size: 14 }),
      emailDivider(),
      raffleRules(),
    ].join(''),
    cta: { label: 'View raffle details &rarr;', href: `${EMAIL.site}/raffle` },
  });
}

// Sent when someone subscribes to Pro during the raffle entry period
// WITH referral code CHESSEDITZ applied at checkout -- two entries.
export function raffleReferralEntryEmailHtml(firstName: string | null): string {
  const name = firstName ? escapeHtml(firstName) : 'there';
  return emailLayout({
    preheader: 'Your referral code doubled your raffle entries.',
    badge: 'Double entry unlocked',
    title: `Nice move, ${name}: 2 entries!`,
    subtitle: 'Your referral code doubled your odds',
    body: [
      emailPanel(`<div style="color:${EMAIL.text};font-size:16px;font-weight:800;margin:0 0 4px;">2 raffle entries — ChessNut Air electronic chessboard</div><div style="color:${EMAIL.muted};font-size:13px;">Drawing on ${RAFFLE_DRAWING_DATE}</div>`),
      emailP(`You subscribed to ChessScout.net Pro using referral code <strong style="color:${EMAIL.text};">CHESSEDITZ</strong>, so instead of the usual single entry, you've been entered <strong style="color:${EMAIL.text};">twice</strong> into our raffle for a chance to win a ChessNut Air.`, { size: 14 }),
      emailDivider(),
      raffleRules(),
    ].join(''),
    cta: { label: 'View raffle details &rarr;', href: `${EMAIL.site}/raffle` },
  });
}
