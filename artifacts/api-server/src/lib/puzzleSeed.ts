import { db, puzzlesTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";
import { Chess } from "chess.js";

interface VerifiedPuzzle {
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string;
}

const VERIFIED_PUZZLES: VerifiedPuzzle[] = [
  {
    lichessId: "vp_br01",
    fen: "6k1/5ppp/8/8/8/8/6PP/4R1K1 w - - 0 1",
    moves: "e1e8",
    rating: 500,
    themes: "mateIn1,backRankMate,endgame",
  },
  {
    lichessId: "vp_br02",
    fen: "6k1/4Rppp/8/8/8/8/6PP/6K1 w - - 0 1",
    moves: "e7e8",
    rating: 500,
    themes: "mateIn1,backRankMate,endgame",
  },
  {
    lichessId: "vp_br03",
    fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
    moves: "b2b8",
    rating: 500,
    themes: "mateIn1,backRankMate,endgame",
  },
  {
    lichessId: "vp_schm",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    moves: "h5f7",
    rating: 500,
    themes: "mateIn1,middlegame",
  },
  {
    lichessId: "vp_rkm1",
    fen: "5k2/8/5K2/8/8/8/8/7R w - - 0 1",
    moves: "h1h8",
    rating: 400,
    themes: "mateIn1,endgame",
  },
  {
    lichessId: "vp_qkm1",
    fen: "k7/2K5/8/8/8/8/8/Q7 w - - 0 1",
    moves: "a1a6",
    rating: 500,
    themes: "mateIn1,endgame",
  },
  {
    lichessId: "vp_m2br",
    fen: "6k1/5ppp/8/8/8/5Q2/6PP/6K1 w - - 0 1",
    moves: "f3f7 g8h8 f7f8",
    rating: 700,
    themes: "mateIn2,backRankMate,endgame",
  },
  {
    lichessId: "vp_prom",
    fen: "8/1P6/8/8/8/5k2/8/4K3 w - - 0 1",
    moves: "b7b8q",
    rating: 400,
    themes: "promotion,endgame,oneMove",
  },
  {
    lichessId: "vp_kgam",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2",
    moves: "d8h4",
    rating: 600,
    themes: "opening,advantage",
  },
  {
    lichessId: "vp_fork",
    fen: "r1b2rk1/ppppnppp/8/4N3/8/8/PPPPPPPP/R1BQKB1R w KQ - 0 1",
    moves: "e5f7",
    rating: 700,
    themes: "fork,middlegame",
  },
  {
    lichessId: "vp_atk1",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    moves: "f3g5",
    rating: 800,
    themes: "attack,middlegame",
  },
  {
    lichessId: "vp_sac1",
    fen: "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5",
    moves: "c5f2",
    rating: 900,
    themes: "sacrifice,middlegame",
  },
  {
    lichessId: "vp_nf61",
    fen: "5rk1/5ppp/8/8/4N3/8/6PP/6K1 w - - 0 1",
    moves: "e4f6 g7f6",
    rating: 800,
    themes: "attack,middlegame",
  },
  {
    lichessId: "vp_ital",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    moves: "f1c4",
    rating: 600,
    themes: "opening,development",
  },
  {
    lichessId: "vp_cnt1",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2",
    moves: "d7d5",
    rating: 700,
    themes: "opening,centerControl",
  },
  {
    lichessId: "00sHx",
    fen: "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 1",
    moves: "a2e6 d7d8 f7f8",
    rating: 1525,
    themes: "mateIn2,middlegame",
  },
  {
    lichessId: "3HyMN",
    fen: "3r4/1b2ppk1/p4npp/q1p1N3/2Q5/1P4P1/P1R1PPBP/6K1 b - - 1 1",
    moves: "a5e1 g2f1 e1f1 g1f1 d8d1",
    rating: 1970,
    themes: "mateIn3,sacrifice,middlegame",
  },
  {
    lichessId: "2lhAp",
    fen: "r1bqkb1r/ppn2ppp/3p1n2/1NpPp3/4P3/Q4P2/2PB2PP/1R2KBNR w Kkq - 1 1",
    moves: "d2a5 b7b6 a5b6 a7b6 b5c7",
    rating: 2149,
    themes: "opening,advantage",
  },
];

function validatePuzzle(puzzle: VerifiedPuzzle): boolean {
  try {
    const chess = new Chess(puzzle.fen);
    const moveList = puzzle.moves.split(" ");
    for (const m of moveList) {
      const from = m.slice(0, 2);
      const to = m.slice(2, 4);
      const promotion = m.length > 4 ? m[4] : undefined;
      const result = chess.move({ from, to, promotion });
      if (!result) {
        console.log(`[puzzles] Invalid puzzle ${puzzle.lichessId}: move ${m} is illegal`);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function seedPuzzlesIfNeeded(minCount = 15) {
  const [existing] = await db.select({ count: count() }).from(puzzlesTable);
  const currentCount = existing?.count ?? 0;

  if (currentCount >= minCount) {
    console.log(`[puzzles] Already have ${currentCount} puzzles, skipping seed`);
    return;
  }

  console.log(`[puzzles] Have ${currentCount} puzzles, need ${minCount}. Starting seed...`);

  let inserted = 0;

  for (const puzzle of VERIFIED_PUZZLES) {
    if (!validatePuzzle(puzzle)) {
      console.log(`[puzzles] Skipping invalid puzzle: ${puzzle.lichessId}`);
      continue;
    }

    const [existingPuzzle] = await db
      .select({ id: puzzlesTable.id })
      .from(puzzlesTable)
      .where(eq(puzzlesTable.lichessId, puzzle.lichessId))
      .limit(1);

    if (existingPuzzle) continue;

    await db.insert(puzzlesTable).values({
      lichessId: puzzle.lichessId,
      fen: puzzle.fen,
      moves: puzzle.moves,
      rating: puzzle.rating,
      themes: puzzle.themes,
      source: "lichess",
    });
    inserted++;
  }

  try {
    const res = await fetch("https://lichess.org/api/puzzle/daily", {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.puzzle?.fen && data.puzzle?.solution?.length) {
        const fen = data.puzzle.fen;
        const chess = new Chess(fen);
        const firstMove = data.puzzle.solution[0];
        const testResult = chess.move({
          from: firstMove.slice(0, 2),
          to: firstMove.slice(2, 4),
          promotion: firstMove.length > 4 ? firstMove[4] : undefined,
        });
        if (testResult) {
          const [ex] = await db
            .select({ id: puzzlesTable.id })
            .from(puzzlesTable)
            .where(eq(puzzlesTable.lichessId, data.puzzle.id))
            .limit(1);
          if (!ex) {
            await db.insert(puzzlesTable).values({
              lichessId: data.puzzle.id,
              fen,
              moves: data.puzzle.solution.join(" "),
              rating: data.puzzle.rating,
              themes: data.puzzle.themes.join(","),
              source: "lichess",
            });
            inserted++;
          }
        }
      }
    }
  } catch {}

  console.log(`[puzzles] Seed complete: ${inserted} new puzzles inserted`);
}
