// Seeds the complete "Chess Basics" course: all 6 piece-movement
// lessons (each with a hands-on drill) plus Check and Checkmate.
// Run with: DATABASE_URL="..." pnpm exec tsx scripts/seedBeginnerCourses.ts

import { db, beginnerCoursesTable, beginnerLessonsTable } from "@workspace/db";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
  const [course] = await db.insert(beginnerCoursesTable).values({
    title: "Chess Basics",
    description: "The absolute fundamentals -- how pieces move, and how a game is actually won.",
    iconEmoji: "♟️",
    orderIndex: 0,
  }).returning();

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the Pawn Moves",
    summary: "Straight ahead, captures on the diagonal.",
    orderIndex: 0,
    steps: [
      {
        type: "text",
        text: "Pawns are the most common piece on the board -- every player starts with eight of them, lined up on the second rank. They're also the only piece that moves differently than it captures.",
      },
      {
        type: "board",
        text: "Here's the starting position. Every pawn sits on its own file, ready to advance.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "A pawn moves straight forward, one square at a time. On its very first move only, it's allowed to move two squares instead of one. It can never move backward, and it can never move sideways.",
      },
      {
        type: "practice",
        text: "Try it. Move the pawn in front of the king two squares forward.",
        fen: START_FEN,
        expectedMoveSan: "e4",
      },
      {
        type: "text",
        text: "Now here's the twist: a pawn can never capture the piece directly in front of it. Instead, it captures diagonally -- one square forward and one square to either side.",
      },
      {
        type: "board",
        text: "White just played e4, and Black answered with d5. The two pawns are now attacking each other diagonally.",
        fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
      },
      {
        type: "practice",
        text: "Capture the black pawn diagonally.",
        fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        expectedMoveSan: "exd5",
      },
      {
        type: "drill",
        text: "Now try it freely. Move the pawn forward as many different ways as you can -- one square, two squares from its start, whatever's legal.",
        drillPiece: "p",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the Knight Moves",
    summary: "The only piece that jumps.",
    orderIndex: 1,
    steps: [
      {
        type: "text",
        text: "The knight moves in an L-shape: two squares in one direction, then one square perpendicular to that. It's the trickiest piece to visualize at first, but it has one enormous advantage over every other piece.",
      },
      {
        type: "board",
        text: "Each side starts with two knights, tucked between the rooks and bishops.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "The knight is the only piece on the board that can jump over other pieces. Every other piece needs a clear path -- the knight doesn't care what's in between its start square and its landing square.",
      },
      {
        type: "practice",
        text: "Develop the knight on the kingside -- jump it out toward the center.",
        fen: START_FEN,
        expectedMoveSan: "Nf3",
      },
      {
        type: "drill",
        text: "Now drill it. The knight's L-shape takes practice to see instantly -- try moving it to a few different squares in a row.",
        drillPiece: "n",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the Bishop Moves",
    summary: "Diagonals only -- and it never leaves its color.",
    orderIndex: 2,
    steps: [
      {
        type: "text",
        text: "The bishop moves diagonally, in a straight line, any number of squares. There's one thing about it that never changes for the entire game: a bishop that starts on a light square stays on light squares forever, and the same goes for dark squares.",
      },
      {
        type: "board",
        text: "Each side has two bishops -- one that only ever travels on light squares, and one that only ever travels on dark squares.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "Like the rook and queen, the bishop can't jump over other pieces -- if something's in its path, it has to stop there (or capture it, if it's an enemy piece).",
      },
      {
        type: "drill",
        text: "Try it. Move the bishop along its diagonals to a few different squares.",
        drillPiece: "b",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the Rook Moves",
    summary: "Straight lines, any distance.",
    orderIndex: 3,
    steps: [
      {
        type: "text",
        text: "The rook moves in a straight line -- forward, backward, left, or right -- any number of squares, as long as nothing's in the way.",
      },
      {
        type: "board",
        text: "Each side starts with two rooks, tucked into the corners of the board.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "Rooks are especially powerful once the board opens up. On a completely empty board, a rook actually covers more squares than any other piece except the queen.",
      },
      {
        type: "drill",
        text: "Try it. Move the rook along a rank or file to a few different squares.",
        drillPiece: "r",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the Queen Moves",
    summary: "The most powerful piece on the board.",
    orderIndex: 4,
    steps: [
      {
        type: "text",
        text: "The queen combines everything the rook and bishop can do. It moves any number of squares in a straight line -- horizontally, vertically, or diagonally.",
      },
      {
        type: "board",
        text: "Each side has one queen, standing right next to the king at the start of the game.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "Because it can move in eight different directions, the queen is by far the most valuable piece on the board besides the king. Losing your queen for anything less than an equally big prize is almost always a serious mistake.",
      },
      {
        type: "drill",
        text: "Try it. Move the queen in a few different directions -- straight and diagonal.",
        drillPiece: "q",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "How the King Moves",
    summary: "Just one square -- but it's the piece the whole game is about.",
    orderIndex: 5,
    steps: [
      {
        type: "text",
        text: "The king moves exactly one square in any direction -- forward, backward, sideways, or diagonally. It's the weakest piece in terms of movement, but the entire game revolves around keeping it safe.",
      },
      {
        type: "board",
        text: "Each side has exactly one king. If a player's king has no way to escape an attack, the game is over immediately.",
        fen: START_FEN,
      },
      {
        type: "text",
        text: "There's one rule unique to the king: it's never allowed to move into a square where it would be captured. Every other piece can walk into danger if the player chooses to -- the king legally cannot.",
      },
      {
        type: "drill",
        text: "Try it. Move the king one square at a time in a few different directions.",
        drillPiece: "k",
        drillReps: 5,
      },
    ],
  });

  await db.insert(beginnerLessonsTable).values({
    courseId: course.id,
    title: "Check and Checkmate",
    summary: "The whole point of the game.",
    orderIndex: 6,
    steps: [
      {
        type: "text",
        text: "The king is never actually captured in chess. Instead, the entire game revolves around threatening it. When a piece attacks the square the king is standing on, the king is in 'check' -- and the player in check must immediately do something about it.",
      },
      {
        type: "board",
        text: "Black's king is in check right now -- White's queen attacks straight down the e-file with nothing in the way.",
        fen: "4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1",
      },
      {
        type: "text",
        text: "There are exactly three ways to get out of check: move the king to a safe square, block the attack with another piece, or capture the attacking piece. If none of those are possible, the game is over -- that's checkmate.",
      },
      {
        type: "board",
        text: "This position is checkmate. Black's king on h8 is attacked by the rook on a8 along the back rank. It can't move to g8 or f8 -- the rook covers those too. It can't move up -- its own pawns are in the way. And nothing can block or capture the rook in time.",
        fen: "R6k/5ppp/8/8/8/8/8/6K1 b - - 0 1",
      },
      {
        type: "text",
        text: "This particular pattern -- a rook or queen delivering check along the back rank while the king's own pawns block its escape -- is called a back-rank mate. It's one of the most common ways games actually end, so it's worth recognizing on sight.",
      },
    ],
  });

  console.log(`Seeded course "${course.title}" (id ${course.id}) with 7 lessons: 6 piece-movement lessons plus Check and Checkmate.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
