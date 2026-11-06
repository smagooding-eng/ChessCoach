// The tactics map: every motif, the Lichess puzzle tags its drills come from,
// and a short hand-made demo. Middlegame motifs live on /tactics;
// the mating patterns and endgame ones are shown on the Endgames page. Demo moves are checked legal.

export type TacticGroup = 'basics' | 'next' | 'mates' | 'endgame';
export interface DemoStep { san: string; say: string }
export interface MotifDemo { fen: string; intro: string; steps: DemoStep[] }
export interface Motif {
  id: string;
  name: string;
  group: TacticGroup;
  /** Drill puzzles carry any of these tags… */
  any: string[];
  /** …and all of these. */
  all?: string[];
  blurb: string;
  /** Shown when drills borrow a related tag. */
  note?: string;
  demo?: MotifDemo;
  /** Kids app name, for the motifs the kids version uses. */
  kid?: string;
}

export const GROUPS: { id: TacticGroup; title: string; sub: string }[] = [
  { id: 'basics', title: 'Basics', sub: 'The patterns behind most won games' },
  { id: 'next', title: 'Next level', sub: 'Combinations that set the basics up' },
  { id: 'mates', title: 'Mating patterns', sub: 'Recognise the finish' },
  { id: 'endgame', title: 'Endgame tactics', sub: 'Pawns, promotion and the last few pieces' },
];

