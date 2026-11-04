// The ChessScout bot on Lichess: a Lichess BOT account (clearly marked as a bot)
// that anyone on Lichess can challenge, any time. It plays at about the
// challenger's level using our own Stockfish, says hello once with a link to
// ChessScout.net, and "gg" at the end. Its Lichess profile is where people find
// out about ChessScout.
//
// Set LICHESS_BOT_TOKEN (a token for the bot account with the bot:play scope).
// A brand-new account has to be upgraded to a BOT account once, before it plays
// any game: set LICHESS_BOT_UPGRADE=1 for that (the upgrade can't be undone).
// LICHESS_BOT_MAX_GAMES: games at once (default 2).
import { Chess } from "chess.js";
import { stockfishBotMove } from "./engineAnalysis";
import { logger } from "./logger";

const TOKEN = process.env.LICHESS_BOT_TOKEN || "";
const MAX_GAMES = Math.max(1, parseInt(process.env.LICHESS_BOT_MAX_GAMES || "") || 2);
const API = "https://lichess.org";
const H = () => ({ Authorization: `Bearer ${TOKEN}` });
const HELLO = "Hi! I'm the ChessScout.net coach bot, playing at about your level. Good luck! Get this game reviewed free at chessscout.net";
const GG = "gg! See where it was won or lost: free review at chessscout.net";

let botId = "";

// ── Games against other bots (opt-in: LICHESS_BOT_CHALLENGE=1) ─────────────
// When it has no game going, every LICHESS_BOT_CHALLENGE_MINUTES (default 15) it
// challenges one online bot rated near its own: rated blitz 3+2 by default
// (LICHESS_BOT_CHALLENGE_CLOCK, e.g. "5+3"). It never challenges the same bot twice
// in a day, and pauses for an hour after three refusals in a row, so it stays a
// polite, ordinary bot. Humans' challenges always come first.
const CHALLENGE_BOTS = process.env.LICHESS_BOT_CHALLENGE === "1";
const CHALLENGE_EVERY_MS = Math.max(5, parseInt(process.env.LICHESS_BOT_CHALLENGE_MINUTES || "") || 15) * 60_000;
const [CH_MIN, CH_INC] = (process.env.LICHESS_BOT_CHALLENGE_CLOCK || "3+2").split("+").map((x) => parseInt(x, 10));
const challenged = new Map<string, number>();
let refusals = 0, pausedUntil = 0, myRating = 1500;

async function readNdjson(path: string): Promise<any[]> {
  const out: any[] = [];
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10_000);
  try { await stream(path, (x) => out.push(x), ac.signal); } catch { /* timed out: use what came */ } finally { clearTimeout(t); }
  return out;
}

async function challengeABot() {
  if (!CHALLENGE_BOTS || playing.size > 0 || Date.now() < pausedUntil) return;
  const minutes = Number.isFinite(CH_MIN) && CH_MIN > 0 ? CH_MIN : 3, inc = Number.isFinite(CH_INC) && CH_INC >= 0 ? CH_INC : 2;
  const speed = minutes * 60 + inc * 40 < 180 ? "bullet" : minutes * 60 + inc * 40 < 480 ? "blitz" : "rapid";
  for (const [k, at] of challenged) if (Date.now() - at > 24 * 3600_000) challenged.delete(k);
  const bots = await readNdjson("/api/bot/online?nb=60");
  const pick = bots
    .filter((b) => b?.id && b.id !== botId && !challenged.has(b.id) && !b.disabled && !b.tosViolation)
    .map((b) => ({ id: b.id as string, name: b.username as string, rating: Number(b.perfs?.[speed]?.rating) || 0, games: Number(b.perfs?.[speed]?.games) || 0 }))
    .filter((b) => b.rating > 0 && b.games > 20 && Math.abs(b.rating - myRating) <= 300)
    .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating))
    .slice(0, 8);
  const target = pick[Math.floor(Math.random() * pick.length)];
  if (!target) return;
  challenged.set(target.id, Date.now());
  const r = await post(`/api/challenge/${encodeURIComponent(target.name)}`, { rated: "true", "clock.limit": String(minutes * 60), "clock.increment": String(inc), color: "random", variant: "standard" });
  if (r?.ok) logger.info({ opponent: target.name, rating: target.rating }, "[lichess-bot] challenged a bot");
}
function noteRefusal() { if (++refusals >= 3) { refusals = 0; pausedUntil = Date.now() + 3600_000; } }
const playing = new Map<string, { abort: AbortController }>();

async function post(path: string, body?: Record<string, string>) {
  return fetch(`${API}${path}`, { method: "POST", headers: { ...H(), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: body ? new URLSearchParams(body) : undefined }).catch(() => null);
}

async function stream(path: string, onLine: (x: any) => void, signal: AbortSignal): Promise<number> {
  const r = await fetch(`${API}${path}`, { headers: H(), signal });
  if (!r.ok || !r.body) return r.status;
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) { try { onLine(JSON.parse(line)); } catch { /* keep-alive */ } }
    }
  }
  return r.status;
}

