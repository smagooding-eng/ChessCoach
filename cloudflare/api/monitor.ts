// Uptime alerts for Shann. Cloudflare runs this every minute (the cron in wrangler.jsonc).
// It checks the API (and its database) and sends a phone notification through ntfy
// (free app: ntfy.sh, subscribe to the topic in NTFY_TOPIC) when it goes down, a reminder
// every 30 minutes while it stays down, and an all-clear when it's back.
//
// State lives in the ntfy topic itself (its last message), so nothing else is needed.
// Worker secrets (Cloudflare → Workers → chesscoach1 → Settings → Variables and secrets):
//   NTFY_TOPIC   a long random name only you know, e.g. chessscout-alerts-<random>
//   ALERT_EMAIL  optional: also email the alerts here (sent by ntfy)

export interface MonitorEnv { API_URL?: string; NTFY_TOPIC?: string; ALERT_EMAIL?: string; PREVIEW_API_URL?: string }

const REMIND_MS = 30 * 60_000;

async function probe(url: string): Promise<{ ok: boolean; why: string }> {
  try {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'ChessScout-uptime' }, signal: AbortSignal.timeout(12_000) });
    const j = await r.json().catch(() => null) as { status?: string; db?: string } | null;
    if (j?.db && j.db !== 'ok') return { ok: false, why: `server up, but the database is ${j.db}` };
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
    return { ok: true, why: '' };
  } catch (e) {
    return { ok: false, why: e instanceof Error && e.name === 'TimeoutError' ? 'no answer in 12 s' : 'unreachable' };
  }
}

/** Twice, 15 s apart, so one blip doesn't wake anyone up. */
async function isDown(base: string): Promise<string | null> {
  const url = `${base.replace(/\/+$/, '')}/api/healthz/deep`;
  const a = await probe(url);
  if (a.ok) return null;
  await new Promise((r) => setTimeout(r, 15_000));
  const b = await probe(url);
  return b.ok ? null : b.why;
}

type Last = { state: 'down' | 'up' | null; at: number };
async function lastMessage(topic: string, tag: string): Promise<Last> {
  try {
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1&since=12h&tags=${tag}`, { signal: AbortSignal.timeout(8000) });
    const lines = (await r.text()).trim().split('\n').filter(Boolean);
    const m = lines.length ? JSON.parse(lines[lines.length - 1]) as { tags?: string[]; time?: number } : null;
    if (!m) return { state: null, at: 0 };
    return { state: m.tags?.includes('down') ? 'down' : 'up', at: (m.time ?? 0) * 1000 };
  } catch { return { state: null, at: 0 }; }
}

async function notify(env: MonitorEnv, tag: string, title: string, body: string, priority: 'urgent' | 'default', tags: string[]) {
  const headers: Record<string, string> = { Title: title, Priority: priority, Tags: [tag, ...tags].join(','), Click: 'https://chessscout.net/admin' };
  if (env.ALERT_EMAIL) headers.Email = env.ALERT_EMAIL;
  await fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC!)}`, { method: 'POST', headers, body }).catch(() => {});
}

async function check(env: MonitorEnv, name: string, base: string | undefined, tag: string) {
  if (!base) return;
  const why = await isDown(base);
  const last = await lastMessage(env.NTFY_TOPIC!, tag);
  const now = Date.now();
  if (why) {
    if (last.state !== 'down') await notify(env, tag, `${name} is DOWN`, `${base} — ${why}. Checked twice, 15 s apart.`, 'urgent', ['down', 'rotating_light']);
    else if (now - last.at > REMIND_MS) await notify(env, tag, `${name} still down`, `${base} — ${why}. (Reminder every 30 min until it's back.)`, 'urgent', ['down', 'warning']);
  } else if (last.state === 'down') {
    await notify(env, tag, `${name} is back up`, `${base} is answering again.`, 'default', ['up', 'white_check_mark']);
  }
}

export async function runMonitor(env: MonitorEnv): Promise<void> {
  if (!env.NTFY_TOPIC) return;
  await Promise.all([
    check(env, 'ChessScout', env.API_URL, 'prod'),
    // the preview server, once there is one (a quieter heads-up, same topic)
    check(env, 'ChessScout preview', env.PREVIEW_API_URL, 'preview'),
  ]);
}
