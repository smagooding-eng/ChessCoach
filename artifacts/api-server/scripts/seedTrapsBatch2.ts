// Second batch seed script for Chess Traps Training -- 10 newly
// verified traps. Kept separate from seedTraps.ts so running this
// doesn't duplicate Scholar's Mate / Légal Trap, which are already seeded.
// Run with: DATABASE_URL="..." npx tsx scripts/seedTrapsBatch2.ts

import { db, chessTrapsTable } from "@workspace/db";

async function main() {
  await db.insert(chessTrapsTable).values({
    name: "Fried Liver Attack",
    category: "Two Knights Defense",
    difficulty: "intermediate",
    trapSide: "white",
    summary: "A real knight sacrifice on f7 that drags Black's king into the open.",
    explanation:
      "After Black develops naturally into the Two Knights Defense and recaptures " +
      "on d5 with the knight, that knight is undefended and pinned to the king's " +
      "path. White sacrifices a knight on f7 to force the king out, then hits it " +
      "with a check that also attacks the wandering knight — White never regains " +
      "full material but gets a ferocious, long-lasting attack. The safer path " +
      "for Black is recapturing with the other knight instead, sidestepping the " +
      "whole sacrifice.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7", "Kxf7", "Qf3+", "Ke6", "Nc3"],
    criticalMoveIndex: 9,
    safeMovesSan: ["Na5"],
    orderIndex: 2,
  });

  await db.insert(chessTrapsTable).values({
    name: "Englund Gambit Trap",
    category: "Queen's Pawn Opening",
    difficulty: "beginner",
    trapSide: "black",
    summary: "Black offers a check and a pawn grab — the natural reply loses outright.",
    explanation:
      "Black's queen checks and grabs the b2-pawn, looking greedy and exposed. " +
      "The natural try to win the queen back, Bc3, is actually a losing blunder: " +
      "Black pins the bishop, and after the forced sequence White's own pieces " +
      "block the king in for checkmate. The safe path for White is developing " +
      "the knight to c3 instead, which defends everything calmly.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["d4", "e5", "dxe5", "Nc6", "Nf3", "Qe7", "Bf4", "Qb4+", "Bd2", "Qxb2", "Bc3", "Bb4", "Qd2", "Bxc3", "Qxc3", "Qc1#"],
    criticalMoveIndex: 10,
    safeMovesSan: ["Nc3"],
    orderIndex: 3,
  });

  await db.insert(chessTrapsTable).values({
    name: "Blackburne Shilling Gambit",
    category: "Italian Game",
    difficulty: "beginner",
    trapSide: "black",
    summary: "Black dangles a 'free' pawn — grab it and walk into a smothered mate in 7.",
    explanation:
      "Black's knight move looks like it just hangs the e5-pawn for nothing. " +
      "It's bait. If White greedily grabs it, Black's queen swings out with a " +
      "double attack, and the forced sequence ends in a smothered mate — White's " +
      "own pieces trap the king so a single knight can deliver checkmate. The " +
      "safe response is simply not taking the pawn: capturing the knight on d4 " +
      "instead keeps White clearly better.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
    criticalMoveIndex: 6,
    safeMovesSan: ["Nxd4"],
    orderIndex: 4,
  });

  await db.insert(chessTrapsTable).values({
    name: "Siberian Trap",
    category: "Sicilian Defense",
    difficulty: "intermediate",
    trapSide: "black",
    summary: "A natural pawn push to kick a knight actually loses the queen.",
    explanation:
      "Black's knight lands on g4, looking like it can simply be kicked back " +
      "with h3. But the point of Black's setup is a hidden threat on h2 — " +
      "White's own knight on f3 is the only thing stopping mate there, and " +
      "kicking with h3 removes it from the defense at the worst moment. Black's " +
      "follow-up knight jump either wins the queen outright or delivers mate. " +
      "The safe path is developing with Nb5 instead, sidestepping the whole trap.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "c5", "d4", "cxd4", "c3", "dxc3", "Nxc3", "Nc6", "Nf3", "e6", "Bc4", "Qc7", "O-O", "Nf6", "Qe2", "Ng4", "h3", "Nd4"],
    criticalMoveIndex: 16,
    safeMovesSan: ["Nb5"],
    orderIndex: 5,
  });

  await db.insert(chessTrapsTable).values({
    name: "Lasker Trap",
    category: "Queen's Gambit",
    difficulty: "advanced",
    trapSide: "black",
    summary: "A rare underpromotion on move seven wins material after a natural blunder.",
    explanation:
      "Black's pawn structure looks like it's simply falling apart, and White's " +
      "natural try to win the bishop back looks completely safe. It isn't: " +
      "Black's pawn crashes through to f2 with check, and after the king is " +
      "forced out, an underpromotion to a knight (not a queen!) both checks the " +
      "king and sets up a skewer that wins the queen next move. The safe path " +
      "for White is accepting slightly worse doubled pawns instead of grabbing " +
      "the bishop.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["d4", "d5", "c4", "e5", "dxe5", "d4", "e3", "Bb4+", "Bd2", "dxe3", "Bxb4", "exf2+", "Ke2", "fxg1=N+", "Ke1", "Qh4+", "Kd2"],
    criticalMoveIndex: 10,
    safeMovesSan: ["fxe3"],
    orderIndex: 6,
  });

  await db.insert(chessTrapsTable).values({
    name: "Elephant Trap",
    category: "Queen's Gambit Declined",
    difficulty: "intermediate",
    trapSide: "black",
    summary: "An 'undefended' pawn looks free to grab — it isn't.",
    explanation:
      "Black's knight on f6 looks pinned to the queen, making the d5-pawn look " +
      "like a free capture. It's a trap: after White grabs the pawn, Black " +
      "recaptures with the 'pinned' knight anyway, and the pin turns out not to " +
      "matter because White's queen gets trapped a few moves later, netting " +
      "Black a full piece. The safe path is simply not taking on d5 at all — " +
      "normal development keeps the position balanced.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Nbd7", "cxd5", "exd5", "Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2", "Kxd8"],
    criticalMoveIndex: 10,
    safeMovesSan: ["e3"],
    orderIndex: 7,
  });

  await db.insert(chessTrapsTable).values({
    name: "Damiano Defense Trap",
    category: "King's Pawn Opening",
    difficulty: "beginner",
    trapSide: "white",
    summary: "A pawn move that looks like it defends e5 actually loses material fast.",
    explanation:
      "Black's f6 looks like it protects the e5-pawn, but it does the opposite " +
      "— it weakens the king's diagonal badly. White sacrifices a knight on e5, " +
      "and if Black recaptures with the pawn, a queen check picks up material " +
      "and eventually the rook in the corner. The only safe response for Black " +
      "is not recapturing at all — playing a queen move that counterattacks " +
      "instead.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "f6", "Nxe5", "fxe5", "Qh5+", "g6", "Qxe5+"],
    criticalMoveIndex: 5,
    safeMovesSan: ["Qe7"],
    orderIndex: 8,
  });

  await db.insert(chessTrapsTable).values({
    name: "Petrov Queen Trap",
    category: "Petrov's Defense",
    difficulty: "intermediate",
    trapSide: "white",
    summary: "A pinned knight looks safe to retreat — retreating it loses the queen.",
    explanation:
      "White's queen pins Black's knight to the king along the e-file. The " +
      "natural-looking retreat back to f6 seems to solve the problem, but it " +
      "doesn't break the pin properly — White's knight jumps to c6 with check, " +
      "forking the king and queen. The only safe move is countering with the " +
      "queen instead, which both breaks the pin and attacks White's knight.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nxe4", "Qe2", "Nf6", "Nc6+"],
    criticalMoveIndex: 7,
    safeMovesSan: ["Qe7"],
    orderIndex: 9,
  });

  await db.insert(chessTrapsTable).values({
    name: "Marshall Trap",
    category: "Petrov's Defense",
    difficulty: "advanced",
    trapSide: "black",
    summary: "A long, sharp line where one careless rook move opens the king to a full attack.",
    explanation:
      "Both sides develop normally through the middlegame, but White's rook " +
      "move overlooks a bishop sacrifice on h2. Once accepted, Black's knight " +
      "and bishop tear through White's kingside pawns with check after check, " +
      "eventually winning back all the sacrificed material with the king still " +
      "exposed. The safe path is developing the queenside knight first instead " +
      "of the rook move.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "d6", "Nf3", "Nxe4", "d4", "d5", "Bd3", "Bd6", "O-O", "O-O", "c4", "Bg4", "cxd5", "f5", "Re1", "Bxh2+", "Kxh2", "Nxf2", "Qe2", "Nxd3", "Qxd3", "Bxf3", "Qxf3", "Qh4+"],
    criticalMoveIndex: 18,
    safeMovesSan: ["Nc3"],
    orderIndex: 10,
  });

  await db.insert(chessTrapsTable).values({
    name: "Fool's Mate",
    category: "King's Pawn Opening",
    difficulty: "beginner",
    trapSide: "black",
    summary: "The fastest possible checkmate in chess — two bad pawn moves and it's over.",
    explanation:
      "This isn't a deceptive trap so much as the clearest possible lesson in " +
      "king safety: pushing kingside pawns early, especially in front of your " +
      "own king, can open a mating diagonal before you've developed a single " +
      "piece. After White's second move, Black's queen has an open diagonal " +
      "straight to the king with nothing in the way. Any normal developing " +
      "move avoids this entirely.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["f3", "e5", "g4", "Qh4#"],
    criticalMoveIndex: 2,
    safeMovesSan: ["e4", "Nf3", "d4"],
    orderIndex: 11,
  });

  console.log("Seeded batch 2: Fried Liver Attack, Englund Gambit Trap, Blackburne Shilling Gambit, Siberian Trap, Lasker Trap, Elephant Trap, Damiano Defense Trap, Petrov Queen Trap, Marshall Trap, Fool's Mate");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