function playGame(gameId: string) {
  if (playing.has(gameId)) return;
  const abort = new AbortController();
  playing.set(gameId, { abort });
  let color: "white" | "black" = "white";
  let elo = 1500; let initialFen = "startpos"; let greeted = false; let thinkingFor = -1;
  const onState = async (moves: string, status: string) => {
    if (status !== "started") {
      if (status !== "aborted" && status !== "noStart") void post(`/api/bot/game/${gameId}/chat`, { room: "player", text: GG });
      abort.abort(); return;
    }
    const list = moves.split(" ").filter(Boolean);
    if (thinkingFor === list.length) return;
    try {
      const c = initialFen === "startpos" ? new Chess() : new Chess(initialFen);
      for (const u of list) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (c.isGameOver() || c.turn() !== (color === "white" ? "w" : "b")) return;
      thinkingFor = list.length;
      const uci = await stockfishBotMove(c.fen(), elo);
      const move = uci ?? (() => { const m = c.moves({ verbose: true }); const x = m[Math.floor(Math.random() * m.length)]; return x ? `${x.from}${x.to}${x.promotion ?? ""}` : null; })();
      if (move) await post(`/api/bot/game/${gameId}/move/${move}`);
    } catch (err) {
      logger.warn({ err, gameId }, "[lichess-bot] move failed");
      thinkingFor = -1;
    }
  };
  void stream(`/api/bot/game/stream/${gameId}`, (x) => {
    if (x.type === "gameFull") {
      color = x.white?.id === botId ? "white" : "black";
      initialFen = x.initialFen || "startpos";
      const opp = color === "white" ? x.black : x.white;
      // About the challenger's level (Stockfish's limiter starts at 1350).
      elo = Math.max(1350, Math.min(2600, Number(opp?.rating) || 1500));
      if (!greeted) { greeted = true; void post(`/api/bot/game/${gameId}/chat`, { room: "player", text: HELLO }); }
      void onState(x.state?.moves ?? "", x.state?.status ?? "started");
    } else if (x.type === "gameState") {
      void onState(x.moves ?? "", x.status ?? "started");
    }
  }, abort.signal).catch(() => {}).finally(() => playing.delete(gameId));
}

async function onEvent(e: any) {
  if (e.type === "challenge") {
    const ch = e.challenge;
    if (!ch || ch.challenger?.id === botId) return;
    const okVariant = ch.variant?.key === "standard";
    const okSpeed = ["bullet", "blitz", "rapid", "classical"].includes(ch.speed);
    if (!okVariant) { await post(`/api/challenge/${ch.id}/decline`, { reason: "standard" }); return; }
    if (!okSpeed) { await post(`/api/challenge/${ch.id}/decline`, { reason: "timeControl" }); return; }
    if (playing.size >= MAX_GAMES) { await post(`/api/challenge/${ch.id}/decline`, { reason: "later" }); return; }
    await post(`/api/challenge/${ch.id}/accept`);
  } else if (e.type === "gameStart" && e.game?.gameId) {
    refusals = 0;
    playGame(e.game.gameId);
  } else if (e.type === "challengeDeclined" && e.challenge?.challenger?.id === botId) {
    noteRefusal();
  }
}

export async function startLichessBot(): Promise<void> {
  if (!TOKEN) return;
  try {
    const acc = await fetch(`${API}/api/account`, { headers: H() }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id?: string; title?: string; username?: string } | null;
    if (!acc?.id) { logger.warn("[lichess-bot] couldn't read the bot account (check LICHESS_BOT_TOKEN)"); return; }
    if (acc.title !== "BOT") {
      if (process.env.LICHESS_BOT_UPGRADE !== "1") { logger.warn({ user: acc.username }, "[lichess-bot] not a BOT account yet: set LICHESS_BOT_UPGRADE=1 once to upgrade it"); return; }
      const r = await post("/api/bot/account/upgrade");
      if (!r?.ok) { logger.warn({ status: r?.status }, "[lichess-bot] upgrade to BOT failed (the account must have played no games)"); return; }
      logger.info({ user: acc.username }, "[lichess-bot] upgraded to a BOT account");
    }
    botId = acc.id;
    logger.info({ user: acc.username, challengeBots: CHALLENGE_BOTS }, "[lichess-bot] online");
    if (CHALLENGE_BOTS) {
      // Its own rating at the challenge clock, to pick opponents near it.
      const refreshRating = async () => {
        const me = await fetch(`${API}/api/account`, { headers: H() }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { perfs?: Record<string, { rating?: number }> } | null;
        const sp = (CH_MIN || 3) * 60 + (CH_INC || 0) * 40 < 180 ? "bullet" : (CH_MIN || 3) * 60 + (CH_INC || 0) * 40 < 480 ? "blitz" : "rapid";
        myRating = Number(me?.perfs?.[sp]?.rating) || myRating;
      };
      setTimeout(() => { void refreshRating(); void challengeABot().catch(() => {}); }, 60_000);
      setInterval(() => { void refreshRating().then(() => challengeABot()).catch(() => {}); }, CHALLENGE_EVERY_MS);
    }
    // The event stream, reconnecting with a growing pause if it drops.
    let wait = 2000;
    for (;;) {
      const ac = new AbortController();
      const started = Date.now();
      const code = await stream("/api/stream/event", (e) => { void onEvent(e).catch(() => {}); }, ac.signal).catch(() => 0);
      if (code === 401) { logger.warn("[lichess-bot] token refused; stopping"); return; }
      wait = Date.now() - started > 60_000 ? 2000 : Math.min(60_000, wait * 2);
      await new Promise((r) => setTimeout(r, code === 429 ? 60_000 : wait));
    }
  } catch (err) {
    logger.error({ err }, "[lichess-bot] stopped");
  }
}
