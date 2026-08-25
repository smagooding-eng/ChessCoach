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

export interface LeaderboardPlayer {
  username: string;
  rating: number;
  rank: number;
}

// Real, live top players from Chess.com's public leaderboard -- not a
// hardcoded list, since names/ratings would go stale immediately and I'd
// have no way to verify them were accurate to begin with. Refreshes
// every 5 minutes per Chess.com's own API notes, so caching briefly here
// is reasonable rather than hitting it on every single page load.
let leaderboardCache: { players: LeaderboardPlayer[]; fetchedAt: number } | null = null;
const LEADERBOARD_CACHE_MS = 5 * 60 * 1000;

export async function fetchChessComTopPlayers(limit: number = 25): Promise<LeaderboardPlayer[]> {
  if (leaderboardCache && Date.now() - leaderboardCache.fetchedAt < LEADERBOARD_CACHE_MS) {
    return leaderboardCache.players.slice(0, limit);
  }
  try {
    const res = await fetch("https://api.chess.com/pub/leaderboards", {
      headers: { "User-Agent": "ChessCoach/1.0" },
    });
    if (!res.ok) return leaderboardCache?.players.slice(0, limit) ?? [];
    const data = await res.json();
    const raw = data.live_rapid ?? data.live_blitz ?? [];
    const players: LeaderboardPlayer[] = raw
      .slice(0, 25)
      .map((p: any) => ({ username: p.username, rating: p.score, rank: p.rank }));
    leaderboardCache = { players, fetchedAt: Date.now() };
    return players.slice(0, limit);
  } catch {
    return leaderboardCache?.players.slice(0, limit) ?? [];
  }
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
  rules: string;
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

export function normalizeFen(fen: string): string {
  if (!fen) return fen;
  const parts = fen.split(' ');
  if (parts.length < 3) return fen;
  const castling = parts[2];
  if (!castling || castling === '-' || /^[KQkq]+$/.test(castling)) return fen;
  if (!/^[A-Ha-h]+$/.test(castling)) return fen;

  const ranks = parts[0].split('/');
  const whiteBack = ranks[7] || '';
  const blackBack = ranks[0] || '';

  function findKingFile(rank: string): number {
    let file = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') { file += parseInt(ch); }
      else { if (ch === 'K' || ch === 'k') return file; file++; }
    }
    return -1;
  }

  const wKingFile = findKingFile(whiteBack);
  const bKingFile = findKingFile(blackBack);

  let result = '';
  for (const ch of castling) {
    const file = ch.toLowerCase().charCodeAt(0) - 97;
    if (ch >= 'A' && ch <= 'H') {
      result += file > wKingFile ? 'K' : 'Q';
    } else {
      result += file > bKingFile ? 'k' : 'q';
    }
  }

  const arr = result.split('');
  arr.sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b));
  parts[2] = arr.join('');
  return parts.join(' ');
}

export function extractStartFen(pgn: string): string {
  const fenMatch = pgn.match(/\[FEN "([^"]+)"\]/);
  return fenMatch ? normalizeFen(fenMatch[1]) : START_FEN;
}

function isChess960Pgn(pgn: string): boolean {
  return /\[Variant\s+"Chess960"\]/i.test(pgn) || /\[Event\s+"[^"]*960[^"]*"\]/i.test(pgn);
}

function extractSanTokens(pgn: string): { san: string; comment: string | null }[] {
  const moveSection = pgn.replace(/\[.*?\]\n?/gs, "").trim();
  const tokens: { san: string; comment: string | null }[] = [];
  const regex = /(\d+\.+\s*)?([A-Za-z0-9+#=\-]+(?:\s*\{[^}]*\})?)/g;
  let m;
  while ((m = regex.exec(moveSection)) !== null) {
    const raw = m[2];
    const sanPart = raw.replace(/\s*\{[^}]*\}/, "").trim();
    if (!sanPart || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(sanPart)) continue;
    const commentMatch = raw.match(/\{([^}]*)\}/);
    tokens.push({ san: sanPart, comment: commentMatch ? commentMatch[1] : null });
  }
  return tokens;
}

function findPieceSquares(fen: string, piece: string): string[] {
  const board = fen.split(" ")[0];
  const ranks = board.split("/");
  const squares: string[] = [];
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") { file += parseInt(ch); }
      else {
        if (ch === piece) squares.push(String.fromCharCode(97 + file) + (8 - r));
        file++;
      }
    }
  }
  return squares;
}

