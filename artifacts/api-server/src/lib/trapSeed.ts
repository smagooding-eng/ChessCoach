// More chess traps for the trap trainer (Nov 2026). Added on server start: a trap is
// skipped when one with the same name or the same moves is already there, so nothing is
// ever duplicated and edits made in admin are never overwritten. Every line was checked
// move by move with chess.js (legal moves, the critical move on the defender's turn,
// every safe move legal there, mates really mate).
import { db, chessTrapsTable } from "@workspace/db";
import { logger } from "./logger";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
type Seed = { name: string; category: string; difficulty: string; trapSide: string; summary: string; explanation: string; trapLineSan: string[]; moveNotes: string[]; criticalMoveIndex: number; safeMovesSan: string[] };
const TRAPS: Seed[] = [
 {
  "name": "Fool's Mate",
  "category": "Beginner Traps",
  "difficulty": "beginner",
  "trapSide": "black",
  "summary": "The fastest checkmate in chess: two careless pawn moves by White.",
  "explanation": "White weakens the e1-h4 diagonal with f3 and g4, and Black's queen mates on h4 straight away.",
  "trapLineSan": [
   "f3",
   "e5",
   "g4",
   "Qh4#"
  ],
  "moveNotes": [
   "White moves the f-pawn, weakening the king.",
   "Black opens the diagonal for the queen.",
   "The fatal second pawn move: the h4-e1 diagonal is now wide open.",
   "Checkmate! Nothing can block or capture the queen."
  ],
  "criticalMoveIndex": 2,
  "safeMovesSan": [
   "e4",
   "e3",
   "Nc3",
   "d3"
  ]
 },
 {
  "name": "Scholar's Mate",
  "category": "Beginner Traps",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "Queen and bishop gang up on f7, the weakest square in Black's camp.",
  "explanation": "f7 is only defended by the king. With the queen on h5 and bishop on c4 both hitting f7, Black must defend it; developing the knight to f6 drops the queen's attack on f7.",
  "trapLineSan": [
   "e4",
   "e5",
   "Bc4",
   "Nc6",
   "Qh5",
   "Nf6",
   "Qxf7#"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers in the center.",
   "The bishop aims at f7.",
   "Black develops.",
   "The queen joins the attack on f7 (and hits e5).",
   "Natural, but it ignores the threat on f7.",
   "Checkmate on f7!"
  ],
  "criticalMoveIndex": 5,
  "safeMovesSan": [
   "g6",
   "Qe7",
   "Qf6"
  ]
 },
 {
  "name": "Légal's Mate",
  "category": "Philidor Defense",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "White gives up the queen and mates with three minor pieces.",
  "explanation": "Black's pin on the f3 knight looks strong, but after Nxe5 taking the queen lets Bxf7+ and Nd5# finish the game.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "d6",
   "Bc4",
   "Bg4",
   "Nc3",
   "g6",
   "Nxe5",
   "Bxd1",
   "Bxf7+",
   "Ke7",
   "Nd5#"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "Philidor: solid but passive.",
   "Bishop eyes f7.",
   "Black pins the knight to the queen.",
   "Development.",
   "A slow move that leaves f7 and e5 weak.",
   "White ignores the pin and grabs e5!",
   "Greedy: Black takes the queen.",
   "Check, and the king has only e7.",
   "Forced.",
   "Checkmate by three minor pieces!"
  ],
  "criticalMoveIndex": 9,
  "safeMovesSan": [
   "dxe5"
  ]
 },
 {
  "name": "Blackburne Shilling Gambit",
  "category": "Italian Game",
  "difficulty": "beginner",
  "trapSide": "black",
  "summary": "A cheeky knight jump that punishes a greedy Nxe5.",
  "explanation": "After 3...Nd4 the obvious 4.Nxe5 runs into ...Qg5, hitting the knight and g2. Taking on f7 loses to a smothered mate.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nc6",
   "Bc4",
   "Nd4",
   "Nxe5",
   "Qg5",
   "Nxf7",
   "Qxg2",
   "Rf1",
   "Qxe4+",
   "Be2",
   "Nf3#"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "Black defends e5.",
   "Italian bishop on c4.",
   "The bait: e5 is left hanging.",
   "Greedy: White takes the pawn.",
   "The queen hits the knight and the g2 pawn at once.",
   "White forks the queen and rook... but it's too late.",
   "The queen crashes into g2, hitting the rook.",
   "The rook runs.",
   "Check, picking up e4.",
   "The only block.",
   "Smothered mate! The king is boxed in by its own pieces."
  ],
  "criticalMoveIndex": 6,
  "safeMovesSan": [
   "Nxd4",
   "O-O",
   "Nc3",
   "c3"
  ]
 },
 {
  "name": "Fishing Pole Trap",
  "category": "Ruy Lopez",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "Black leaves a knight on g4 as bait, and the h-file opens onto White's king.",
  "explanation": "If White takes the g4 knight with h3xg4, Black recaptures with the h-pawn and the open h-file lets the queen and rook mate on h2.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nc6",
   "Bb5",
   "Nf6",
   "O-O",
   "Ng4",
   "h3",
   "h5",
   "hxg4",
   "hxg4",
   "Ne1",
   "Qh4",
   "f3",
   "g3",
   "Bxc6",
   "Qh2#"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "Black defends.",
   "The Ruy Lopez.",
   "The Berlin-style knight.",
   "White castles.",
   "The fishing pole: the knight goes to g4.",
   "White kicks the knight.",
   "The bait: Black leaves the knight there!",
   "White bites and takes the knight.",
   "The h-file opens straight at White's king.",
   "Making room for f3.",
   "The queen arrives on the open h-file.",
   "Giving the king air.",
   "The pawn shuts the door and covers h2.",
   "White grabs a piece.",
   "Checkmate on h2!"
  ],
  "criticalMoveIndex": 10,
  "safeMovesSan": [
   "d3",
   "c3",
   "Bxc6",
   "Re1",
   "d4"
  ]
 },
 {
  "name": "Lasker Trap",
  "category": "Albin Countergambit",
  "difficulty": "advanced",
  "trapSide": "black",
  "summary": "Black underpromotes to a knight with check and wins White's rook.",
  "explanation": "After 4.e3? Bb4+ 5.Bd2 dxe3 the bishop on b4 is poisoned: 6.Bxb4?? exf2+ and fxg1=N+ wins the rook on h1.",
  "trapLineSan": [
   "d4",
   "d5",
   "c4",
   "e5",
   "dxe5",
   "d4",
   "e3",
   "Bb4+",
   "Bd2",
   "dxe3",
   "Bxb4",
   "exf2+",
   "Ke2",
   "fxg1=N+"
  ],
  "moveNotes": [
   "Queen's pawn.",
   "Black mirrors.",
   "The Queen's Gambit.",
   "The Albin Countergambit: a pawn for a fast attack.",
   "White takes the pawn.",
   "The d4 pawn cramps White.",
   "A natural-looking mistake.",
   "Check with the bishop.",
   "Blocking.",
   "The pawn takes e3, aiming at f2.",
   "Greedy: White takes the bishop.",
   "The pawn takes f2 with check.",
   "The king has to move.",
   "Promotion to a knight with check! The h1 rook falls next."
  ],
  "criticalMoveIndex": 6,
  "safeMovesSan": [
   "Nf3",
   "a3",
   "Nbd2",
   "g3"
  ]
 },
 {
  "name": "Elephant Trap",
  "category": "Queen's Gambit Declined",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "White wins a pawn on d5 and loses the queen to a pin.",
  "explanation": "The knight on f6 looks pinned, but 6.Nxd5?? Nxd5! works because after 7.Bxd8 Bb4+ Black wins the queen back and is a piece up.",
  "trapLineSan": [
   "d4",
   "d5",
   "c4",
   "e6",
   "Nc3",
   "Nf6",
   "Bg5",
   "Nbd7",
   "cxd5",
   "exd5",
   "Nxd5",
   "Nxd5",
   "Bxd8",
   "Bb4+",
   "Qd2",
   "Bxd2+",
   "Kxd2",
   "Kxd8"
  ],
  "moveNotes": [
   "Queen's pawn.",
   "Black mirrors.",
   "The Queen's Gambit.",
   "Declined: solid.",
   "Development.",
   "Development.",
   "The pin on the f6 knight.",
   "The bait: the knight 'blocks' d5's defence.",
   "White trades on d5.",
   "Recapture.",
   "Greedy: White thinks the f6 knight is pinned.",
   "It isn't really: the knight takes back!",
   "White takes the queen.",
   "Check! The bishop hits the king and wins material back.",
   "The only block.",
   "Black takes the queen with check.",
   "Forced.",
   "Black takes the bishop: a whole piece up."
  ],
  "criticalMoveIndex": 10,
  "safeMovesSan": [
   "e3",
   "Nf3",
   "Qc2"
  ]
 },
 {
  "name": "Englund Gambit Trap",
  "category": "Englund Gambit",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "A cheap queen raid that ends in mate on c1 if White isn't careful.",
  "explanation": "After 4.Bf4? Qb4+ 5.Bd2 Qxb2 the natural 6.Bc3?? walks into ...Bb4!, and the queen mates on c1.",
  "trapLineSan": [
   "d4",
   "e5",
   "dxe5",
   "Nc6",
   "Nf3",
   "Qe7",
   "Bf4",
   "Qb4+",
   "Bd2",
   "Qxb2",
   "Bc3",
   "Bb4",
   "Qd2",
   "Bxc3",
   "Qxc3",
   "Qc1#"
  ],
  "moveNotes": [
   "Queen's pawn.",
   "The Englund Gambit.",
   "White takes.",
   "Black develops and eyes e5.",
   "Defending e5.",
   "The queen attacks e5.",
   "Natural, but it leaves b2 weak.",
   "Check, hitting b2 too.",
   "Blocking.",
   "The queen takes b2, attacking the rook.",
   "Natural-looking: White hits the queen.",
   "Pin! The bishop pins White's bishop.",
   "White tries to defend.",
   "Black takes on c3.",
   "White recaptures.",
   "Checkmate on c1!"
  ],
  "criticalMoveIndex": 10,
  "safeMovesSan": [
   "Nc3",
   "Qc1"
  ]
 },
 {
  "name": "Siberian Trap",
  "category": "Sicilian Smith-Morra",
  "difficulty": "advanced",
  "trapSide": "black",
  "summary": "Black's knight lands on d4 and the queen mates on h2.",
  "explanation": "In the Smith-Morra, after 9.h3?? Nd4! the knight attacks the queen on e2 and opens c7-h2 for Black's queen.",
  "trapLineSan": [
   "e4",
   "c5",
   "d4",
   "cxd4",
   "c3",
   "dxc3",
   "Nxc3",
   "Nc6",
   "Nf3",
   "e6",
   "Bc4",
   "Qc7",
   "O-O",
   "Nf6",
   "Qe2",
   "Ng4",
   "h3",
   "Nd4",
   "Nxd4",
   "Qh2#"
  ],
  "moveNotes": [
   "King's pawn.",
   "The Sicilian.",
   "The Smith-Morra Gambit.",
   "Black takes.",
   "White gives a second pawn.",
   "Black accepts.",
   "Fast development.",
   "Development.",
   "Development.",
   "Solid.",
   "The bishop hits e6/f7.",
   "The queen eyes h2.",
   "White castles.",
   "Development.",
   "The queen comes out.",
   "The knight hits h2.",
   "Natural, kicking the knight... and a blunder.",
   "The knight attacks the queen and opens the c7-h2 diagonal.",
   "White takes the knight.",
   "Checkmate on h2!"
  ],
  "criticalMoveIndex": 16,
  "safeMovesSan": [
   "Rd1",
   "Bb3",
   "Be3",
   "Nb5"
  ]
 },
 {
  "name": "Noah's Ark Trap",
  "category": "Ruy Lopez",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "Black's pawns chase White's bishop until it's trapped.",
  "explanation": "If White recaptures on d4 with the queen, ...c5 and ...c4 trap the bishop on b3: it has no squares left.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nc6",
   "Bb5",
   "a6",
   "Ba4",
   "d6",
   "d4",
   "b5",
   "Bb3",
   "Nxd4",
   "Nxd4",
   "exd4",
   "Qxd4",
   "c5",
   "Qd5",
   "Be6",
   "Qc6+",
   "Bd7",
   "Qd5",
   "c4"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "Black defends.",
   "The Ruy Lopez.",
   "Asking the bishop.",
   "Keeping the pin.",
   "Solid.",
   "White opens the center.",
   "Pushing the bishop back.",
   "The bishop retreats.",
   "Black gives the knight...",
   "White takes.",
   "Black recaptures.",
   "Greedy: the queen takes back.",
   "Threatening ...c4.",
   "The queen moves away.",
   "Covering d5.",
   "Check.",
   "Blocking.",
   "The queen comes back.",
   "The bishop on b3 is trapped!"
  ],
  "criticalMoveIndex": 14,
  "safeMovesSan": [
   "c3",
   "Bd5"
  ]
 },
 {
  "name": "Stafford Gambit: Bg5 Trap",
  "category": "Petrov / Stafford Gambit",
  "difficulty": "beginner",
  "trapSide": "black",
  "summary": "White pins the knight and gets mated on g4.",
  "explanation": "After 5.d3 Bc5 6.Bg5?? Black ignores the pin: ...Nxe4! and if Bxd8, Bxf2+ and Bg4 is mate.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nf6",
   "Nxe5",
   "Nc6",
   "Nxc6",
   "dxc6",
   "d3",
   "Bc5",
   "Bg5",
   "Nxe4",
   "Bxd8",
   "Bxf2+",
   "Ke2",
   "Bg4#"
  ],
  "moveNotes": [
   "King's pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "The Petrov.",
   "White takes e5.",
   "The Stafford Gambit: a pawn for fast pieces.",
   "White takes the knight.",
   "Black opens lines for the bishop and queen.",
   "Solid.",
   "The bishop aims at f2.",
   "The pin... that isn't.",
   "Black ignores it and takes e4!",
   "White takes the queen.",
   "Check on f2.",
   "The only move.",
   "Checkmate!"
  ],
  "criticalMoveIndex": 10,
  "safeMovesSan": [
   "Be2",
   "Nc3",
   "Be3"
  ]
 },
 {
  "name": "Mortimer Trap",
  "category": "Ruy Lopez",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "A knight retreat that sets up a queen fork.",
  "explanation": "After 4...Ne7!? the pawn on e5 looks free, but 5.Nxe5? c6! and ...Qa5+ forks king and knight.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nc6",
   "Bb5",
   "Nf6",
   "d3",
   "Ne7",
   "Nxe5",
   "c6",
   "Bc4",
   "Qa5+",
   "Bd2",
   "Qxe5"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "Black defends.",
   "The Ruy Lopez.",
   "The Berlin.",
   "Quiet.",
   "The strange retreat: e5 is left open.",
   "Greedy: White takes.",
   "Attacking the bishop.",
   "The bishop retreats.",
   "Check, and the e5 knight is hit too.",
   "Blocking.",
   "Black wins the knight."
  ],
  "criticalMoveIndex": 8,
  "safeMovesSan": [
   "O-O",
   "Nc3",
   "c3",
   "Bc4"
  ]
 },
 {
  "name": "Magnus Smith Trap",
  "category": "Sicilian Dragon",
  "difficulty": "intermediate",
  "trapSide": "white",
  "summary": "White's e5 push wins the queen with a bishop check on f7.",
  "explanation": "After 7...g6? 8.Nxc6 bxc6 9.e5! taking on e5 opens the d-file: Bxf7+ and Qxd8 wins the queen.",
  "trapLineSan": [
   "e4",
   "c5",
   "Nf3",
   "d6",
   "d4",
   "cxd4",
   "Nxd4",
   "Nf6",
   "Nc3",
   "Nc6",
   "Bc4",
   "g6",
   "Nxc6",
   "bxc6",
   "e5",
   "dxe5",
   "Bxf7+",
   "Kxf7",
   "Qxd8"
  ],
  "moveNotes": [
   "King's pawn.",
   "The Sicilian.",
   "Development.",
   "Solid.",
   "Opening the center.",
   "Black takes.",
   "White recaptures.",
   "Development.",
   "Development.",
   "Development.",
   "The bishop aims at f7.",
   "The Dragon setup, a little early here.",
   "White trades on c6.",
   "Recapture.",
   "The e5 break!",
   "Natural, but it opens the d-file.",
   "Check! The bishop deflects the king.",
   "Forced.",
   "White takes the queen."
  ],
  "criticalMoveIndex": 15,
  "safeMovesSan": [
   "Nd5",
   "Nd7",
   "Ng4"
  ]
 },
 {
  "name": "Kieninger Trap",
  "category": "Budapest Gambit",
  "difficulty": "intermediate",
  "trapSide": "black",
  "summary": "White grabs a bishop and gets smothered-mated on d3.",
  "explanation": "After 6...Qe7 7.a3 Ngxe5! taking the bishop with axb4?? allows ...Nd3#, a smothered mate.",
  "trapLineSan": [
   "d4",
   "Nf6",
   "c4",
   "e5",
   "dxe5",
   "Ng4",
   "Bf4",
   "Nc6",
   "Nf3",
   "Bb4+",
   "Nbd2",
   "Qe7",
   "a3",
   "Ngxe5",
   "axb4",
   "Nd3#"
  ],
  "moveNotes": [
   "Queen's pawn.",
   "Development.",
   "Space.",
   "The Budapest Gambit.",
   "White takes.",
   "The knight goes after e5.",
   "Defending e5.",
   "More pressure on e5.",
   "Defending.",
   "Check.",
   "Blocking.",
   "Pressure on e5.",
   "Asking the bishop.",
   "Black takes e5, setting the trap.",
   "Greedy: White takes the bishop.",
   "Smothered mate! The king is boxed in."
  ],
  "criticalMoveIndex": 14,
  "safeMovesSan": [
   "Nxe5",
   "e3"
  ]
 },
 {
  "name": "Damiano Defense Trap",
  "category": "Damiano Defense",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "Black defends e5 with f6 and loses a rook.",
  "explanation": "2...f6? weakens the king. After 3.Nxe5! fxe5?? 4.Qh5+ White's queen picks up e5 with check and then the rook on h8.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "f6",
   "Nxe5",
   "fxe5",
   "Qh5+",
   "g6",
   "Qxe5+",
   "Qe7",
   "Qxh8"
  ],
  "moveNotes": [
   "Central pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "The Damiano: a poor way to defend e5.",
   "White sacrifices the knight!",
   "Taking is the mistake.",
   "Check!",
   "Blocking.",
   "Check, forking king and rook.",
   "Blocking.",
   "White takes the rook."
  ],
  "criticalMoveIndex": 5,
  "safeMovesSan": [
   "Qe7"
  ]
 },
 {
  "name": "Caro-Kann Smothered Mate",
  "category": "Caro-Kann Defense",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "A single knight move gives checkmate on move 6.",
  "explanation": "After 5.Qe2 the natural 5...Ngf6?? leaves the king with no squares: Nd6 is a smothered mate.",
  "trapLineSan": [
   "e4",
   "c6",
   "d4",
   "d5",
   "Nc3",
   "dxe4",
   "Nxe4",
   "Nd7",
   "Qe2",
   "Ngf6",
   "Nd6#"
  ],
  "moveNotes": [
   "King's pawn.",
   "The Caro-Kann.",
   "The center.",
   "Black strikes back.",
   "Development.",
   "Black takes.",
   "White recaptures.",
   "Development.",
   "The queen on e2 pins the e7 pawn.",
   "Natural, but it blocks the last escape square.",
   "Smothered mate!"
  ],
  "criticalMoveIndex": 9,
  "safeMovesSan": [
   "Ndf6",
   "e6"
  ]
 },
 {
  "name": "Petrov Queen Trap",
  "category": "Petrov Defense",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "Black copies White and loses the queen to a discovered check.",
  "explanation": "After 3...Nxe4? 4.Qe2! the knight must not retreat to f6: Nc6+ is a discovered check and the knight takes the queen.",
  "trapLineSan": [
   "e4",
   "e5",
   "Nf3",
   "Nf6",
   "Nxe5",
   "Nxe4",
   "Qe2",
   "Nf6",
   "Nc6+"
  ],
  "moveNotes": [
   "King's pawn.",
   "Black answers.",
   "Knight attacks e5.",
   "The Petrov.",
   "White takes.",
   "Copying White is a mistake here.",
   "The queen hits the e4 knight on the e-file.",
   "Retreating looks safe...",
   "Discovered check! The knight attacks the queen and the king is in check."
  ],
  "criticalMoveIndex": 7,
  "safeMovesSan": [
   "Qe7",
   "d5"
  ]
 },
 {
  "name": "Queen's Gambit Accepted Trap",
  "category": "Queen's Gambit Accepted",
  "difficulty": "beginner",
  "trapSide": "white",
  "summary": "Black clings to the extra pawn and loses the rook.",
  "explanation": "After 2...dxc4 3.e3 b5? 4.a4 c6 5.axb5 cxb5 the a8 rook is undefended: Qf3 forks it.",
  "trapLineSan": [
   "d4",
   "d5",
   "c4",
   "dxc4",
   "e3",
   "b5",
   "a4",
   "c6",
   "axb5",
   "cxb5",
   "Qf3"
  ],
  "moveNotes": [
   "Queen's pawn.",
   "Black mirrors.",
   "The Queen's Gambit.",
   "Black accepts.",
   "Opening the bishop's path to c4.",
   "Holding the pawn with ...b5 is the mistake.",
   "Attacking b5.",
   "Supporting b5.",
   "White takes.",
   "Recapturing.",
   "The queen hits a8: the rook falls."
  ],
  "criticalMoveIndex": 5,
  "safeMovesSan": [
   "Nf6",
   "e5",
   "e6",
   "Nc6"
  ]
 },
 {
  "name": "From's Gambit Trap",
  "category": "Bird's Opening",
  "difficulty": "beginner",
  "trapSide": "black",
  "summary": "White makes one careless pawn move and gets mated on g3.",
  "explanation": "In the From's Gambit, after 4...g5 the h2-e5 diagonal is open: 5.h3?? Bg3# is checkmate.",
  "trapLineSan": [
   "f4",
   "e5",
   "fxe5",
   "d6",
   "exd6",
   "Bxd6",
   "Nf3",
   "g5",
   "h3",
   "Bg3#"
  ],
  "moveNotes": [
   "Bird's Opening.",
   "From's Gambit: a pawn for an attack.",
   "White takes.",
   "Black gives another pawn.",
   "White takes again.",
   "The bishop aims at h2.",
   "Development.",
   "Threatening ...g4.",
   "A natural move, and a blunder.",
   "Checkmate!"
  ],
  "criticalMoveIndex": 8,
  "safeMovesSan": [
   "d4",
   "g3",
   "Nc3",
   "e4"
  ]
 }
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export async function seedTraps(): Promise<void> {
  try {
    const have = await db.select({ name: chessTrapsTable.name, line: chessTrapsTable.trapLineSan, order: chessTrapsTable.orderIndex }).from(chessTrapsTable);
    const names = new Set(have.map((h) => norm(h.name)));
    const lines = new Set(have.map((h) => (Array.isArray(h.line) ? h.line.join(" ") : "")));
    let order = Math.max(0, ...have.map((h) => h.order ?? 0));
    const add = TRAPS.filter((t) => !names.has(norm(t.name)) && !lines.has(t.trapLineSan.join(" ")));
    for (const t of add) {
      await db.insert(chessTrapsTable).values({ ...t, startingFen: START, orderIndex: ++order });
    }
    if (add.length) logger.info({ added: add.map((t) => t.name) }, "[traps] added new traps");
  } catch (err) {
    logger.warn({ err }, "[traps] seeding failed");
  }
}
