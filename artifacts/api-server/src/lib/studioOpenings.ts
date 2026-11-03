// Content Studio: opening clips. Each opening has a main line, the ideas behind
// it and its main variations (the different ways the other side can answer).
// The clip adds real numbers from games in the database (how often each reply
// is played and how it scores) and Stockfish's view of every option, plus a
// trap in the opening when one is in the trap library.
import { Chess } from "chess.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

interface Variation { name: string; short: string; moves: string[]; note: string }
interface OpeningDef {
  id: string; name: string; side: "white" | "black"; line: string[]; hook: string; ideas: string[];
  /** ILIKE patterns for games.opening, to find real games in this opening. */
  match: string[];
  lines: Variation[];
}

const sp = (s: string) => s.trim().split(/\s+/);

export const STUDIO_OPENINGS: OpeningDef[] = [
  {
    id: "ruy-lopez", name: "Ruy Lopez", side: "white", line: sp("e4 e5 Nf3 Nc6 Bb5"), hook: "The Ruy Lopez: over 450 years old and still winning",
    ideas: ["The bishop hits the knight that defends e5", "White castles fast, then builds c3 and d4", "A long, slow squeeze rather than a quick attack"],
    match: ["%ruy lopez%", "%spanish%"],
    lines: [
      { name: "Morphy Defense", short: "Morphy", moves: sp("a6 Ba4 Nf6 O-O Be7"), note: "Black asks the bishop where it's going. The main line for a reason." },
      { name: "Berlin Defense", short: "Berlin", moves: sp("Nf6 O-O Nxe4 d4 Nd6"), note: "The 'Berlin Wall': Black grabs e4 and heads for a rock-solid endgame." },
      { name: "Exchange Variation", short: "Exchange", moves: sp("a6 Bxc6 dxc6 O-O f6"), note: "White gives up the bishop to wreck Black's pawns." },
      { name: "Schliemann Gambit", short: "Schliemann", moves: sp("f5 Nc3 fxe4 Nxe4"), note: "Black hits back with f5. Sharp and risky for both sides." },
    ],
  },
  {
    id: "italian", name: "Italian Game", side: "white", line: sp("e4 e5 Nf3 Nc6 Bc4"), hook: "The Italian Game: aim straight at f7",
    ideas: ["The bishop targets f7, the weakest square near Black's king", "Fast development and early castling", "c3 and d4 to take the center"],
    match: ["%italian%", "%giuoco%", "%two knights%", "%evans%"],
    lines: [
      { name: "Giuoco Piano", short: "Piano", moves: sp("Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+"), note: "The 'quiet game' that gets loud fast once d4 lands." },
      { name: "Two Knights Defense", short: "Two Knights", moves: sp("Nf6 Ng5 d5 exd5 Na5"), note: "Black counterattacks e4. Ng5 goes straight for f7!" },
      { name: "Evans Gambit", short: "Evans", moves: sp("Bc5 b4 Bxb4 c3 Ba5"), note: "White throws in a pawn for a huge center and fast attack." },
      { name: "Giuoco Pianissimo", short: "Pianissimo", moves: sp("Bc5 c3 Nf6 d3 d6"), note: "The slow, modern way: maneuver first, strike later." },
    ],
  },
  {
    id: "sicilian", name: "Sicilian Defense", side: "black", line: sp("e4 c5"), hook: "The Sicilian: Black's most dangerous answer to 1.e4",
    ideas: ["Black fights for d4 from the side instead of copying White", "Unbalanced positions: both sides play to win", "Black often attacks on the queenside while White goes for the king"],
    match: ["%sicilian%"],
    lines: [
      { name: "Open Sicilian · Najdorf", short: "Najdorf", moves: sp("Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"), note: "Fischer's and Kasparov's favourite. Sharp, deep and dangerous." },
      { name: "Open Sicilian · Dragon", short: "Dragon", moves: sp("Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6"), note: "The bishop on g7 breathes fire down the long diagonal." },
      { name: "Alapin", short: "Alapin", moves: sp("c3 d5 exd5 Qxd5 d4"), note: "White's anti-Sicilian: c3 to build a full center." },
      { name: "Smith-Morra Gambit", short: "Morra", moves: sp("d4 cxd4 c3 dxc3 Nxc3"), note: "White gives a pawn for fast development and open lines." },
    ],
  },
  {
    id: "french", name: "French Defense", side: "black", line: sp("e4 e6 d4 d5"), hook: "The French Defense: solid, tricky, and full of counterpunches",
    ideas: ["Black challenges e4 straight away with d5", "A solid pawn chain, at the cost of the light-squared bishop", "Black's counterplay comes with ...c5 and ...f6"],
    match: ["%french%"],
    lines: [
      { name: "Advance Variation", short: "Advance", moves: sp("e5 c5 c3 Nc6 Nf3"), note: "White grabs space. Black attacks the base of the chain with c5." },
      { name: "Exchange Variation", short: "Exchange", moves: sp("exd5 exd5 Bd3 Bd6"), note: "Symmetrical and calm. The bishop problem disappears." },
      { name: "Winawer", short: "Winawer", moves: sp("Nc3 Bb4 e5 c5 a3"), note: "Black pins the knight. One of the sharpest lines in chess." },
      { name: "Tarrasch", short: "Tarrasch", moves: sp("Nd2 c5 exd5 exd5"), note: "Nd2 avoids the pin and keeps things flexible." },
    ],
  },
  {
    id: "caro-kann", name: "Caro-Kann Defense", side: "black", line: sp("e4 c6 d4 d5"), hook: "The Caro-Kann: the rock-solid answer to 1.e4",
    ideas: ["Black supports d5 with the c-pawn", "Unlike the French, the light-squared bishop gets out", "Very solid structure: hard to crack"],
    match: ["%caro%"],
    lines: [
      { name: "Advance Variation", short: "Advance", moves: sp("e5 Bf5 Nf3 e6 Be2"), note: "White grabs space; Black gets the bishop out first." },
      { name: "Classical", short: "Classical", moves: sp("Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6"), note: "The bishop develops before e6 locks it in." },
      { name: "Exchange Variation", short: "Exchange", moves: sp("exd5 cxd5 Bd3 Nc6 c3"), note: "A quiet, symmetrical structure with long-term plans." },
      { name: "Panov Attack", short: "Panov", moves: sp("exd5 cxd5 c4 Nf6 Nc3"), note: "White plays c4 for an isolated pawn and active pieces." },
    ],
  },
  {
    id: "queens-gambit", name: "Queen's Gambit", side: "white", line: sp("d4 d5 c4"), hook: "The Queen's Gambit: give a pawn, take the center",
    ideas: ["White offers the c-pawn to pull Black's d-pawn away from the center", "It isn't a real gambit: White usually wins the pawn back", "Long-term pressure on the queenside"],
    match: ["%queen%s gambit%", "%slav%", "%albin%"],
    lines: [
      { name: "Declined (QGD)", short: "QGD", moves: sp("e6 Nc3 Nf6 Bg5 Be7"), note: "Black holds d5 with e6. Classical and rock solid." },
      { name: "Accepted (QGA)", short: "QGA", moves: sp("dxc4 Nf3 Nf6 e3 e6 Bxc4"), note: "Black takes the pawn, then gives it back for free development." },
      { name: "Slav Defense", short: "Slav", moves: sp("c6 Nf3 Nf6 Nc3 dxc4"), note: "Support d5 with the c-pawn and keep the bishop free." },
      { name: "Albin Countergambit", short: "Albin", moves: sp("e5 dxe5 d4"), note: "Black gambits back! Watch out for the Lasker trap." },
    ],
  },
  {
    id: "london", name: "London System", side: "white", line: sp("d4 d5 Bf4"), hook: "The London System: one setup against everything",
    ideas: ["The same setup every game: d4, Bf4, e3, Nf3, c3", "Very little theory to learn", "A solid position where White picks the moment to attack"],
    match: ["%london%"],
    lines: [
      { name: "Main line", short: "Main", moves: sp("Nf6 e3 e6 Nf3 c5 c3"), note: "Black challenges with c5; White keeps the solid triangle." },
      { name: "Early ...c5", short: "...c5", moves: sp("c5 e3 Nc6 c3 Qb6"), note: "Black hits b2 straight away. Know the answer: Qb3 or Qc1." },
      { name: "...e6 then ...Bd6", short: "...Bd6", moves: sp("e6 e3 Bd6 Bg3"), note: "Black plays ...e6 and ...Bd6 to trade off White's best bishop; White keeps it with Bg3." },
      { name: "Mirror ...Bf5", short: "...Bf5", moves: sp("Bf5 e3 e6 Nf3 Nf6"), note: "Black copies White's plan. Calm and symmetrical." },
    ],
  },
  {
    id: "kings-indian", name: "King's Indian Defense", side: "black", line: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6"), hook: "The King's Indian: let White take the center, then attack the king",
    ideas: ["Black lets White build a big center on purpose", "Then strikes back with e5 or c5", "Opposite-side attacks: White on the queenside, Black on the king"],
    match: ["%king%s indian defense%", "%king%s indian defence%"],
    lines: [
      { name: "Classical", short: "Classical", moves: sp("Nf3 O-O Be2 e5 O-O Nc6"), note: "The main battleground. Black's ...f5 push is coming." },
      { name: "Sämisch", short: "Sämisch", moves: sp("f3 O-O Be3 e5 d5"), note: "White builds a wall and may castle queenside to attack." },
      { name: "Four Pawns Attack", short: "Four Pawns", moves: sp("f4 O-O Nf3 c5 d5"), note: "White grabs everything. Black has to hit back fast." },
      { name: "Averbakh", short: "Averbakh", moves: sp("Be2 O-O Bg5 c5"), note: "Bg5 makes ...e5 awkward, so Black strikes with ...c5 instead." },
    ],
  },
  {
    id: "scandinavian", name: "Scandinavian Defense", side: "black", line: sp("e4 d5 exd5"), hook: "The Scandinavian: hit e4 on move one",
    ideas: ["Black attacks e4 straight away", "The queen comes out early, so watch the tempo", "A simple structure that's easy to learn"],
    match: ["%scandinavian%", "%center counter%"],
    lines: [
      { name: "Main line ...Qa5", short: "...Qa5", moves: sp("Qxd5 Nc3 Qa5 d4 Nf6"), note: "The queen steps aside to a5 and pins the knight." },
      { name: "Modern ...Nf6", short: "...Nf6", moves: sp("Nf6 d4 Nxd5 Nf3 g6"), note: "Black takes back with the knight instead of the queen." },
      { name: "...Qd6 line", short: "...Qd6", moves: sp("Qxd5 Nc3 Qd6 d4 Nf6"), note: "The modern favourite: the queen sits safely on d6." },
      { name: "Icelandic Gambit", short: "Icelandic", moves: sp("Nf6 c4 e6 dxe6 Bxe6"), note: "Black gives a pawn for fast, aggressive development." },
    ],
  },
  {
    id: "vienna", name: "Vienna Game", side: "white", line: sp("e4 e5 Nc3"), hook: "The Vienna Game: the sneaky way to attack",
    ideas: ["The knight goes to c3 first, keeping f4 ready", "f4 opens the f-file for a kingside attack", "Lots of traps for unprepared opponents"],
    match: ["%vienna%"],
    lines: [
      { name: "Vienna Gambit", short: "Gambit", moves: sp("Nf6 f4 d5 fxe5 Nxe4"), note: "White plays f4 anyway. Black hits back in the center." },
      { name: "...Nc6 with Bc4", short: "...Nc6", moves: sp("Nc6 Bc4 Nf6 d3 Bc5"), note: "A calm Italian-style setup with f4 still in reserve." },
      { name: "Frankenstein-Dracula", short: "Frankenstein", moves: sp("Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3"), note: "Wild! Black grabs e4 and White goes straight for mate." },
      { name: "...Bc5", short: "...Bc5", moves: sp("Bc5 Nf3 d6 d4 exd4"), note: "Black develops the bishop first; White opens the center." },
    ],
  },
  {
    id: "kings-gambit", name: "King's Gambit", side: "white", line: sp("e4 e5 f4"), hook: "The King's Gambit: the most romantic opening in chess",
    ideas: ["White offers the f-pawn to rip open the f-file", "Pure aggression: White wants Black's king", "Black can take the pawn, decline it or hit back"],
    match: ["%king%s gambit%"],
    lines: [
      { name: "Accepted · Kieseritzky", short: "Kieseritzky", moves: sp("exf4 Nf3 g5 h4 g4 Ne5"), note: "Black hangs on to the pawn. Chaos follows." },
      { name: "Accepted · Modern", short: "Modern", moves: sp("exf4 Nf3 d5 exd5 Nf6"), note: "Black gives the pawn back for quick development." },
      { name: "Declined · ...Bc5", short: "Declined", moves: sp("Bc5 Nf3 d6 c3"), note: "The bishop stops White castling on the kingside for a while." },
      { name: "Falkbeer Countergambit", short: "Falkbeer", moves: sp("d5 exd5 e4"), note: "Black answers a gambit with a gambit!" },
    ],
  },
  {
    id: "scotch", name: "Scotch Game", side: "white", line: sp("e4 e5 Nf3 Nc6 d4 exd4 Nxd4"), hook: "The Scotch: open the center on move three",
    ideas: ["White opens the center straight away", "Open lines and quick piece play", "Kasparov brought it back at the very top"],
    match: ["%scotch%"],
    lines: [
      { name: "Mieses ...Nf6", short: "Mieses", moves: sp("Nf6 Nxc6 bxc6 e5 Qe7"), note: "Black hits e4; White chases the knight away." },
      { name: "Classical ...Bc5", short: "...Bc5", moves: sp("Bc5 Be3 Qf6 c3 Nge7"), note: "Black piles up on the d4 knight." },
      { name: "Steinitz ...Qh4", short: "Steinitz", moves: sp("Qh4 Nc3 Bb4 Be2"), note: "The queen attacks e4 at once. Bold and risky." },
      { name: "Trade ...Nxd4", short: "...Nxd4", moves: sp("Nxd4 Qxd4 d6"), note: "Black trades knights. White's queen sits proudly in the center." },
    ],
  },
  {
    id: "english", name: "English Opening", side: "white", line: sp("c4"), hook: "The English Opening: control the center from the side",
    ideas: ["White grabs d5 with the c-pawn", "Very flexible: it can turn into a Queen's Gambit or a reversed Sicilian", "Long, strategic games"],
    match: ["%english%"],
    lines: [
      { name: "Reversed Sicilian ...e5", short: "...e5", moves: sp("e5 Nc3 Nf6 g3 d5"), note: "A Sicilian with colours reversed and an extra move for White." },
      { name: "Symmetrical ...c5", short: "...c5", moves: sp("c5 Nc3 Nc6 g3 g6 Bg2 Bg7"), note: "Black copies everything. Perfectly balanced." },
      { name: "Anglo-Indian ...Nf6", short: "...Nf6", moves: sp("Nf6 Nc3 e6 Nf3 d5"), note: "Black stays flexible, ready for a Queen's Gambit setup." },
      { name: "...e6 and ...d5", short: "...e6", moves: sp("e6 Nc3 d5 d4 Nf6"), note: "Straight into a Queen's Gambit Declined." },
    ],
  },
  {
    id: "nimzo", name: "Nimzo-Indian Defense", side: "black", line: sp("d4 Nf6 c4 e6 Nc3 Bb4"), hook: "The Nimzo-Indian: pin the knight, own e4",
    ideas: ["The bishop pins the c3 knight to fight for e4", "Black often gives up the bishop to double White's pawns", "One of the most respected defenses in chess"],
    match: ["%nimzo-indian%", "%nimzo indian%"],
    lines: [
      { name: "Rubinstein", short: "Rubinstein", moves: sp("e3 O-O Bd3 d5 Nf3 c5"), note: "White develops calmly and keeps the structure healthy." },
      { name: "Classical", short: "Classical", moves: sp("Qc2 O-O a3 Bxc3+ Qxc3"), note: "Qc2 means White can recapture without doubled pawns." },
      { name: "Sämisch", short: "Sämisch", moves: sp("a3 Bxc3+ bxc3 c5"), note: "White takes the doubled pawns in exchange for the bishop pair." },
      { name: "Kasparov", short: "Kasparov", moves: sp("Nf3 c5 g3 cxd4 Nxd4"), note: "A fianchetto setup Kasparov made famous." },
    ],
  },
  {
    id: "dutch", name: "Dutch Defense", side: "black", line: sp("d4 f5"), hook: "The Dutch Defense: fight for e4 and go for the king",
    ideas: ["Black grabs e4 with the f-pawn", "Kingside attacking chances from move one", "Unbalanced from the start"],
    match: ["%dutch%"],
    lines: [
      { name: "Leningrad", short: "Leningrad", moves: sp("g3 Nf6 Bg2 g6 Nf3 Bg7"), note: "Black fianchettoes, a King's Indian with f5 thrown in." },
      { name: "Stonewall", short: "Stonewall", moves: sp("c4 Nf6 g3 e6 Bg2 d5"), note: "A wall of pawns on c6, d5, e6 and f5." },
      { name: "Staunton Gambit", short: "Staunton", moves: sp("e4 fxe4 Nc3 Nf6 Bg5"), note: "White punishes f5 with a gambit of its own." },
      { name: "Classical", short: "Classical", moves: sp("c4 Nf6 g3 e6 Bg2 Be7"), note: "Flexible: Black keeps the d-pawn's options open." },
    ],
  },
  {
    id: "pirc", name: "Pirc Defense", side: "black", line: sp("e4 d6 d4 Nf6 Nc3 g6"), hook: "The Pirc: let White overextend, then strike",
    ideas: ["Black lets White build a big center", "The bishop on g7 hits it from far away", "Counterattacks with ...c5 or ...e5"],
    match: ["%pirc%"],
    lines: [
      { name: "Austrian Attack", short: "Austrian", moves: sp("f4 Bg7 Nf3 O-O"), note: "White grabs even more space with f4: all-out aggression." },
      { name: "Classical", short: "Classical", moves: sp("Nf3 Bg7 Be2 O-O O-O"), note: "Calm development; White keeps a small edge." },
      { name: "150 Attack", short: "150 Attack", moves: sp("Be3 Bg7 Qd2 c6 f3"), note: "Be3 and Qd2, then Bh6 to trade Black's best bishop." },
      { name: "Byrne", short: "Byrne", moves: sp("Bg5 Bg7 Qd2 h6 Bh4"), note: "Bg5 hits the f6 knight and prepares a queenside castle." },
    ],
  },
];

