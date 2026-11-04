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
    playGame(e.game.gameId);
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
    logger.info({ user: acc.username }, "[lichess-bot] online");
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