function applyManualCastle(fen: string, isKingside: boolean): { newFen: string; from: string; to: string } | null {
  const parts = fen.split(" ");
  const color = parts[1];
  const rank = color === "w" ? "1" : "8";
  const kingPiece = color === "w" ? "K" : "k";
  const rookPiece = color === "w" ? "R" : "r";

  const kingSquares = findPieceSquares(fen, kingPiece);
  const rookSquares = findPieceSquares(fen, rookPiece).filter(s => s[1] === rank);

  if (kingSquares.length !== 1) return null;
  const kingSq = kingSquares[0];
  const kingFile = kingSq.charCodeAt(0) - 97;

  const targetRook = isKingside
    ? rookSquares.filter(s => (s.charCodeAt(0) - 97) > kingFile).sort()[0]
    : rookSquares.filter(s => (s.charCodeAt(0) - 97) < kingFile).sort().reverse()[0];

  if (!targetRook) return null;

  const kingDest = isKingside ? `g${rank}` : `c${rank}`;
  const rookDest = isKingside ? `f${rank}` : `d${rank}`;

  const board = parts[0].split("/");
  const rankIdx = color === "w" ? 7 : 0;
  let rankChars: string[] = [];
  for (const ch of board[rankIdx]) {
    if (ch >= "1" && ch <= "8") {
      for (let i = 0; i < parseInt(ch); i++) rankChars.push(".");
    } else {
      rankChars.push(ch);
    }
  }

  const rookFile = targetRook.charCodeAt(0) - 97;
  rankChars[kingFile] = ".";
  rankChars[rookFile] = ".";
  const kDestFile = kingDest.charCodeAt(0) - 97;
  const rDestFile = rookDest.charCodeAt(0) - 97;
  rankChars[kDestFile] = kingPiece;
  rankChars[rDestFile] = rookPiece;

  let compacted = "";
  let empties = 0;
  for (const ch of rankChars) {
    if (ch === ".") { empties++; }
    else { if (empties > 0) { compacted += empties; empties = 0; } compacted += ch; }
  }
  if (empties > 0) compacted += empties;
  board[rankIdx] = compacted;

  let castling = parts[2];
  if (color === "w") {
    castling = castling.replace(/[KQ]/g, "");
  } else {
    castling = castling.replace(/[kq]/g, "");
  }
  if (!castling) castling = "-";
  parts[2] = castling;

  parts[3] = "-";
  parts[0] = board.join("/");
  if (color === "w") { parts[1] = "b"; } else { parts[1] = "w"; parts[5] = String(parseInt(parts[5]) + 1); }
  parts[4] = "0";

  return { newFen: parts.join(" "), from: kingSq, to: kingDest };
}

export function parsePgnMoves(pgn: string): Array<{
  moveNumber: number;
  san: string;
  color: string;
  from: string;
  to: string;
  fenBefore: string;
  fen: string | null;
  comment: string | null;
  clockSeconds: number | null;
  classification: string | null;
}> {
  if (!pgn) return [];

  try {
    const startFen = extractStartFen(pgn);
    const normalizedPgn = pgn.replace(/\[FEN "([^"]+)"\]/, (_, fen: string) => `[FEN "${normalizeFen(fen)}"]`);
    const chess = new Chess(startFen);
    chess.loadPgn(normalizedPgn);
    const history = chess.history({ verbose: true });

    const moveSection = pgn.replace(/\[.*?\]\n?/gs, "").trim();
    const comments = [...moveSection.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

    const replayChess = new Chess(startFen);
    const fensBefore: string[] = [startFen];
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
  } catch {
    if (!isChess960Pgn(pgn)) {
      logger.error("Failed to parse PGN moves with chess.js (non-960)");
      return [];
    }
  }

  try {
    const startFen = extractStartFen(pgn);
    const tokens = extractSanTokens(pgn);
    const results: Array<{
      moveNumber: number; san: string; color: string; from: string; to: string;
      fenBefore: string; fen: string | null; comment: string | null;
      clockSeconds: number | null; classification: string | null;
    }> = [];

    let currentFen = startFen;
    let moveIdx = 0;

    for (const token of tokens) {
      const fenBefore = currentFen;
      const color = currentFen.split(" ")[1] === "w" ? "white" : "black";

      let from = "", to = "", fenAfter = "";

      const sanBase = token.san.replace(/[+#?!]+$/, "");
      if (sanBase === "O-O" || sanBase === "O-O-O") {
        const isKingside = sanBase === "O-O";
        const castleResult = applyManualCastle(currentFen, isKingside);
        if (!castleResult) {
          logger.warn({ san: token.san, fen: currentFen }, "Chess960 castling failed");
          break;
        }
        from = castleResult.from;
        to = castleResult.to;
        fenAfter = castleResult.newFen;
      } else {
        try {
          const chess = new Chess(currentFen);
          const move = chess.move(token.san);
          if (!move) break;
          from = move.from;
          to = move.to;
          fenAfter = chess.fen();
        } catch {
          logger.warn({ san: token.san, fen: currentFen }, "Chess960 move failed");
          break;
        }
      }

      let clockSeconds: number | null = null;
      if (token.comment) {
        const m = token.comment.match(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/);
        if (m) clockSeconds = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
      }

      results.push({
        moveNumber: Math.ceil((moveIdx + 1) / 2),
        san: token.san,
        color,
        from,
        to,
        fenBefore,
        fen: fenAfter,
        comment: token.comment,
        clockSeconds,
        classification: null,
      });

      currentFen = fenAfter;
      moveIdx++;
    }

    logger.info({ moveCount: results.length }, "Parsed Chess960 PGN with fallback parser");
    return results;
  } catch (err) {
    logger.error({ err }, "Failed to parse Chess960 PGN with fallback parser");
    return [];
  }
}