// ── Why each line works (for the one-video-per-line clips) ────────────────
// Keyed "<opening id>|<line name>". Plain, well-established ideas only.
const LINE_WHY: Record<string, string[]> = {
  "ruy-lopez|Morphy Defense": ["...a6 makes the bishop decide: take on c6 or step back", "After Ba4 the pin on c6 stays, but Black can break it any time with ...b5", "Black develops calmly with ...Nf6 and ...Be7 and gets ready to castle"],
  "ruy-lopez|Berlin Defense": ["Black ignores the threat to e5 and counterattacks e4 instead", "After ...Nxe4 and d4, the knight drops to d6 and hits the bishop on b5", "It often heads for the queenless 'Berlin endgame', famously hard to beat"],
  "ruy-lopez|Exchange Variation": ["Bxc6 gives up the bishop to leave Black with doubled c-pawns", "White's healthy kingside pawns make many endgames good for White", "In return Black gets the bishop pair; ...f6 shores up the e5 pawn"],
  "ruy-lopez|Schliemann Gambit": ["...f5 hits e4 straight away, a King's Gambit with colours reversed", "Black wants the f-file open toward White's king", "Nc3 develops and defends; after ...fxe4 Nxe4 White's knight is very active"],
  "italian|Giuoco Piano": ["c3 prepares d4 to build a big pawn center", "After cxd4, ...Bb4+ checks to break up that center", "Both sides get open lines and quick piece play"],
  "italian|Two Knights Defense": ["...Nf6 counterattacks e4 instead of copying White", "Ng5 lines up with the bishop on f7", "...d5 blocks the bishop, then ...Na5 chases it: a pawn down, but active"],
  "italian|Evans Gambit": ["b4 offers a pawn to pull the bishop off c5", "c3 gains time on the bishop and prepares d4", "White gets a big center and fast development for the pawn"],
  "italian|Giuoco Pianissimo": ["d3 instead of d4: e4 stays solid and nothing gets traded early", "Both sides develop fully before any pawn breaks", "White usually builds up slowly with Re1, h3 and a knight reroute"],
  "sicilian|Open Sicilian · Najdorf": ["...a6 keeps White's knights and bishops off b5", "It keeps Black flexible: ...e5 or ...e6 can come next", "Black's queenside play starts with ...b5"],
  "sicilian|Open Sicilian · Dragon": ["...g6 and ...Bg7 aim the bishop down the long diagonal", "Black castles kingside and attacks down the c-file", "White often answers with Be3, Qd2 and a kingside pawn storm"],
  "sicilian|Alapin": ["c3 prepares d4, so White can recapture with a pawn", "...d5 hits e4 at once; with no knight on c3, the queen is safe on d5", "White gets a solid center, Black gets easy development"],
  "sicilian|Smith-Morra Gambit": ["White gives up the d-pawn, then the c-pawn", "Nc3 develops with tempo and the c- and d-files open up", "Black is a pawn up but has to survive the fast attack"],
  "french|Advance Variation": ["e5 grabs space and cramps Black's kingside", "...c5 attacks the base of White's pawn chain on d4", "...Nc6 adds pressure on d4; c3 and Nf3 hold it"],
  "french|Exchange Variation": ["exd5 exd5 makes the pawns symmetrical", "Black's light-squared bishop is no longer stuck behind e6", "Quiet, level positions where the better plan wins"],
  "french|Winawer": ["...Bb4 pins the c3 knight, so e4 is harder to hold", "e5 grabs space and ...c5 hits d4 straight back", "a3 asks the bishop to take on c3: doubled pawns for White, but the bishop pair"],
  "french|Tarrasch": ["Nd2 defends e4 without allowing the ...Bb4 pin", "...c5 strikes the center straight away", "Black often ends up with an isolated d-pawn: active pieces against a long-term weakness"],
  "caro-kann|Advance Variation": ["e5 grabs space, but Black's bishop gets out to f5 first", "...e6 then builds a solid chain without locking the bishop in", "Black's counterplay comes later with ...c5"],
  "caro-kann|Classical": ["Nc3 and dxe4 open the center", "...Bf5 develops the bishop with tempo on the e4 knight", "Ng3 chases it to g6, where it still sits outside the pawn chain"],
  "caro-kann|Exchange Variation": ["exd5 cxd5 makes a symmetrical structure", "Bd3 covers f5, so Black's bishop can't easily develop there", "c3 supports d4: a calm game with long-term plans"],
  "caro-kann|Panov Attack": ["c4 attacks d5 straight away, like a Queen's Gambit", "White often gets an isolated d-pawn but very active pieces", "Sharp and open, far from the usual quiet Caro-Kann"],
  "queens-gambit|Declined (QGD)": ["...e6 keeps the d5 pawn solidly defended", "Bg5 pins the f6 knight, which guards d5", "...Be7 breaks the pin and Black gets ready to castle"],
  "queens-gambit|Accepted (QGA)": ["...dxc4 takes the pawn but gives up the center", "Nf3 and e3 prepare to win it back with the bishop", "After Bxc4 material is level and White's bishop is active"],
  "queens-gambit|Slav Defense": ["...c6 defends d5 without blocking the light-squared bishop", "...dxc4 grabs the pawn once White can't simply win it back", "White usually plays a4 to stop ...b5 holding on to it"],
  "queens-gambit|Albin Countergambit": ["...e5 offers a pawn to hit White's center", "After dxe5 d4, the pawn on d4 cramps White", "One careless move like e3 can lose to the Lasker trap"],
  "london|Main line": ["e3 and Nf3 build the London setup around the f4 bishop", "...c5 attacks d4 from the side", "c3 supports d4 so the structure holds"],
  "london|Early ...c5": ["...c5 and ...Nc6 put early pressure on d4", "...Qb6 hits b2, which the f4 bishop no longer guards", "Qb3 or Qc1 defends it"],
  "london|...e6 then ...Bd6": ["...e6 and ...Bd6 offer to trade off White's best bishop", "Bg3 keeps it; if Black takes, hxg3 opens the h-file for White", "Keeping that bishop is the whole point of the London"],
  "london|Mirror ...Bf5": ["Black copies the plan: ...Bf5 before ...e6", "Both sides have the same solid setup", "Small edges decide, like who gets c4 or c5 in first"],
  "kings-indian|Classical": ["White develops normally and castles", "...e5 hits d4 and ...Nc6 adds more pressure", "Usually White plays d5 and the race begins: White on the queenside, Black with ...f5"],
  "kings-indian|Sämisch": ["f3 supports e4 and keeps Black's pieces off g4", "Be3 and Qd2 can lead to a queenside castle and an h4 pawn storm", "Black strikes back with ...e5 or ...c5"],
  "kings-indian|Four Pawns Attack": ["c4, d4, e4 and f4: White grabs the whole center", "...c5 hits it before White finishes developing", "If Black waits, White's pawns roll forward"],
  "kings-indian|Averbakh": ["Be2 and Bg5 make the ...e5 push awkward", "Black strikes with ...c5 instead", "A positional line, slower than most King's Indians"],
  "scandinavian|Main line ...Qa5": ["Qxd5 wins the pawn back at once", "Nc3 gains time on the queen, which steps to a5", "From a5 the queen pins the c3 knight once d4 is played"],
  "scandinavian|Modern ...Nf6": ["...Nf6 wins the pawn back with the knight, not the queen", "No early queen for White to chase around", "...g6 prepares a fianchetto and fast castling"],
  "scandinavian|...Qd6 line": ["Qxd5, then the queen drops back to d6", "On d6 it's hard for White's pieces to hit", "A very popular modern way to play the Scandinavian"],
  "scandinavian|Icelandic Gambit": ["...Nf6 and ...e6: Black gives up a pawn", "After dxe6 Bxe6 Black has fast, active development", "White's c4 push leaves the d4 square weak"],
  "vienna|Vienna Gambit": ["f4 opens the f-file for White's attack", "...d5 hits back in the center instead of taking", "After fxe5 Nxe4 Black's knight is very active"],
  "vienna|...Nc6 with Bc4": ["Bc4 aims at f7, like an Italian Game", "d3 keeps e4 solid", "White keeps f4 in reserve for later"],
  "vienna|Frankenstein-Dracula": ["Black grabs e4 with the knight", "Qh5 threatens mate on f7", "...Nd6 guards f7 and hits the bishop; Bb3 keeps it on the diagonal"],
  "vienna|...Bc5": ["...Bc5 gets the bishop out first", "Nf3 and d4 open the center", "After ...exd4 White's pieces get open lines"],
  "kings-gambit|Accepted · Kieseritzky": ["...exf4 takes the pawn and ...g5 tries to keep it", "h4 attacks Black's pawn chain at once", "After ...g4 the knight jumps to e5, a strong square"],
  "kings-gambit|Accepted · Modern": ["...exf4, then ...d5 gives a pawn back to open the center", "Black develops fast with ...Nf6", "Usually safer for Black than hanging on to the pawn"],
  "kings-gambit|Declined · ...Bc5": ["...Bc5 aims at g1 and makes kingside castling hard for White", "fxe5 now would lose to ...Qh4+", "c3 prepares d4 to kick the bishop"],
  "kings-gambit|Falkbeer Countergambit": ["...d5 answers White's gambit with one of Black's own", "After exd5 e4, the e4 pawn cramps White", "Black gets fast development for the pawn"],
  "scotch|Mieses ...Nf6": ["...Nf6 attacks e4", "Nxc6 bxc6, then e5 kicks the knight", "...Qe7 pins the e5 pawn to White's king"],
  "scotch|Classical ...Bc5": ["...Bc5 attacks the d4 knight", "Be3 defends it and ...Qf6 hits it again", "c3 adds more support while Black develops with ...Nge7"],
  "scotch|Steinitz ...Qh4": ["...Qh4 attacks e4 right away", "Nc3 defends, and ...Bb4 pins that knight", "Be2 develops: Black's early queen can become a target"],
  "scotch|Trade ...Nxd4": ["...Nxd4 trades knights", "Qxd4 puts White's queen in the center", "...d6 frees Black's bishop, but White keeps the lead in development"],
  "english|Reversed Sicilian ...e5": ["...e5 makes it a Sicilian with colours reversed", "White has a whole extra move compared with a normal Sicilian", "g3 and Bg2 aim the bishop down the long diagonal at d5"],
  "english|Symmetrical ...c5": ["Black copies White move for move", "Both bishops end up on the long diagonals", "Whoever breaks the symmetry best gets the edge"],
  "english|Anglo-Indian ...Nf6": ["...Nf6 and ...e6 keep Black flexible", "...d5 can turn it into a Queen's Gambit", "White chooses between d4 and staying in English territory"],
  "english|...e6 and ...d5": ["...e6 and ...d5 aim for a solid center", "After d4 it's a Queen's Gambit Declined", "A good choice if you already play the QGD as Black"],
  "nimzo|Rubinstein": ["e3 develops calmly and keeps the pawns healthy", "Bd3 and Nf3 come next, then castling", "...d5 and ...c5 fight for the center"],
  "nimzo|Classical": ["Qc2 means the queen can recapture on c3: no doubled pawns", "a3 makes the bishop decide", "White gets the bishop pair; Black gets a lead in development"],
  "nimzo|Sämisch": ["a3 forces ...Bxc3+ straight away", "bxc3 gives White doubled pawns but the bishop pair", "...c5 starts Black's play against those doubled pawns"],
  "nimzo|Kasparov": ["Nf3 and g3: a fianchetto setup", "...c5 strikes d4 straight away", "After ...cxd4 Nxd4 the game is open and dynamic"],
  "dutch|Leningrad": ["...g6 and ...Bg7 put the bishop on the long diagonal", "A King's Indian setup with ...f5 already played", "Black often plans ...e5 later"],
  "dutch|Stonewall": ["...e6 and ...d5 build a wall on d5, e6 and f5", "A strong grip on the e4 square", "The cost: a hole on e5 and a passive light-squared bishop"],
  "dutch|Staunton Gambit": ["e4 offers a pawn to break up Black's ...f5", "Nc3 and Bg5 develop fast and hit the f6 knight", "Black's king can get exposed"],
  "dutch|Classical": ["...e6 and ...Be7: a flexible setup", "Black keeps the choice of ...d6 or ...d5 for later", "A classic plan is ...Qe8 and ...Qh5 toward White's king"],
  "pirc|Austrian Attack": ["f4 builds a huge center: e4, d4 and f4", "White wants to push e5 and attack", "Black castles fast and hits the center with ...c5 or ...e5"],
  "pirc|Classical": ["Nf3, Be2 and castling: calm development", "White keeps a small space edge", "Black's counterplay comes with ...e5, or ...c6 and ...b5"],
  "pirc|150 Attack": ["Be3 and Qd2 aim for Bh6 to trade Black's best bishop", "f3 supports e4", "White often castles queenside and storms with h4"],
  "pirc|Byrne": ["Bg5 hits the f6 knight", "Qd2 prepares queenside castling", "...h6 asks the bishop; Bh4 keeps it on the diagonal"],
};

