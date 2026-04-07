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

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
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

  for (const to of recipients) {
    try {
      await sendEmail({ to, subject, html, text });
      results.sent++;
      await delay(600);
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${to}: ${err.message}`);
      console.error(`Email failed for ${to}:`, err.message);
      if (err.message?.includes('rate') || err.message?.includes('429')) {
        console.log('Rate limited, waiting 5s...');
        await delay(5000);
        try {
          await sendEmail({ to, subject, html, text });
          results.failed--;
          results.sent++;
          results.errors.pop();
        } catch (retryErr: any) {
          console.error(`Retry also failed for ${to}:`, retryErr.message);
        }
      }
    }
  }

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
      <h2 style="color:#e8e6e3;font-size:22px;margin:0 0 16px;">Welcome, ${name}!</h2>
      <p style="color:#9e9b98;font-size:16px;line-height:1.6;margin:0 0 16px;">
        Thanks for joining ChessScout — the #1 chess scouting tool. You now have access to powerful opponent analysis to gain an edge in every game.
      </p>
      <p style="color:#9e9b98;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Here's what you can do right away:
      </p>
      <ul style="color:#e8e6e3;font-size:15px;line-height:2;margin:0 0 24px;padding-left:20px;">
        <li><strong>Opponent Scout</strong> — Analyze any player's weaknesses</li>
        <li><strong>Game Lookup</strong> — Review any Chess.com game with AI</li>
        <li><strong>Play Local</strong> — Practice over the board</li>
        <li><strong>Practice Bots</strong> — Train against different playing styles</li>
      </ul>
      <div style="text-align:center;">
        <a href="https://chessscout.net" style="display:inline-block;background-color:#81b64c;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Start Scouting</a>
      </div>
    </div>
    <p style="color:#666;font-size:13px;text-align:center;margin:0;">
      ChessScout.net — Know your opponent's weaknesses.
    </p>
  </div>
</body>
</html>`;
}