export const MOTIFS: Motif[] = [
  // ── Basics ──
  { id: 'fork', name: 'Fork', group: 'basics', any: ['fork'], kid: 'Two-for-one',
    blurb: 'One piece attacks two things at once. They can only save one.',
    demo: { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', intro: 'The knight can attack the king and the rook at the same time.',
      steps: [{ san: 'Nc7+', say: 'Check, and the rook on a8 is attacked too: a fork.' }, { san: 'Kd7', say: 'The king has to move…' }, { san: 'Nxa8', say: '…and the rook falls.' }] } },
  { id: 'pin', name: 'Pin', group: 'basics', any: ['pin'], kid: 'Stuck piece',
    blurb: "A piece can't move because something more valuable is behind it.",
    demo: { fen: '4k3/7p/2n5/8/3P4/8/8/4KB2 w - - 0 1', intro: 'The knight sits in front of its own king.',
      steps: [{ san: 'Bb5', say: 'The bishop pins the knight to the king: it can’t move.' }, { san: 'h6', say: 'Black can’t do anything about it.' }, { san: 'd5', say: 'Now attack the pinned piece with a pawn.' }, { san: 'h5', say: 'It still can’t move…' }, { san: 'dxc6', say: '…so it’s won.' }] } },
  { id: 'skewer', name: 'Skewer', group: 'basics', any: ['skewer'], kid: 'Shish kebab',
    blurb: 'Attack a valuable piece; when it moves, take the one behind it.',
    demo: { fen: '8/8/8/8/q3k3/8/6K1/7R w - - 0 1', intro: 'The king and queen are on the same line.',
      steps: [{ san: 'Rh4+', say: 'Check along the rank. The queen is behind the king.' }, { san: 'Kd3', say: 'The king must step off the line…' }, { san: 'Rxa4', say: '…and the rook takes the queen.' }] } },
  { id: 'discovered', name: 'Discovered attack', group: 'basics', any: ['discoveredAttack'],
    blurb: 'Move one piece out of the way and the piece behind it attacks.',
    demo: { fen: '7q/4k3/8/8/3N4/8/1B6/6K1 w - - 0 1', intro: 'The knight is blocking the bishop’s line to the queen.',
      steps: [{ san: 'Nc6+', say: 'The knight moves with check, and opens the bishop’s line to h8.' }, { san: 'Kd6', say: 'Black has to answer the check…' }, { san: 'Bxh8', say: '…and the queen goes.' }] } },
  { id: 'double-check', name: 'Double check', group: 'basics', any: ['doubleCheck'],
    blurb: 'Check from two pieces at once. Only a king move can answer it.',
    demo: { fen: '4k3/8/8/q7/8/8/4B3/4R1K1 w - - 0 1', intro: 'The bishop is in front of the rook on the e-file.',
      steps: [{ san: 'Bb5+', say: 'Check from the bishop AND the rook. The queen could take the bishop, but that only stops one check.' }, { san: 'Kf7', say: 'So the king has to move, and White is ready for the next blow.' }] } },
  { id: 'removing-defender', name: 'Removing the defender', group: 'basics', any: ['capturingDefender'],
    blurb: 'Take the piece that guards something, then take what it guarded.',
    demo: { fen: '4k3/1p6/2n5/1B6/3b4/8/8/3R3K w - - 0 1', intro: 'The rook attacks the bishop on d4, but the knight defends it.',
      steps: [{ san: 'Bxc6+', say: 'Remove the defender first (with check, too).' }, { san: 'bxc6', say: 'Black takes back…' }, { san: 'Rxd4', say: '…and the bishop on d4 has nobody guarding it.' }] } },
  { id: 'hanging', name: 'Hanging pieces', group: 'basics', any: ['hangingPiece'], kid: 'Free snack',
    blurb: 'A piece nobody defends. Always check for free material.',
    demo: { fen: '4k3/8/8/2b5/8/3N4/8/4K3 w - - 0 1', intro: 'Look at every enemy piece: is it defended?',
      steps: [{ san: 'Nxc5', say: 'The bishop on c5 was hanging: nothing protected it.' }] } },
  { id: 'trapped', name: 'Trapped piece', group: 'basics', any: ['trappedPiece'], kid: 'Trapped!',
    blurb: 'A piece with no safe squares. Surround it, then win it.',
    demo: { fen: '4k3/8/8/8/8/1P6/b1P5/3K4 w - - 0 1', intro: 'The bishop on a2 has almost no way out.',
      steps: [{ san: 'Kc1', say: 'Walk the king over.' }, { san: 'Ke7', say: 'Black can’t rescue it…' }, { san: 'Kb2', say: 'b1 is covered and b3 is defended: the bishop is trapped.' }, { san: 'Kd6', say: '' }, { san: 'Kxa2', say: 'And it’s won.' }] } },

  // ── Next level ──
  { id: 'deflection', name: 'Deflection', group: 'next', any: ['deflection'],
    blurb: 'Force a defender away from the square or piece it guards.' },
  { id: 'decoy', name: 'Decoy', group: 'next', any: ['attraction'],
    blurb: 'Lure a piece (often the king) onto a square where it gets hit.' },
  { id: 'overloading', name: 'Overloading', group: 'next', any: ['deflection'], note: 'Drills use deflection puzzles: the same idea, a defender with too many jobs.',
    blurb: 'One defender, two jobs. Make it choose.' },
  { id: 'intermezzo', name: 'Zwischenzug', group: 'next', any: ['intermezzo'],
    blurb: 'The in-between move: before recapturing, play a stronger move first.' },
  { id: 'x-ray', name: 'X-ray', group: 'next', any: ['xRayAttack'],
    blurb: 'A piece attacks or defends through another piece on the same line.' },
  { id: 'clearance', name: 'Clearance', group: 'next', any: ['clearance'],
    blurb: 'Move a piece out of the way to open a square or line for another.' },
  { id: 'interference', name: 'Interference', group: 'next', any: ['interference'],
    blurb: 'Put a piece between two enemy pieces to cut their connection.' },
  { id: 'quiet-move', name: 'Quiet move', group: 'next', any: ['quietMove'],
    blurb: 'No check, no capture, but it wins: the hardest kind to see.' },
  { id: 'sacrifice', name: 'Sacrifice', group: 'next', any: ['sacrifice'],
    blurb: 'Give material on purpose to get something bigger.' },
  { id: 'f7-attack', name: 'Attacking f7 / f2', group: 'next', any: ['attackingF2F7'],
    blurb: 'The weakest square at the start: only the king defends it.' },

  // ── Mating patterns ──
  { id: 'mate-in-1', name: 'Mate in 1', group: 'mates', any: ['mateIn1'], kid: 'Checkmate in one',
    blurb: 'Find the move that ends the game.' },
  { id: 'mate-in-2', name: 'Mate in 2', group: 'mates', any: ['mateIn2'],
    blurb: 'A forcing move first, then the mate.' },
  { id: 'mate-in-3', name: 'Mate in 3', group: 'mates', any: ['mateIn3'],
    blurb: 'Three forcing moves. Checks first, then captures, then threats.' },
  { id: 'back-rank', name: 'Back-rank mate', group: 'mates', any: ['backRankMate'], kid: 'Back-row trap',
    blurb: 'The king is boxed in by its own pawns on the back row.',
    demo: { fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', intro: 'Black’s king has no escape square: its own pawns block it.',
      steps: [{ san: 'Re8#', say: 'The rook checks along the back rank. Checkmate.' }] } },
  { id: 'smothered', name: 'Smothered mate', group: 'mates', any: ['smotheredMate'],
    blurb: 'A knight mates a king that its own pieces surround.',
    demo: { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', intro: 'The king is completely surrounded by its own pieces.',
      steps: [{ san: 'Nf7#', say: 'The knight checks and nothing can take it or block it. Smothered.' }] } },
  { id: 'anastasia', name: "Anastasia's mate", group: 'mates', any: ['anastasiaMate'],
    blurb: 'Knight and rook trap the king on the edge.',
    demo: { fen: '8/4N1pk/8/8/8/8/8/K5R1 w - - 0 1', intro: 'The knight on e7 covers g8 and g6.',
      steps: [{ san: 'Rh1#', say: 'The rook checks down the h-file. The king has nowhere to go.' }] } },
  { id: 'arabian', name: 'Arabian mate', group: 'mates', any: ['arabianMate'],
    blurb: 'Rook and knight mate a king in the corner.',
    demo: { fen: '7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', intro: 'The knight guards h7 and g8.',
      steps: [{ san: 'Rh7#', say: 'The rook checks next to the king, protected by the knight. Mate.' }] } },
  { id: 'boden', name: "Boden's mate", group: 'mates', any: ['bodenMate'],
    blurb: 'Two bishops on crossing diagonals mate a castled-long king.',
    demo: { fen: '2kr4/3p4/8/8/5B2/8/4B3/6K1 w - - 0 1', intro: 'The bishop on f4 covers b8 and c7.',
      steps: [{ san: 'Ba6#', say: 'The other bishop checks from a6. Two diagonals, no escape.' }] } },
  { id: 'hook', name: 'Hook mate', group: 'mates', any: ['hookMate'],
    blurb: 'Rook, knight and pawn hook around the king.' },
  { id: 'double-bishop', name: 'Double-bishop mate', group: 'mates', any: ['doubleBishopMate'],
    blurb: 'Two bishops side by side sweep the king’s squares.' },
  { id: 'dovetail', name: 'Dovetail mate', group: 'mates', any: ['dovetailMate'],
    blurb: 'The queen mates right next to the king; its own pieces block the way out.' },
  { id: 'greek-gift', name: 'Greek gift', group: 'mates', any: ['kingsideAttack'], all: ['sacrifice'],
    note: 'Drills are kingside-attack sacrifices, the family the Greek gift belongs to.',
    blurb: 'The bishop sacrifice on h7 (or h2) that rips the king open.' },

  // ── Endgame tactics (shown on the Endgames page) ──
  { id: 'promotion', name: 'Promotion', group: 'endgame', any: ['promotion'], kid: 'Pawn becomes a queen',
    blurb: 'Get a pawn to the last row and make a new queen.',
    demo: { fen: '8/4P3/8/8/8/8/k7/6K1 w - - 0 1', intro: 'One step from the end.',
      steps: [{ san: 'e8=Q', say: 'The pawn becomes a queen.' }] } },
  { id: 'underpromotion', name: 'Underpromotion', group: 'endgame', any: ['underPromotion'],
    blurb: 'Sometimes a knight is better than a queen.',
    demo: { fen: '8/2k1P1q1/8/8/8/8/8/7K w - - 0 1', intro: 'A new queen on e8 would be taken. What about a knight?',
      steps: [{ san: 'e8=N+', say: 'A knight, with check, and it attacks the queen too.' }, { san: 'Kd7', say: 'The king moves…' }, { san: 'Nxg7', say: '…and the knight takes the queen.' }] } },
  { id: 'passed-pawn', name: 'Passed pawns', group: 'endgame', any: ['advancedPawn'],
    blurb: 'A pawn with nothing in front of it. Push it, or stop it.' },
  { id: 'breakthrough', name: 'Pawn breakthrough', group: 'endgame', any: ['pawnEndgame'],
    note: 'Drills are pawn-endgame puzzles.',
    blurb: 'Give up pawns to make one that can’t be stopped.',
    demo: { fen: '6k1/ppp5/8/PPP5/8/8/8/6K1 w - - 0 1', intro: 'Three pawns against three. The kings are far away.',
      steps: [{ san: 'b6', say: 'Break through in the middle.' }, { san: 'axb6', say: 'If a-pawn takes…' }, { san: 'c6', say: 'push the other side…' }, { san: 'bxc6', say: '' }, { san: 'a6', say: 'and the a-pawn is through.' }, { san: 'Kf7', say: 'The king is too far away.' }, { san: 'a7', say: '' }, { san: 'Ke7', say: '' }, { san: 'a8=Q', say: 'A new queen.' }] } },
  { id: 'zugzwang', name: 'Zugzwang', group: 'endgame', any: ['zugzwang'],
    blurb: 'Every move makes things worse. Make them move.' },
  { id: 'rook-endgame', name: 'Rook endgames', group: 'endgame', any: ['rookEndgame'],
    blurb: 'The most common endgame: checks, cut-offs and passed pawns.' },
  { id: 'queen-endgame', name: 'Queen endgames', group: 'endgame', any: ['queenEndgame', 'queenRookEndgame'],
    blurb: 'Checks everywhere: find the one that wins.' },
  { id: 'minor-endgame', name: 'Knight & bishop endgames', group: 'endgame', any: ['knightEndgame', 'bishopEndgame'],
    blurb: 'Outposts, wrong-colour bishops and knight forks.' },
];