// ── Next moves from real games ─────────────────────────────────────────────
function sanTokens(pgn: string): string[] {
  return pgn.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " ").replace(/\$\d+/g, " ")
    .split(/\s+/).map((t) => t.replace(/^\d+\.+/, "")).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}
const posKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

interface Tally { games: number; white: number; draw: number; black: number; next: Map<string, { games: number; white: number; draw: number; black: number }>; conts: { m: string[]; out: "white" | "draw" | "black" }[] }
async function tallyAt(def: OpeningDef, keyFen: string): Promise<Tally> {
  const t: Tally = { games: 0, white: 0, draw: 0, black: 0, next: new Map(), conts: [] };
  const cond = sql.join(def.match.map((m) => sql`g.opening ILIKE ${m}`), sql` OR `);
  const rows = rowsOf<{ pgn: string }>(await db.execute(sql`
    SELECT g.pgn FROM games g WHERE (${cond}) AND g.pgn IS NOT NULL AND g.pgn NOT LIKE '%[FEN %' AND g.platform IS DISTINCT FROM 'bot'
    ORDER BY g.id DESC LIMIT 2500`));
  const want = posKey(keyFen);
  let n = 0;
  for (const r of rows) {
    const res = r.pgn.match(/\[Result "([^"]+)"\]/)?.[1];
    const out = res === "1-0" ? "white" : res === "0-1" ? "black" : res === "1/2-1/2" ? "draw" : null;
    if (!out) continue;
    try {
      const c = new Chess();
      const mv = sanTokens(r.pgn);
      for (let i = 0; i < Math.min(mv.length, 24); i++) {
        if (posKey(c.fen()) === want) {
          t.games++; t[out]++;
          const nx = mv[i] ? c.move(mv[i])?.san : null;
          if (nx) { const e = t.next.get(nx) ?? { games: 0, white: 0, draw: 0, black: 0 }; e.games++; e[out]++; t.next.set(nx, e); }
          // The next few moves too, to tell lines that start with the same move apart.
          const cont: string[] = nx ? [nx] : [];
          for (let j = i + 1; nx && j < Math.min(mv.length, i + 8); j++) { try { const m2 = c.move(mv[j]); if (!m2) break; cont.push(m2.san); } catch { break; } }
          t.conts.push({ m: cont, out });
          break;
        }
        c.move(mv[i]);
      }
    } catch { /* bad pgn */ }
    // Plenty for the percentages; stops early so a popular opening builds fast.
    if (t.games >= 1500) break;
    if (++n % 100 === 0) await new Promise((res) => setImmediate(res));
  }
  return t;
}

