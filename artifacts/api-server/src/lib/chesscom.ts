import { logger } from "./logger";

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

function extractOpeningFromPgn(pgn: string): { opening: string | null; eco: string | null } {
  if (!pgn) return { opening: null, eco: null };

  const ecoMatch = pgn.match(/\[ECO "([^"]+)"\]/);
  const openingMatch = pgn.match(/\[Opening "([^"]+)"\]/);

  return {
    eco: ecoMatch ? ecoMatch[1] : null,
    opening: openingMatch ? openingMatch[1] : null,
  };
}

export function parsePgnMoves(pgn: string): Array<{
  moveNumber: number;
  san: string;
  color: string;
  fen: string | null;
  comment: string | null;
}> {
  if (!pgn) return [];

  const moveSection = pgn.replace(/\[.*?\]\s*/gs, "").trim();

  const moves: Array<{
    moveNumber: number;
    san: string;
    color: string;
    fen: string | null;
    comment: string | null;
  }> = [];

  const tokens = moveSection
    .replace(/\{[^}]*\}/g, "")
    .replace(/\d+\./g, " $& ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  let currentMoveNum = 0;
  let isWhiteTurn = true;

  for (const token of tokens) {
    if (/^\d+\.$/.test(token)) {
      currentMoveNum = parseInt(token);
      isWhiteTurn = true;
      continue;
    }

    if (/^\d+\.\.\.$/.test(token)) {
      isWhiteTurn = false;
      continue;
    }

    if (["1-0", "0-1", "1/2-1/2", "*"].includes(token)) continue;

    if (/^[a-zA-Z]/.test(token) || token.startsWith("O")) {
      moves.push({
        moveNumber: currentMoveNum,
        san: token,
        color: isWhiteTurn ? "white" : "black",
        fen: null,
        comment: null,
      });
      if (!isWhiteTurn) {
        // after black's move, next will be white
        isWhiteTurn = true;
      } else {
        isWhiteTurn = false;
      }
    }
  }

  return moves;
}