// Demos for the rest of the patterns (every move checked legal, every # a real mate).
const MORE_DEMOS: Record<string, MotifDemo> = {
  "deflection": { fen: "3r2k1/3q1ppp/8/8/6Q1/8/5PPP/4R1K1 w - - 0 1", intro: "Black's rook on d8 is the only thing guarding the back rank.",
    steps: [{ san: "Qxd7", say: "Offer the queen: the rook has to choose." }, { san: "Rxd7", say: "It takes, and leaves the back rank." }, { san: "Re8#", say: "Checkmate. The defender was deflected." }] },
  "decoy": { fen: "6k1/6pp/1q6/2N5/8/8/8/5R1K w - - 0 1", intro: "If the king were on f8, a knight could fork it with the queen.",
    steps: [{ san: "Rf8+", say: "Lure the king to f8." }, { san: "Kxf8", say: "It has to take." }, { san: "Nd7+", say: "Now the fork: king and queen." }, { san: "Ke7", say: "" }, { san: "Nxb6", say: "The queen is won." }] },
  "overloading": { fen: "3r2k1/5ppp/8/3n4/8/8/5PPP/3RR1K1 w - - 0 1", intro: "The rook on d8 has two jobs: guard the knight and guard the back rank.",
    steps: [{ san: "Rxd5", say: "Take the knight." }, { san: "Rxd5", say: "If the rook takes back\u2026" }, { san: "Re8#", say: "\u2026it has left the back rank. Mate." }] },
  "intermezzo": { fen: "6k1/5ppp/2q5/3N4/8/2b5/1P6/6K1 w - - 0 1", intro: "Black just took your knight on c3. Don't rush to take back.",
    steps: [{ san: "Ne7+", say: "First, a check that forks the king and queen." }, { san: "Kf8", say: "" }, { san: "Nxc6", say: "Queen won, and the bishop on c3 is still there to take." }] },
  "x-ray": { fen: "3r2k1/3q1ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1", intro: "Your rook on d1 'sees' through your queen.",
    steps: [{ san: "Qxd7", say: "Trade queens." }, { san: "Rxd7", say: "Black takes back\u2026" }, { san: "Rxd7", say: "\u2026and the rook behind the queen takes too. A whole rook up." }] },
  "clearance": { fen: "3r2k1/1p3ppp/8/4N3/6Q1/8/1B3PPP/6K1 w - - 0 1", intro: "Your knight is blocking the bishop's line to g7.",
    steps: [{ san: "Nd7", say: "Move it out of the way (it attacks the rook too)." }, { san: "Rxd7", say: "Black takes it\u2026" }, { san: "Qxg7#", say: "\u2026and the bishop now guards g7. Mate." }] },
  "interference": { fen: "r7/4P2k/1B6/8/8/8/8/7K w - - 0 1", intro: "The rook on a8 stops the pawn from queening on e8.",
    steps: [{ san: "Bd8", say: "Block the rook's line." }, { san: "Rxd8", say: "If it takes the bishop\u2026" }, { san: "exd8=Q", say: "\u2026the pawn takes back and becomes a queen." }] },
  "quiet-move": { fen: "r6k/1p4pp/8/8/3B4/5QR1/8/7K w - - 0 1", intro: "No check and no capture, but it wins.",
    steps: [{ san: "Qf6", say: "A quiet move: it threatens mate on g7." }, { san: "gxf6", say: "Taking the queen opens the g-file and the long diagonal\u2026" }, { san: "Bxf6#", say: "\u2026mate." }] },
  "sacrifice": { fen: "r6k/4N1pp/8/5R1Q/8/8/6PP/6K1 w - - 0 1", intro: "Give the queen to open the h-file.",
    steps: [{ san: "Qxh7+", say: "The queen sacrifice." }, { san: "Kxh7", say: "The king has to take." }, { san: "Rh5#", say: "Mate: the knight covers g8 and g6." }] },
  "f7-attack": { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", intro: "At the start, f7 is guarded only by the king.",
    steps: [{ san: "e4", say: "" }, { san: "e5", say: "" }, { san: "Bc4", say: "The bishop aims at f7." }, { san: "Nc6", say: "" }, { san: "Qh5", say: "Now the queen joins in." }, { san: "Nf6", say: "Black misses the threat\u2026" }, { san: "Qxf7#", say: "Mate on f7." }] },
  "mate-in-1": { fen: "7k/7p/8/8/8/6Q1/1B3PPP/6K1 w - - 0 1", intro: "The bishop already aims at g7.",
    steps: [{ san: "Qg7#", say: "The queen lands on g7, protected by the bishop. Mate." }] },
  "mate-in-2": { fen: "3r2k1/5ppp/8/8/Q7/8/5PPP/4R1K1 w - - 0 1", intro: "A forcing move first, then the mate.",
    steps: [{ san: "Re8+", say: "Check: the rook has to take." }, { san: "Rxe8", say: "" }, { san: "Qxe8#", say: "And the queen mates on the back rank." }] },
  "mate-in-3": { fen: "2rr2k1/5ppp/8/4R3/4R3/4Q3/5PPP/6K1 w - - 0 1", intro: "Three pieces lined up on the e-file against two defenders.",
    steps: [{ san: "Re8+", say: "" }, { san: "Rxe8", say: "" }, { san: "Rxe8+", say: "Check again." }, { san: "Rxe8", say: "" }, { san: "Qxe8#", say: "The last attacker mates." }] },
  "hook": { fen: "5k2/5pp1/3N4/2P5/8/8/8/4R1K1 w - - 0 1", intro: "The pawn guards the knight, and the knight guards e8.",
    steps: [{ san: "Re8#", say: "The rook checks on e8, protected by the knight. Mate." }] },
  "double-bishop": { fen: "7k/7p/8/8/2B2B2/8/8/6K1 w - - 0 1", intro: "One bishop covers g8.",
    steps: [{ san: "Be5#", say: "The other checks down the long diagonal. Mate." }] },
  "dovetail": { fen: "4kb2/5p2/1N6/8/8/8/8/3Q2K1 w - - 0 1", intro: "The king's own pieces block f8 and f7.",
    steps: [{ san: "Qd7#", say: "The queen lands right next to it, protected by the knight. Mate." }] },
  "greek-gift": { fen: "5rk1/p4ppp/8/8/8/3B1N2/5PPP/3Q2K1 w - - 0 1", intro: "The classic bishop sacrifice on h7.",
    steps: [{ san: "Bxh7+", say: "Give the bishop." }, { san: "Kxh7", say: "" }, { san: "Ng5+", say: "The knight comes in with check." }, { san: "Kg8", say: "" }, { san: "Qh5", say: "And the queen threatens mate on h7." }, { san: "a6", say: "" }, { san: "Qh7#", say: "Mate." }] },
  "passed-pawn": { fen: "8/8/5k2/P7/8/8/8/6K1 w - - 0 1", intro: "Can the black king catch the pawn?",
    steps: [{ san: "a6", say: "" }, { san: "Ke6", say: "" }, { san: "a7", say: "" }, { san: "Kd7", say: "Too far away." }, { san: "a8=Q", say: "A new queen." }] },
  "zugzwang": { fen: "4k3/8/4K3/4P3/8/8/8/8 b - - 0 1", intro: "Black has to move, and every move gives ground.",
    steps: [{ san: "Kf8", say: "If the king steps aside\u2026" }, { san: "Kd7", say: "\u2026White's king takes the key square." }, { san: "Kf7", say: "" }, { san: "e6+", say: "" }, { san: "Kf8", say: "" }, { san: "e7+", say: "" }, { san: "Kf7", say: "" }, { san: "e8=Q+", say: "The pawn queens." }] },
  "rook-endgame": { fen: "R7/P5k1/8/8/8/8/r7/4K3 w - - 0 1", intro: "A rook on a8 in front of the pawn, the black rook behind it.",
    steps: [{ san: "Rh8", say: "Get out of the way, with a trick." }, { san: "Kxh8", say: "If the king takes\u2026" }, { san: "a8=Q+", say: "\u2026the pawn queens with check." }, { san: "Kg7", say: "" }, { san: "Qxa2", say: "And the black rook falls." }] },
  "queen-endgame": { fen: "7q/Q7/1K6/8/3k4/8/8/8 w - - 0 1", intro: "King and queen on the same diagonal.",
    steps: [{ san: "Qa1+", say: "Check down the diagonal." }, { san: "Ke4", say: "The king steps off\u2026" }, { san: "Qxh8", say: "\u2026and the queen behind it goes." }] },
  "minor-endgame": { fen: "8/8/8/5k2/8/1b6/2N5/6K1 w - - 0 1", intro: "Knights are deadly when there are only a few pieces left.",
    steps: [{ san: "Nd4+", say: "A fork: the king and the bishop." }, { san: "Kf4", say: "" }, { san: "Nxb3", say: "Bishop won." }] },
};
for (const m of MOTIFS) if (!m.demo && MORE_DEMOS[m.id]) m.demo = MORE_DEMOS[m.id];

