// One-time seed script for Chess Traps Training.
// Run with: DATABASE_URL="..." npx tsx scripts/seedTraps.ts
// (from artifacts/api-server, or adjust the db import path if run elsewhere)

import { db, chessTrapsTable } from "@workspace/db";

async function main() {
  await db.insert(chessTrapsTable).values({
    name: "Scholar's Mate",
    category: "King's Pawn Opening",
    difficulty: "beginner",
    trapSide: "white",
    summary: "Mate in 4 if Black develops naturally without watching f7.",
    explanation:
      "White's queen and bishop both aim at f7, the weakest square in Black's " +
      "starting position (only defended by the king). If Black develops with " +
      "...Nf6 instead of noticing the threat, White's queen captures on f7 for " +
      "checkmate. The defense is simple once you know it: either attack the " +
      "queen with ...g6, or bring a piece back to guard f7.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
    criticalMoveIndex: 5, // Black's ...Nf6, the losing move
    safeMovesSan: ["g6"],
    orderIndex: 0,
  });

  console.log("Seeded: Scholar's Mate");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