// ── Building a clip ────────────────────────────────────────────────────────
export interface StudioOpeningData {
  id: string; name: string; side: "white" | "black"; hook: string; ideas: string[]; line: string[];
  games: number; results: { white: number; draw: number; black: number } | null;
  /** Replies at the key position: how often they're played, how they score, Stockfish (White's view, pawns). */
  /** lines: indexes of the variations that start with this move. */
  options: { san: string; pct: number | null; games: number; scorePct: number | null; eval: number | null; lines: number[] }[];
  /** why: the ideas behind the line; whiteScore: how White scores in games that went into it;
   *  next: Stockfish's best move at the end of the line. */
  lines: { name: string; short: string; moves: string[]; note: string; pct: number | null; eval: number | null; why: string[]; games: number; whiteScore: number | null; next: { san: string; eval: number | null } | null }[];
  trap: { name: string; moves: string[]; notes: string[]; critical: number; summary: string } | null;
}

const cache = new Map<string, { at: number; data: StudioOpeningData }>();

/** White's-view evaluation in pawns of the best move in a position (null if the engine is busy). */
async function evalOf(fen: string): Promise<{ best: number | null; bestSan?: string; moves: Map<string, number> }> {
  const { exploreAllMoves } = await import("./engineAnalysis");
  try {
    const r = await exploreAllMoves(fen);
    const sign = r.turn === "w" ? 1 : -1;
    const toPawns = (m: { cp: number | null; mate: number | null }) => (m.mate != null ? sign * (m.mate > 0 ? 99 : -99) : m.cp != null ? Math.round(sign * m.cp) / 100 : null);
    const moves = new Map<string, number>();
    let best: number | null = null; let bestSide = -Infinity; let bestSan: string | undefined;
    for (const m of r.moves) {
      const v = toPawns(m); if (v == null) continue;
      moves.set(m.san, v);
      const forMover = v * sign;
      if (forMover > bestSide) { bestSide = forMover; best = v; bestSan = m.san; }
    }
    return { best, bestSan, moves };
  } catch (err) {
    logger.warn({ err }, "[studio] opening eval failed");
    return { best: null, moves: new Map() };
  }
}

