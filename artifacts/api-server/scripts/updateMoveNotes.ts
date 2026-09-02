// Adds per-move notes to all 12 already-seeded traps, matched by name.
// Updates existing rows -- does not insert anything, so safe to run
// even though all 12 traps are already in the database.
// Run with: DATABASE_URL="..." pnpm exec tsx scripts/updateMoveNotes.ts

import { db, chessTrapsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const notes: Record<string, string[]> = {
  "Scholar's Mate": [
    "Opens the center and clears the path for the bishop and queen.",
    "Natural developing reply, opening room for Black's own pieces.",
    "Aims the bishop straight at f7, the weakest square in Black's camp.",
    "Also natural — but this is the moment the trap depends on.",
    "Brings the queen out alongside the bishop, doubling up on f7.",
    "Looks like normal development, but ignores the threat completely — this is the losing move.",
    "Both attackers converge on f7 with nothing left to defend it — checkmate.",
  ],
  "Légal Trap": [
    "Opens the center.",
    "Standard reply.",
    "Develops, attacking Black's e5-pawn.",
    "Defends the pawn and develops.",
    "Develops toward the weak f7 square.",
    "Solid, but slightly passive — opens the bishop.",
    "Develops the last minor piece before castling.",
    "Pins the knight to the queen — looks strong, but the pin isn't as real as it seems.",
    "Challenges the bishop pinning the knight.",
    "Keeps the pin alive, expecting White to worry about it — the losing choice.",
    "White ignores the 'pin' completely and offers the knight — the point of the whole combination.",
    "Grabbing the queen looks completely winning — it isn't. This is the critical mistake.",
    "The bishop grabs f7 with check, forcing the king out.",
    "Forced — the king has nowhere else to go.",
    "The knight delivers checkmate, completing the combination White set up moves earlier.",
  ],
  "Fried Liver Attack": [
    "Opens the center.",
    "Standard reply.",
    "Develops toward the center.",
    "Develops, defending e5.",
    "Aims at f7 again, just like Scholar's Mate.",
    "Natural developing move — but it walks into the sacrifice.",
    "The knight jumps in, attacking f7 directly.",
    "A natural central strike, opening lines.",
    "White captures, and now Black must recapture.",
    "The natural recapture — but this knight is now undefended and in the firing line. This is the risky choice.",
    "White sacrifices the knight on f7, forcing the king to move.",
    "Forced — nothing else recaptures safely.",
    "Check, and this move also attacks Black's wandering knight on d5.",
    "The only square that gets the king to (relative) safety.",
    "White develops with tempo, keeping the attack rolling with the king stuck in the center.",
  ],
  "Englund Gambit Trap": [
    "A normal queen's pawn opening move.",
    "Black offers a pawn immediately.",
    "White simply takes it — looks completely safe.",
    "Develops and eyes the pawn on e5.",
    "Develops naturally, defending the extra pawn.",
    "Threatens to win the pawn back and pressures the b-file.",
    "Develops the bishop, ignoring the check for now.",
    "A real check — White must respond.",
    "Blocks the check safely, looking fine so far.",
    "Black grabs the pawn on b2 — looks greedy but it's setting a trap.",
    "The natural try to save the piece and win back material — this is the losing move.",
    "Pins the bishop that just moved to c3 — the point of the whole sequence.",
    "Tries to break the pin.",
    "Forced capture, removing White's defender.",
    "White is forced to recapture.",
    "Checkmate — White's own king is boxed in by its own pieces.",
  ],
  "Blackburne Shilling Gambit": [
    "Opens the center.",
    "Standard reply.",
    "Develops toward f7.",
    "Defends e5 and develops.",
    "Aims at f7, standard development.",
    "Looks like it just hangs the e5-pawn for nothing — this is the bait.",
    "White grabs the seemingly free pawn — this is the losing move.",
    "Black's queen swings out, creating a double attack on the knight and g2.",
    "White tries to save the knight and grab another pawn, but it's already too late.",
    "Grabs the g2-pawn, attacking the rook in the corner too.",
    "Defends the rook, the only reasonable try.",
    "Check, picking up the e4-pawn along the way.",
    "Blocks the check, the forced defense.",
    "The knight delivers smothered mate — White's own pieces trap the king.",
  ],
  "Siberian Trap": [
    "Opens with the Sicilian.",
    "Challenges the center immediately.",
    "Strikes in the center.",
    "Opens the position.",
    "Offers a second pawn to open lines further.",
    "Accepts the second pawn.",
    "Develops with tempo, recapturing.",
    "Develops, contesting the center.",
    "Develops naturally.",
    "Solid, standard development.",
    "Aims at the weak f7 square.",
    "Develops the queen, eyeing the e-file.",
    "Castles into safety — looks completely normal.",
    "Develops the last minor piece.",
    "Connects the rooks, prepares central play.",
    "The knight jumps forward, threatening ideas on h2.",
    "Looks like a completely natural way to kick the knight back — this is the losing move.",
    "The knight jumps to d4, and White's position collapses — the queen or king is in serious trouble next.",
  ],
  "Lasker Trap": [
    "Opens with the Queen's Gambit.",
    "Declines the gambit, countering in the center instead.",
    "Offers the c-pawn.",
    "Strikes back in the center immediately.",
    "White grabs the pawn.",
    "Pushes forward, gaining space.",
    "Challenges the advanced pawn.",
    "Pins the knight with check.",
    "Blocks the check.",
    "Takes the pawn, opening the position further.",
    "Grabs the bishop, looking like it wins material cleanly — this is the losing move.",
    "Crashes through with check instead of recapturing normally.",
    "Forced — the king has to step out.",
    "An underpromotion to a knight, not a queen — this both checks the king and sets up the winning idea.",
    "Forced.",
    "Another check, bringing the queen into the attack.",
    "The king is forced further out, and Black is winning material with the attack still raging.",
  ],
  "Elephant Trap": [
    "Opens with the Queen's Gambit.",
    "Declines it, playing solidly.",
    "Standard development.",
    "Continues development.",
    "Pins the knight to the queen.",
    "Develops, defending the knight.",
    "Pins the other knight too.",
    "Develops naturally.",
    "Offers a trade in the center.",
    "Recaptures, looking completely fine.",
    "Grabs the pawn — looks free since the knight on f6 is 'pinned.' This is the losing move.",
    "Recaptures anyway — the pin doesn't actually matter here, since the tactics favor Black.",
    "Grabs the queen, looking like it wins on the spot.",
    "Checks with the bishop — the point of the whole sequence.",
    "Blocks with the queen, the only move.",
    "Trades queens.",
    "Recaptures.",
    "Recaptures the bishop on d8 — and Black has won a full piece.",
  ],
  "Damiano Defense Trap": [
    "Opens the center.",
    "Standard reply.",
    "Develops toward the center.",
    "Looks like it protects e5 — it actually weakens the king's diagonal badly. This is the setup for the whole trap.",
    "White offers the knight, since the f6-pawn no longer defends properly.",
    "The natural recapture — but this opens the king to a devastating check. This is the losing move.",
    "Check, and the king has very few options.",
    "Blocks the check, but weakens the kingside further.",
    "The queen grabs the pawn back with check, and next threatens the rook in the corner too.",
  ],
  "Petrov Queen Trap": [
    "Opens the center.",
    "Black mirrors White's move.",
    "Standard development.",
    "Black mirrors again — the symmetry is about to break.",
    "White grabs the pawn immediately.",
    "Black grabs a pawn back symmetrically — looks completely safe.",
    "Pins the knight to the king along the e-file.",
    "The natural-looking retreat — but it doesn't actually solve the pin properly. This is the losing move.",
    "The knight jumps in with check, forking the king and queen at the same time.",
  ],
  "Marshall Trap": [
    "Opens the center.",
    "Black mirrors it.",
    "White grabs the pawn.",
    "Solid, defends normally.",
    "Retreats, preparing to castle.",
    "Strikes in the center.",
    "Develops normally.",
    "Grabs a pawn, both sides trading in the center.",
    "Continues central expansion.",
    "Matches in the center.",
    "Develops the bishop.",
    "Develops, matching White.",
    "Castles into safety.",
    "Black castles too.",
    "Expands on the queenside.",
    "Pins the knight.",
    "Trades pawns in the center.",
    "Strikes with the f-pawn, opening lines.",
    "A natural developing move, connecting the rooks — but it overlooks a sacrifice. This is the losing move.",
    "Sacrifices the bishop, ripping open the king's shelter.",
    "Forced — declining loses even faster.",
    "Grabs a pawn with a fork on the queen and rook.",
    "Defends and develops.",
    "Grabs another pawn.",
    "Recaptures.",
    "Trades the remaining minor pieces.",
    "Recaptures.",
    "Brings the queen in with check, and Black has won back all the material with the attack still going.",
  ],
  "Fool's Mate": [
    "An unusual first move that does nothing for development and slightly weakens the kingside.",
    "A completely normal reply, taking the center.",
    "A second weakening pawn move — this is the losing mistake, opening the diagonal straight to White's king.",
    "The queen swings all the way to h4 for checkmate — nothing blocks the diagonal and the king has no escape square.",
  ],
};

async function main() {
  let updated = 0;
  for (const [name, moveNotes] of Object.entries(notes)) {
    const result = await db.update(chessTrapsTable)
      .set({ moveNotes })
      .where(eq(chessTrapsTable.name, name))
      .returning({ id: chessTrapsTable.id });
    if (result.length > 0) {
      updated++;
      console.log(`Updated: ${name} (${moveNotes.length} notes)`);
    } else {
      console.log(`Not found in DB, skipped: ${name}`);
    }
  }
  console.log(`\nDone. ${updated}/${Object.keys(notes).length} traps updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
