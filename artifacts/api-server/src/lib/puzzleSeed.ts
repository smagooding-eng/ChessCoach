import { db, puzzlesTable } from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";
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
    lichessId: "tac_open1",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    moves: "e7e5 g1f3 b8c6",
    rating: 450,
    themes: "opening,development",
  },
  {
    lichessId: "tac_center",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2",
    moves: "d7d5 e4d5 d8d5",
    rating: 500,
    themes: "opening,centerControl",
  },
  {
    lichessId: "tac_recap",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
    moves: "e5d4 f3d4 f8c5",
    rating: 550,
    themes: "opening,recapture",
  },
  {
    lichessId: "tac_nfork",
    fen: "r1bqk2r/pppp1Npp/2n2n2/2b1p3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5",
    moves: "d8e7 f7h8",
    rating: 600,
    themes: "fork,middlegame",
  },
  {
    lichessId: "vp_kgam",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2",
    moves: "d8h4",
    rating: 600,
    themes: "opening,advantage",
  },
  {
    lichessId: "tac_disc",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/2N5/PPPP1PPP/R1B1KBNR w KQkq - 2 3",
    moves: "h5e5 d8e7 e5e7",
    rating: 650,
    themes: "discoveredAttack,middlegame",
  },
  {
    lichessId: "tac_legall",
    fen: "r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
    moves: "c4f7 e8e7 d2d4",
    rating: 700,
    themes: "sacrifice,opening",
  },
  {
    lichessId: "tac_pin",
    fen: "r2qkb1r/pp2pppp/2n2n2/3p1b2/3P4/2N2N2/PPP1BPPP/R1BQK2R w KQkq - 4 6",
    moves: "f3e5 c6e5 d4e5",
    rating: 700,
    themes: "exchange,middlegame",
  },
  {
    lichessId: "tac_break",
    fen: "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 6",
    moves: "f1b5 c5d4 e3d4",
    rating: 750,
    themes: "opening,development",
  },
  {
    lichessId: "tac_italian",
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    moves: "f3g5 d7d5 e4d5",
    rating: 800,
    themes: "attack,opening",
  },
  {
    lichessId: "tac_pstorm",
    fen: "r4rk1/pp1qppbp/2np1np1/2p5/4PP2/2NP1NP1/PPP1Q1BP/R1B2RK1 w - - 0 10",
    moves: "e4e5 d6e5 f3e5",
    rating: 800,
    themes: "attack,middlegame",
  },
  {
    lichessId: "tac_reopen",
    fen: "r3k2r/ppp1bppp/2n1bn2/3pp3/4P3/1BN2N2/PPPP1PPP/R1BQ1RK1 w kq - 0 6",
    moves: "e4d5 e6d5 f1e1",
    rating: 850,
    themes: "pin,opening",
  },
  {
    lichessId: "tac_bpair",
    fen: "rn1qkbnr/pbpp1ppp/1p6/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
    moves: "c4f7 e8f7 f3e5",
    rating: 900,
    themes: "sacrifice,attack,opening",
  },
  {
    lichessId: "tac_knight",
    fen: "r1bq1rk1/ppp2ppp/2n1pn2/3pN3/3P1B2/2N5/PPP2PPP/R2QKB1R b KQ - 3 7",
    moves: "c6e5 f4e5 f6e4",
    rating: 900,
    themes: "exchange,middlegame",
  },
  {
    lichessId: "vp_sac1",
    fen: "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5",
    moves: "c5f2",
    rating: 900,
    themes: "sacrifice,middlegame",
  },
  {
    lichessId: "tac_exch",
    fen: "r1b2rk1/2q1bppp/p2p1n2/np2p3/3PP3/2N1BN1P/PPBQ1PP1/R4RK1 w - - 0 13",
    moves: "d4e5 d6e5 d2d8 f8d8 f1d1",
    rating: 1100,
    themes: "exchange,middlegame",
  },
  {
    lichessId: "00sHx",
    fen: "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 1",
    moves: "a2e6 d7d8 f7f8",
    rating: 1525,
    themes: "mateIn2,middlegame",
  },
  {
    lichessId: "00008",
    fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2b1/PqP3PP/7K w - - 0 1",
    moves: "e6e7 b2b1 b3c1 b1c1 h6c1",
    rating: 1929,
    themes: "middlegame,crushing,hangingPiece",
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
  {
    lichessId: "0000D",
    fen: "5rk1/1p3ppp/pq1Q1b2/8/8/1P3N2/P4PPP/3R2K1 b - - 1 1",
    moves: "f8d8 d6d8 f6d8",
    rating: 1590,
    themes: "endgame,advantage",
  },
  {
    lichessId: "vp_schm",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    moves: "h5f7",
    rating: 500,
    themes: "mateIn1,middlegame",
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

  const { verifyPuzzle } = await import("./puzzleVerifier");
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

    // Engine-verify hand-curated seeds too — same gate as generation.
    const verdict = await verifyPuzzle(puzzle.fen, puzzle.moves.split(" "), {
      claims: { themes: puzzle.themes.split(",").map(s => s.trim()).filter(Boolean) },
    });
    if (!verdict.ok) {
      console.log(`[puzzles] Seed rejected ${puzzle.lichessId}: ${verdict.reasons.join("; ")}`);
      continue;
    }

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
      const data: any = await res.json();
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
            const dailyVerdict = await verifyPuzzle(fen, data.puzzle.solution, {
              claims: { themes: Array.isArray(data.puzzle.themes) ? data.puzzle.themes : [] },
            });
            if (dailyVerdict.ok) {
              await db.insert(puzzlesTable).values({
                lichessId: data.puzzle.id,
                fen,
                moves: data.puzzle.solution.join(" "),
                rating: data.puzzle.rating,
                themes: data.puzzle.themes.join(","),
                source: "lichess",
              });
              inserted++;
            } else {
              console.log(`[puzzles] Daily puzzle rejected: ${dailyVerdict.reasons.join("; ")}`);
            }
          }
        }
      }
    }
  } catch {}

  console.log(`[puzzles] Seed complete: ${inserted} new puzzles inserted`);
}

