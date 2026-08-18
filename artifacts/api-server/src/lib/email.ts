import { Resend } from 'resend';

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
  const name = firstName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#81b64c;font-size:28px;margin:0;">♜ ChessScout.net</h1>
    </div>
    <div style="background-color:#302e2b;border-radius:12px;padding:32px;margin-bottom:24px;">
      <img src="https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=600&h=300&fit=crop&q=80" alt="Chess board" style="width:100%;height:auto;border-radius:8px;margin-bottom:24px;display:block;" />
      <h2 style="color:#e8e6e3;font-size:22px;margin:0 0 4px;">Welcome, ${name}!</h2>
      <p style="color:#9e9b98;font-size:13px;margin:0 0 20px;">The smartest way to prepare for your opponents</p>
      <p style="color:#9e9b98;font-size:15px;line-height:1.6;margin:0 0 20px;">
        You've just joined the chess tool that top players use to gain an edge before every game. ChessScout analyzes your opponents so you don't have to.
      </p>
      <div style="border-top:1px solid rgba(129,182,76,0.15);margin:20px 0;"></div>
      <h3 style="color:#81b64c;font-size:16px;margin:0 0 12px;">Here's what you can do right now:</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🔍</td><td style="padding:8px 0;color:#e8e6e3;font-size:14px;"><strong>Opponent Scout</strong><br/><span style="color:#9e9b98;font-size:13px;">Deep analysis of any player's openings, weaknesses &amp; tendencies</span></td></tr>
        <tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">♟️</td><td style="padding:8px 0;color:#e8e6e3;font-size:14px;"><strong>Game Lookup</strong><br/><span style="color:#9e9b98;font-size:13px;">Review any Chess.com game with deep move analysis</span></td></tr>
        <tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🧩</td><td style="padding:8px 0;color:#e8e6e3;font-size:14px;"><strong>Daily Puzzles</strong><br/><span style="color:#9e9b98;font-size:13px;">Sharpen your tactics with curated puzzle sets</span></td></tr>
        <tr><td style="padding:8px 0;vertical-align:top;width:30px;color:#81b64c;font-size:18px;">🤖</td><td style="padding:8px 0;color:#e8e6e3;font-size:14px;"><strong>Practice Bots</strong><br/><span style="color:#9e9b98;font-size:13px;">Train against bots calibrated to different rating levels</span></td></tr>
      </table>
      <div style="border-top:1px solid rgba(129,182,76,0.15);margin:20px 0;"></div>
      <div style="text-align:center;">
        <a href="https://chessscout.net" style="display:inline-block;background-color:#81b64c;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Start Scouting Your Opponents →</a>
      </div>
      <p style="text-align:center;margin-top:12px;color:#9e9b98;font-size:12px;">Free account includes 5 puzzles/day &amp; full game lookup</p>
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin:0;">
      ChessScout.net — Know your opponent's weaknesses.
    </p>
  </div>
</body>
</html>`;
}
