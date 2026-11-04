// Play on Lichess: connecting a Lichess account (scope board:play). The server does
// the Lichess sign-in and keeps the connection on the ChessScout account, so it works
// wherever the trip back from Lichess finishes (on Android that can be a separate
// browser screen). The app asks for the connection when it needs it.
// The Lichess token is stored encrypted (AES-256-GCM).
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const FRONTEND_URL = process.env.CORS_ORIGIN || "";
const KEY = crypto.createHash("sha256").update(process.env.LICHESS_TOKEN_KEY || process.env.DATABASE_URL || "chessscout").digest();
const pending = new Map<string, { userId: string; verifier: string; returnTo: string; at: number }>();
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const origin = (req: Request) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}`;
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

let ready: Promise<void> | null = null;
const ensureTable = () => (ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS lichess_board_tokens (
  user_id varchar PRIMARY KEY, token text NOT NULL, username varchar NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
)`).then(() => undefined).catch((e) => { ready = null; throw e; }));

function seal(text: string): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
function open(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((x) => Buffer.from(x, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}
const safeReturn = (p: unknown) => (typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p.slice(0, 300) : "/lichess");

// Start: the app gets the Lichess URL to go to.
router.post("/lichess/board/connect", requireAuth, (req: Request, res: Response) => {
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  pending.set(state, { userId: req.user!.id, verifier, returnTo: safeReturn((req.body as { returnTo?: string })?.returnTo), at: Date.now() });
  const p = new URLSearchParams({ response_type: "code", client_id: "chessscout.net", redirect_uri: `${origin(req)}/api/lichess/board/callback`, scope: "board:play", code_challenge_method: "S256", code_challenge: challenge, state });
  res.json({ url: `https://lichess.org/oauth?${p}` });
});

// Back from Lichess: finish here and save the connection on the account.
router.get("/lichess/board/callback", async (req: Request, res: Response) => {
  const front = FRONTEND_URL || origin(req);
  const state = String(req.query.state ?? ""); const code = String(req.query.code ?? "");
  const p = pending.get(state); pending.delete(state);
  const back = (q: string) => res.redirect(`${front}${p?.returnTo ?? "/lichess"}${(p?.returnTo ?? "").includes("?") ? "&" : "?"}${q}`);
  if (!p) { res.redirect(`${front}/lichess?lichess=expired`); return; }
  if (req.query.error || !code) { back("lichess=declined"); return; }
  try {
    const t = await fetch("https://lichess.org/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: p.verifier, redirect_uri: `${origin(req)}/api/lichess/board/callback`, client_id: "chessscout.net" }),
    });
    const d = await t.json().catch(() => null) as { access_token?: string } | null;
    if (!t.ok || !d?.access_token) { back("lichess=failed"); return; }
    const acc = await fetch("https://lichess.org/api/account", { headers: { Authorization: `Bearer ${d.access_token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { username?: string; title?: string } | null;
    if (!acc?.username || acc.title === "BOT") { back("lichess=failed"); return; }
    await ensureTable();
    await db.execute(sql`INSERT INTO lichess_board_tokens (user_id, token, username, updated_at) VALUES (${p.userId}, ${seal(d.access_token)}, ${acc.username}, now())
      ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, username = EXCLUDED.username, updated_at = now()`);
    // Their Lichess name, if none is linked yet, so finished games import as theirs.
    await db.execute(sql`UPDATE users SET lichess_username = ${acc.username} WHERE id = ${p.userId} AND lichess_username IS NULL`);
    back("lichess=connected");
  } catch (err) {
    logger.warn({ err }, "[lichess] board connect failed");
    back("lichess=failed");
  }
});

// The app asks for its connection (kept on the device after this).
router.get("/lichess/board/token", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const [r] = rowsOf<{ token: string; username: string }>(await db.execute(sql`SELECT token, username FROM lichess_board_tokens WHERE user_id = ${req.user!.id}`));
    const token = r ? open(r.token) : null;
    res.json(token ? { connected: true, token, username: r!.username } : { connected: false });
  } catch { res.json({ connected: false }); }
});

router.delete("/lichess/board/token", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const [r] = rowsOf<{ token: string }>(await db.execute(sql`DELETE FROM lichess_board_tokens WHERE user_id = ${req.user!.id} RETURNING token`));
    const token = r ? open(r.token) : null;
    if (token) void fetch("https://lichess.org/api/token", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  } catch { /* ignore */ }
  res.json({ ok: true });
});

export default router;