export async function generatePuzzleExplanation(puzzle: { fen: string; moves: string; themes: string | null; rating: number }): Promise<string | null> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const solutionMoves = puzzle.moves.split(" ");
    const themes = puzzle.themes?.split(",").filter(Boolean) ?? [];

    const chess = new Chess(puzzle.fen);
    const sanMoves: string[] = [];
    for (const uci of solutionMoves) {
      try {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        const m = chess.move({ from, to, promotion: promo });
        if (m) sanMoves.push(m.san);
      } catch { break; }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: "You are a chess coach. Give a brief, clear explanation (2-3 sentences max) of why the puzzle solution moves are the best. Focus on the tactical or strategic idea. Use plain language suitable for intermediate players. Do not repeat the moves, just explain the idea.",
        },
        {
          role: "user",
          content: `Position (FEN): ${puzzle.fen}\nSolution moves: ${sanMoves.join(", ")}\nThemes: ${themes.join(", ")}\nRating: ${puzzle.rating}\n\nExplain briefly why these moves are best.`,
        },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err: any) {
    console.error("[puzzles] Explanation generation error:", err?.message ?? err);
    return null;
  }
}

export async function preGenerateExplanations() {
  const puzzles = await db
    .select()
    .from(puzzlesTable)
    .where(sql`${puzzlesTable.explanation} IS NULL`);

  if (puzzles.length === 0) {
    console.log("[puzzles] All explanations already generated");
    return;
  }

  console.log(`[puzzles] Generating explanations for ${puzzles.length} puzzles...`);
  let generated = 0;

  for (const puzzle of puzzles) {
    const explanation = await generatePuzzleExplanation(puzzle);
    if (explanation) {
      await db.update(puzzlesTable).set({ explanation }).where(eq(puzzlesTable.id, puzzle.id));
      generated++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[puzzles] Generated ${generated}/${puzzles.length} explanations`);
}