const CACHE_MS = 6 * 60 * 60 * 1000;
/** Openings being built right now: a second request (a retry) waits for the same build. */
const building = new Map<string, Promise<StudioOpeningData | null>>();
/** Stockfish gets this long in total per opening; lines after that show without an engine number. */
const ENGINE_BUDGET_MS = 18_000;
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
const NO_EVAL: { best: number | null; bestSan?: string; moves: Map<string, number> } = { best: null, moves: new Map<string, number>() };

export async function studioOpening(id: string): Promise<StudioOpeningData | null> {
  const def = STUDIO_OPENINGS.find((o) => o.id === id);
  if (!def) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  let p = building.get(id);
  if (!p) {
    p = buildOpening(def).finally(() => building.delete(id));
    building.set(id, p);
  }
  return p;
}

/** Builds every opening that isn't cached, one at a time, in the background (so they open instantly in the Studio). */
let warming = false;
export function warmStudioOpenings(): void {
  if (warming) return;
  warming = true;
  void (async () => {
    try {
      for (const o of STUDIO_OPENINGS) {
        const hit = cache.get(o.id);
        if (hit && Date.now() - hit.at < CACHE_MS) continue;
        try { await studioOpening(o.id); } catch (err) { logger.warn({ err, opening: o.id }, "[studio] opening warm-up failed"); }
      }
    } finally { warming = false; }
  })();
}

