// Standalone seed script for just the Légal Trap -- kept isolated so
// running it doesn't duplicate Scholar's Mate, which is already seeded.
// Run with: DATABASE_URL="..." npx tsx scripts/seedLegalTrap.ts

import { db, chessTrapsTable } from "@workspace/db";

async function main() {
  await db.insert(chessTrapsTable).values({
    name: "Légal Trap",
    category: "Italian Game",
    difficulty: "intermediate",
    trapSide: "white",
    summary: "A real queen sacrifice — if Black greedily takes it, two minor pieces deliver mate.",
    explanation:
      "Black pins White's knight to the queen with ...Bg4, expecting White to " +
      "worry about the pin. Instead White ignores it entirely and plays Nxe5, " +
      "offering the queen. If Black grabs it with Bxd1, White's bishop and both " +
      "knights combine for forced mate in two. The pin was never real — the " +
      "knight was defended by tactics Black didn't see. The safe response is to " +
      "recapture the knight with ...Nxe5 instead of taking the queen.",
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    trapLineSan: ["e4", "e5", "Nf3", "Nc6", "Bc4", "d6", "Nc3", "Bg4", "h3", "Bh5", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
    criticalMoveIndex: 11, // Black's ...Bxd1, greedily taking the queen
    safeMovesSan: ["Nxe5"],
    orderIndex: 1,
  });

  console.log("Seeded: Légal Trap");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
