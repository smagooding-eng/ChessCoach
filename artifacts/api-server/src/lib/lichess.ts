import { logger } from "./logger";
import { extractOpeningFromPgn } from "./chesscom";

export interface LichessProfile {
  username: string;
  title?: string;
  country?: string;
  // Lichess does not serve profile pictures via API, so this stays undefined.
  avatar?: string;
  createdAt?: number;
}

export async function fetchLichessProfile(username: string): Promise<LichessProfile | null> {
  const lower = username.toLowerCase();
  try {
    const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(lower)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const profile = (data.profile ?? {}) as Record<string, unknown>;
    const flag = typeof profile.flag === "string" ? profile.flag : undefined;
    return {
      username: lower,
      title: typeof data.title === "string" ? data.title : undefined,
      country: flag ? flag.toUpperCase() : undefined,
      createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
    };
  } catch (err) {
    logger.warn({ err, username }, "Failed to fetch lichess profile");
    return null;
  }
}

export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: {
    white: { user?: { name: string; id: string }; rating?: number; aiLevel?: number };
    black: { user?: { name: string; id: string }; rating?: number; aiLevel?: number };
  };
  winner?: "white" | "black";
  opening?: { eco: string; name: string; ply: number };
  clock?: { initial: number; increment: number; totalTime: number };
  pgn?: string;
}

export async function fetchLichessGames(
  username: string,
  months: number = 3
): Promise<LichessGame[]> {
  const since = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?since=${since}&max=500&pgnInJson=true&opening=true&clocks=true&evals=false`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/x-ndjson",
    },
  });

  if (!res.ok) {
    throw new Error(`Lichess API error: ${res.status} for user ${username}`);
  }

  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);
  const games: LichessGame[] = [];

  for (const line of lines) {
    try {
      games.push(JSON.parse(line));
    } catch {
      logger.warn({ line: line.substring(0, 100) }, "Failed to parse Lichess game JSON");
    }
  }

  return games;
}

export function extractLichessGameMetadata(game: LichessGame, username: string) {
  const lower = username.toLowerCase();
  const white = game.players.white;
  const black = game.players.black;

  const whiteUsername = white.user?.name ?? (white.aiLevel ? `Stockfish L${white.aiLevel}` : "Anonymous");
  const blackUsername = black.user?.name ?? (black.aiLevel ? `Stockfish L${black.aiLevel}` : "Anonymous");

  const userIsWhite = whiteUsername.toLowerCase() === lower;

  let result = "draw";
  if (game.winner === "white") {
    result = userIsWhite ? "win" : "loss";
  } else if (game.winner === "black") {
    result = userIsWhite ? "loss" : "win";
  } else if (game.status === "draw" || game.status === "stalemate") {
    result = "draw";
  } else if (game.status === "outoftime" || game.status === "timeout") {
    result = "draw";
  }

  let timeControl = game.speed || "unknown";
  if (game.clock) {
    const mins = Math.floor(game.clock.initial / 60);
    const inc = game.clock.increment;
    timeControl = inc > 0 ? `${mins}+${inc}` : `${mins}`;
  }

  let opening: string | null = game.opening?.name ?? null;
  let eco: string | null = game.opening?.eco ?? null;

  if (game.pgn && (!opening || !eco)) {
    const fromPgn = extractOpeningFromPgn(game.pgn);
    opening = opening || fromPgn.opening;
    eco = eco || fromPgn.eco;
  }

  return {
    whiteUsername,
    blackUsername,
    whiteRating: white.rating ?? 0,
    blackRating: black.rating ?? 0,
    result,
    timeControl,
    opening,
    eco,
    playedAt: new Date(game.lastMoveAt || game.createdAt),
    url: `https://lichess.org/${game.id}`,
    lichessGameId: game.id,
    chesscomGameId: null,
    platform: "lichess" as const,
  };
}
