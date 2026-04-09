import { db, puzzlesTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";
import { Chess } from "chess.js";

interface LichessPuzzleResponse {
  game: { pgn: string };
  puzzle: {
    id: string;
    initialPly: number;
    plays: number;
    rating: number;
    solution: string[];
    themes: string[];
  };
}

function pgnToFen(pgn: string, ply: number): string | null {
  try {
    const chess = new Chess();
    const moves = pgn.split(/\s+/).filter(m => !m.match(/^\d+\./) && m.length > 0);
    for (let i = 0; i < ply && i < moves.length; i++) {
      const result = chess.move(moves[i]);
      if (!result) return null;
    }
    return chess.fen();
  } catch {
    return null;
  }
}

async function fetchPuzzle(id: string): Promise<LichessPuzzleResponse | null> {
  try {
    const res = await fetch(`https://lichess.org/api/puzzle/${id}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function seedPuzzlesIfNeeded(minCount = 200) {
  const [existing] = await db.select({ count: count() }).from(puzzlesTable);
  const currentCount = existing?.count ?? 0;

  if (currentCount >= minCount) {
    console.log(`[puzzles] Already have ${currentCount} puzzles, skipping seed`);
    return;
  }

  console.log(`[puzzles] Have ${currentCount} puzzles, need ${minCount}. Starting seed...`);

  let inserted = 0;
  const needed = minCount - currentCount;

  for (let batch = 0; batch < needed * 3 && inserted < needed; batch++) {
    const data = await fetchPuzzle("daily");
    if (!data) {
      await delay(5000);
      continue;
    }

    const fen = pgnToFen(data.game.pgn, data.puzzle.initialPly);
    if (!fen) continue;

    const existingPuzzle = await db
      .select({ id: puzzlesTable.id })
      .from(puzzlesTable)
      .where(eq(puzzlesTable.lichessId, data.puzzle.id))
      .limit(1);

    if (existingPuzzle.length === 0) {
      await db.insert(puzzlesTable).values({
        lichessId: data.puzzle.id,
        fen,
        moves: data.puzzle.solution.join(" "),
        rating: data.puzzle.rating,
        themes: data.puzzle.themes.join(","),
        source: "lichess",
      });
      inserted++;
      if (inserted % 10 === 0) console.log(`[puzzles] Seeded ${inserted}/${needed}`);
    }

    await delay(500);
  }

  console.log(`[puzzles] Seed complete: ${inserted} new puzzles inserted`);
}
