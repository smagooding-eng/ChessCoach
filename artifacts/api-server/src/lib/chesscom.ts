import { logger } from "./logger";
import { Chess } from "chess.js";

export interface ChessComProfile {
  username: string;
  name?: string;
  title?: string;
  avatar?: string;
  country?: string;
  followers?: number;
  joined?: number;
  lastOnline?: number;
  url?: string;
  ratings?: {
    bullet?: number;
    blitz?: number;
    rapid?: number;
  };
}

export async function fetchChessComProfile(username: string): Promise<ChessComProfile | null> {
  const lower = username.toLowerCase();
  try {
    const [profileRes, statsRes] = await Promise.all([
      fetch(`https://api.chess.com/pub/player/${lower}`, { headers: { "User-Agent": "ChessCoach/1.0" } }),
      fetch(`https://api.chess.com/pub/player/${lower}/stats`, { headers: { "User-Agent": "ChessCoach/1.0" } }),
    ]);

    if (!profileRes.ok) return null;

    const profile = (await profileRes.json()) as Record<string, unknown>;
    let ratings: ChessComProfile["ratings"] = {};

    if (statsRes.ok) {
      const stats = (await statsRes.json()) as Record<string, unknown>;
      const get = (key: string) => {
        const section = stats[key] as Record<string, unknown> | undefined;
        const last = section?.last as Record<string, unknown> | undefined;
        return typeof last?.rating === "number" ? last.rating : undefined;
      };
      ratings = {
        bullet: get("chess_bullet"),
        blitz: get("chess_blitz"),
        rapid: get("chess_rapid"),
      };
    }

    // Extract country code from country URL
    let country: string | undefined;
    if (typeof profile.country === "string") {
      const parts = profile.country.split("/");
      country = parts[parts.length - 1];
    }

    return {
      username: lower,
      name: typeof profile.name === "string" ? profile.name : undefined,
      title: typeof profile.title === "string" ? profile.title : undefined,
      avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
      country,
      followers: typeof profile.followers === "number" ? profile.followers : undefined,
      joined: typeof profile.joined === "number" ? profile.joined : undefined,
      lastOnline: typeof profile.last_online === "number" ? profile.last_online : undefined,
      url: typeof profile.url === "string" ? profile.url : undefined,
      ratings,
    };
  } catch (err) {
    logger.warn({ err, username }, "Failed to fetch chess.com profile");
    return null;
  }
}

interface ChessComArchive {
  archives: string[];
}

interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

interface ChessComMonthGames {
  games: ChessComGame[];
}

export async function fetchChessComGames(
  username: string,
  months: number = 3
): Promise<ChessComGame[]> {
  const archivesUrl = `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`;

  const archivesRes = await fetch(archivesUrl, {
    headers: { "User-Agent": "ChessCoach/1.0" },
  });

  if (!archivesRes.ok) {
    throw new Error(`chess.com API error: ${archivesRes.status} for user ${username}`);
  }

  const archivesData = (await archivesRes.json()) as ChessComArchive;
  const allArchives = archivesData.archives || [];

  const recentArchives = allArchives.slice(-Math.max(1, months));

  const allGames: ChessComGame[] = [];

  for (const archiveUrl of recentArchives) {
    try {
      const gamesRes = await fetch(archiveUrl, {
        headers: { "User-Agent": "ChessCoach/1.0" },
      });
      if (!gamesRes.ok) continue;

      const gamesData = (await gamesRes.json()) as ChessComMonthGames;
      allGames.push(...(gamesData.games || []));
    } catch (err) {
      logger.warn({ err, archiveUrl }, "Failed to fetch archive");
    }
  }

  return allGames;
}

export function extractGameMetadata(game: ChessComGame, username: string) {
  const white = game.white;
  const black = game.black;

  let result = "draw";
  const userIsWhite = white.username.toLowerCase() === username.toLowerCase();
  const userResult = userIsWhite ? white.result : black.result;

  if (userResult === "win") {
    result = "win";
  } else if (
    ["checkmated", "timeout", "resigned", "abandoned", "lose"].includes(userResult)
  ) {
    result = "loss";
  } else {
    result = userResult || "draw";
  }

  const { opening, eco } = extractOpeningFromPgn(game.pgn);

  return {
    whiteUsername: white.username,
    blackUsername: black.username,
    whiteRating: white.rating || 0,
    blackRating: black.rating || 0,
    result,
    timeControl: game.time_control,
    opening,
    eco,
    playedAt: new Date(game.end_time * 1000),
    url: game.url,
    chesscomGameId: game.url?.split("/").pop() || null,
  };
}

export function extractOpeningFromPgn(pgn: string): { opening: string | null; eco: string | null } {
  if (!pgn) return { opening: null, eco: null };

  const ecoMatch = pgn.match(/\[ECO "([^"]+)"\]/);

  // Try explicit [Opening "..."] tag first
  const openingMatch = pgn.match(/\[Opening "([^"]+)"\]/);
  if (openingMatch) {
    return { eco: ecoMatch ? ecoMatch[1] : null, opening: openingMatch[1] };
  }

  // Fall back to [ECOUrl "https://www.chess.com/openings/Opening-Name-Here"]
  const ecoUrlMatch = pgn.match(/\[ECOUrl "https:\/\/www\.chess\.com\/openings\/([^"]+)"\]/);
  if (ecoUrlMatch) {
    // Convert URL slug to readable name: "Nimzo-Indian-Defense-Bishop-Attack" → "Nimzo Indian Defense Bishop Attack"
    const opening = ecoUrlMatch[1]
      .replace(/-%2B-/g, '+ ')
      .replace(/%2B/g, '+')
      .replace(/-/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return { eco: ecoMatch ? ecoMatch[1] : null, opening: opening || null };
  }

  return { eco: ecoMatch ? ecoMatch[1] : null, opening: null };
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parsePgnMoves(pgn: string): Array<{
  moveNumber: number;
  san: string;
  color: string;
  from: string;
  to: string;
  fenBefore: string;
  fen: string | null;      // fenAfter (kept for backward compat)
  comment: string | null;
  clockSeconds: number | null;
  classification: string | null;
}> {
  if (!pgn) return [];

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    // Extract comments in order from the PGN move section
    const moveSection = pgn.replace(/\[.*?\]\n?/gs, "").trim();
    const comments = [...moveSection.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

    // Replay from the start to collect fenBefore for each move
    const replayChess = new Chess();
    const fensBefore: string[] = [START_FEN];
    for (const move of history) {
      replayChess.move(move.san);
      fensBefore.push(replayChess.fen());
    }

    return history.map((move, idx) => {
      const rawComment = comments[idx] ?? null;

      let clockSeconds: number | null = null;
      if (rawComment) {
        const m = rawComment.match(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/);
        if (m) {
          clockSeconds =
            parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        }
      }

      return {
        moveNumber: Math.ceil((idx + 1) / 2),
        san: move.san,
        color: move.color === "w" ? "white" : "black",
        from: move.from,
        to: move.to,
        fenBefore: fensBefore[idx] ?? START_FEN,
        fen: move.after,
        comment: rawComment,
        clockSeconds,
        classification: null,
      };
    });
  } catch (err) {
    logger.error({ err }, "Failed to parse PGN moves with chess.js");
    return [];
  }
}