export const motifById = (id: string) => MOTIFS.find((m) => m.id === id) ?? null;
export const motifsIn = (g: TacticGroup) => MOTIFS.filter((m) => m.group === g);
export const KIDS_MOTIFS = MOTIFS.filter((m) => m.kid);

/** Which motif a puzzle (by its tags) teaches, for "learn the pattern" links. */
export function motifForThemes(themes: string[]): Motif | null {
  const t = new Set(themes);
  const order = ['smotheredMate', 'backRankMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'hookMate', 'doubleBishopMate', 'dovetailMate',
    'doubleCheck', 'discoveredAttack', 'fork', 'skewer', 'pin', 'capturingDefender', 'deflection', 'attraction', 'intermezzo', 'xRayAttack',
    'clearance', 'interference', 'trappedPiece', 'underPromotion', 'promotion', 'zugzwang', 'quietMove', 'hangingPiece', 'mateIn1', 'mateIn2', 'mateIn3'];
  for (const tag of order) if (t.has(tag)) return MOTIFS.find((m) => m.any.includes(tag) && !m.all) ?? null;
  return null;
}

export interface TacticProgress { solved: number; attempts: number; bestSession: number; sessions: number; masteredAt: string | null; reviewDue: string | null; speedBest: number | null }
export const isDue = (p?: TacticProgress) => !!(p?.masteredAt && p.reviewDue && new Date(p.reviewDue).getTime() <= Date.now());