async function buildOpening(def: OpeningDef): Promise<StudioOpeningData | null> {
  const started = Date.now();
  const left = () => ENGINE_BUDGET_MS - (Date.now() - started);
  const c = new Chess();
  for (const s of def.line) c.move(s);
  const keyFen = c.fen();
  const [tally, ev] = await Promise.all([
    tallyAt(def, keyFen).catch((err) => { logger.warn({ err, opening: def.id }, "[studio] opening game numbers failed"); return null; }),
    withTimeout(evalOf(keyFen), 9_000, NO_EVAL),
  ]);

  // Each variation's position at its end, for Stockfish's verdict on it.
  const lines: StudioOpeningData["lines"] = [];
  for (const v of def.lines) {
    const lc = new Chess(keyFen);
    let ok = true;
    for (const s of v.moves) { try { lc.move(s); } catch { ok = false; break; } }
    if (!ok) { logger.warn({ opening: def.id, line: v.name }, "[studio] opening line has an illegal move"); continue; }
    const endEval = left() > 1500 ? await withTimeout(evalOf(lc.fen()), Math.min(6_000, left()), NO_EVAL) : NO_EVAL;
    // Share of games that went into THIS line: the moves up to where it parts
    // from every other line that starts the same way (so two lines starting
    // with the same move don't both claim that move's whole share).
    let depth = 1;
    for (const o2 of def.lines) {
      if (o2 === v) continue;
      let k = 0; while (k < v.moves.length && k < o2.moves.length && v.moves[k] === o2.moves[k]) k++;
      if (k > 0) depth = Math.max(depth, Math.min(v.moves.length, k + 1));
    }
    const pre = v.moves.slice(0, depth);
    const went = tally ? tally.conts.filter((c) => pre.every((m, k) => c.m[k] === m)) : [];
    const hits = went.length;
    const whiteScore = hits >= 10 ? Math.round(((went.filter((c) => c.out === "white").length + went.filter((c) => c.out === "draw").length * 0.5) / hits) * 100) : null;
    lines.push({
      name: v.name, short: v.short, moves: v.moves, note: v.note, pct: tally && tally.games ? Math.round((hits / tally.games) * 100) : null, eval: endEval.best,
      why: LINE_WHY[`${def.id}|${v.name}`] ?? [], games: hits, whiteScore,
      next: endEval.bestSan ? { san: endEval.bestSan, eval: endEval.best } : null,
    });
  }

  // Replies: the most played in real games, plus every variation's first move.
  const moverIsWhite = keyFen.split(" ")[1] === "w";
  const seen = new Set<string>();
  const options: StudioOpeningData["options"] = [];
  const add = (san: string) => {
    if (seen.has(san) || options.length >= 4) return;
    seen.add(san);
    const s = tally?.next.get(san);
    const starts = lines.map((l, k) => (l.moves[0] === san ? k : -1)).filter((k) => k >= 0);
    const scorePct = s && s.games ? Math.round((((moverIsWhite ? s.white : s.black) + s.draw * 0.5) / s.games) * 100) : null;
    options.push({ san, pct: tally && tally.games ? Math.round(((s?.games ?? 0) / tally.games) * 100) : null, games: s?.games ?? 0, scorePct, eval: ev.moves.get(san) ?? null, lines: starts });
  };
  // Every variation's first move is always on the card (so each line has its option),
  // then the most played other replies, most played first.
  lines.forEach((l) => add(l.moves[0]));
  [...(tally?.next ?? new Map()).entries()].sort((a, b) => b[1].games - a[1].games).forEach(([san]) => add(san));
  options.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  // A trap from the library that starts from this opening's main line.
  let trap: StudioOpeningData["trap"] = null;
  try {
    const { studioTraps } = await import("./contentMoments");
    for (const t of await studioTraps()) {
      const full = [...(t.leadIn ?? []), ...(t.moves ?? [])];
      if (full.length > def.line.length && def.line.every((s, i) => full[i] === s)) {
        trap = { name: t.name, moves: full, notes: [...(t.leadIn ?? []).map(() => ""), ...(t.notes ?? [])], critical: (t.leadIn?.length ?? 0) + (t.critical ?? 0), summary: t.summary ?? "" };
        break;
      }
    }
  } catch { /* no traps */ }

  const data: StudioOpeningData = {
    id: def.id, name: def.name, side: def.side, hook: def.hook, ideas: def.ideas, line: def.line,
    games: tally?.games ?? 0,
    results: tally && tally.games >= 10 ? { white: Math.round((tally.white / tally.games) * 100), draw: Math.round((tally.draw / tally.games) * 100), black: Math.round((tally.black / tally.games) * 100) } : null,
    options, lines, trap,
  };
  if (ev.best != null || tally) cache.set(def.id, { at: Date.now(), data });
  return data;
}

export function studioOpeningList() {
  return STUDIO_OPENINGS.map((o) => ({ id: o.id, name: o.name, side: o.side, line: o.line, lines: o.lines.map((l) => l.name) }));
}
