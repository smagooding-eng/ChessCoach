// The fixed content of every Learn Path level (made once from the repo's Lichess puzzle set,
// curated_puzzles.csv (CC0), and the trap list): the same puzzles, tactic drills and trap for
// every member, so a step is always the same specific thing.
import type { TacticPuzzleData } from '@/components/tactics/TacticPuzzle';
export type PathPuzzle = TacticPuzzleData & { lichess: string };
export type PathTrap = { name: string; trapSide: 'white' | 'black'; summary: string; explanation: string; trapLineSan: string[]; moveNotes: string[] };
export type LevelContent = { motif: string; puzzles: PathPuzzle[]; tactic: PathPuzzle[]; trap: PathTrap };
export const LEVEL_CONTENT: LevelContent[] = [
{
"motif": "hanging",
"puzzles": [
{
"id": 1,
"fen": "1r3rk1/5p1p/2BRbqp1/p7/2p2P2/2P5/P1PQ4/K2R4 b - - 0 27",
"moves": [
"f8d8",
"d6d8",
"b8d8",
"d2d8"
],
"rating": 438,
"themes": [
"advantage",
"master",
"middlegame",
"short"
],
"setup": true,
"lichess": "kU5g0"
},
{
"id": 2,
"fen": "2b5/p5kp/1pP3p1/4pq2/4N3/2Q2B2/PP4PP/3r3K w - - 4 35",
"moves": [
"f3d1",
"f5f1"
],
"rating": 410,
"themes": [
"endgame",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "9hHRQ"
},
{
"id": 3,
"fen": "8/8/p7/1p3P1p/1k6/1P6/1PK5/8 b - - 0 40",
"moves": [
"h5h4",
"f5f6",
"b4c5",
"f6f7"
],
"rating": 517,
"themes": [
"advancedPawn",
"crushing",
"endgame",
"pawnEndgame",
"short"
],
"setup": true,
"lichess": "OlWMM"
},
{
"id": 4,
"fen": "4r1k1/ppp2p1p/3p2p1/2nP4/2P5/2P5/P1Bq1PPP/3R2K1 w - - 0 23",
"moves": [
"d1d2",
"e8e1"
],
"rating": 433,
"themes": [
"backRankMate",
"endgame",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "Urdf5"
},
{
"id": 5,
"fen": "r6r/b1pq1pk1/p1np1P2/1p1Bp3/4P2Q/3P4/PPP3PP/R4R1K b - - 0 21",
"moves": [
"g7f8",
"h4h8"
],
"rating": 420,
"themes": [
"hangingPiece",
"mate",
"mateIn1",
"middlegame",
"oneMove"
],
"setup": true,
"lichess": "Bz8fh"
}
],
"tactic": [
{
"id": 11,
"fen": "4r1kb/p4p1p/2Q4P/5qp1/3p1B2/N5P1/PP3P2/R5K1 b - - 0 24",
"moves": [
"g5f4",
"c6e8"
],
"rating": 434,
"themes": [
"endgame",
"hangingPiece",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "6iYvg"
},
{
"id": 12,
"fen": "2Q2k1q/p3p1r1/1p3bBB/7P/8/2P5/PPK3P1/3r4 b - - 1 30",
"moves": [
"d1d8",
"c8d8"
],
"rating": 544,
"themes": [
"hangingPiece",
"mate",
"mateIn1",
"middlegame",
"oneMove",
"pin"
],
"setup": true,
"lichess": "EGdyT"
},
{
"id": 13,
"fen": "5r1k/1b4p1/p1r2pBp/1pn5/1Q3P2/P3q2N/6PP/R4R1K b - - 1 30",
"moves": [
"c5d3",
"b4f8"
],
"rating": 516,
"themes": [
"hangingPiece",
"kingsideAttack",
"mate",
"mateIn1",
"middlegame",
"oneMove"
],
"setup": true,
"lichess": "Fav8M"
}
],
"trap": {
"name": "Scholar's Mate",
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
]
}
},
{
"motif": "fork",
"puzzles": [
{
"id": 101,
"fen": "rn1qk2r/ppp3p1/3pBb1p/4p2Q/4P3/2N5/PPP2PPP/R3K2R b KQkq - 1 11",
"moves": [
"e8e7",
"h5f7"
],
"rating": 768,
"themes": [
"mate",
"mateIn1",
"middlegame",
"oneMove"
],
"setup": true,
"lichess": "y5ljI"
},
{
"id": 102,
"fen": "rn1q1k1r/ppp1Rppp/5P2/8/2p5/2p2Q2/PP3PPP/RNB3K1 w - - 1 12",
"moves": [
"f3b7",
"d8d1",
"e7e1",
"d1e1"
],
"rating": 640,
"themes": [
"fork",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "kwkc8"
},
{
"id": 103,
"fen": "6r1/2p2p1k/p2p1Br1/1p2P2p/5P2/3Q3b/PP3b1P/R5RK w - - 0 26",
"moves": [
"d3h3",
"g6g1",
"a1g1",
"g8g1"
],
"rating": 830,
"themes": [
"kingsideAttack",
"mate",
"mateIn2",
"middlegame",
"operaMate",
"short"
],
"setup": true,
"lichess": "c8x7i"
},
{
"id": 104,
"fen": "r1b1r1k1/pp1n1pbp/6p1/q3n3/8/1BN1BN1P/PP3PP1/R2QR2K w - - 6 17",
"moves": [
"d1c2",
"e5f3",
"b3f7",
"g8f7"
],
"rating": 765,
"themes": [
"advantage",
"middlegame",
"short"
],
"setup": true,
"lichess": "Wmc7o"
},
{
"id": 105,
"fen": "1rbqkbnr/3npppp/p7/1p1Qp3/8/1B3N2/PPP2PPP/RNB1K2R b KQk - 1 9",
"moves": [
"c8b7",
"d5f7"
],
"rating": 755,
"themes": [
"attackingF2F7",
"mate",
"mateIn1",
"oneMove",
"opening"
],
"setup": true,
"lichess": "3oFkR"
}
],
"tactic": [
{
"id": 111,
"fen": "6k1/pp5p/6p1/4b3/2P2BP1/1b1B3P/1P4N1/2K1n3 w - - 11 32",
"moves": [
"f4e5",
"e1d3",
"c1d2",
"d3e5"
],
"rating": 946,
"themes": [
"advantage",
"endgame",
"fork",
"hangingPiece",
"short"
],
"setup": true,
"lichess": "DDHho"
},
{
"id": 112,
"fen": "rb3rk1/1bqn1ppp/p4n2/1p2pN2/8/NP2P1PP/PB3P2/R2QRBK1 b - - 1 17",
"moves": [
"c7c6",
"f5e7",
"g8h8",
"e7c6"
],
"rating": 950,
"themes": [
"advantage",
"fork",
"opening",
"short"
],
"setup": true,
"lichess": "GqmYq"
},
{
"id": 113,
"fen": "r4rk1/1pp2pp1/p1q2n1p/3N1b2/8/1B5P/PPP2PP1/R2Q1RK1 b - - 0 17",
"moves": [
"f5e4",
"d5e7",
"g8h7",
"e7c6"
],
"rating": 912,
"themes": [
"advantage",
"fork",
"middlegame",
"short"
],
"setup": true,
"lichess": "oCrEh"
}
],
"trap": {
"name": "Fool's Mate",
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
]
}
},
{
"motif": "pin",
"puzzles": [
{
"id": 201,
"fen": "3kr3/2p1nR2/1p1q2p1/p6p/3P4/1P6/P5Q1/K2R4 b - - 3 41",
"moves": [
"e7f5",
"g2a8"
],
"rating": 947,
"themes": [
"endgame",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "HV1n3"
},
{
"id": 202,
"fen": "4Q3/pp4pk/7p/7P/4R1q1/5pP1/P4P1K/7r w - - 2 36",
"moves": [
"h2h1",
"g4h3",
"h1g1",
"h3g2"
],
"rating": 968,
"themes": [
"endgame",
"mate",
"mateIn2",
"short"
],
"setup": true,
"lichess": "vW0Eg"
},
{
"id": 203,
"fen": "1qr1k2r/1b1pbppp/pp2p3/4n1B1/4P1n1/P1N2N2/1PP2PPP/R2QRBK1 w k - 4 15",
"moves": [
"g5e7",
"e5f3",
"g2f3",
"b8h2"
],
"rating": 1142,
"themes": [
"discoveredAttack",
"kingsideAttack",
"mate",
"mateIn2",
"opening",
"short"
],
"setup": true,
"lichess": "VaXla"
},
{
"id": 204,
"fen": "6n1/7k/q3p1pp/4N3/5P2/6PK/5r1P/1Q6 b - - 1 37",
"moves": [
"a6a7",
"b1g6",
"h7h8",
"e5f7",
"a7f7",
"g6f7"
],
"rating": 974,
"themes": [
"crushing",
"endgame",
"long"
],
"setup": true,
"lichess": "s5GGQ"
},
{
"id": 205,
"fen": "5rr1/8/k1p1N3/1p2Q3/2q1p3/p6P/3P1PP1/5RK1 b - - 1 39",
"moves": [
"c4d5",
"e6c7",
"a6b7",
"c7d5"
],
"rating": 973,
"themes": [
"crushing",
"endgame",
"fork",
"short"
],
"setup": true,
"lichess": "P4E27"
}
],
"tactic": [
{
"id": 211,
"fen": "rn1q1rk1/pbp3pp/1p1b4/8/4p3/3PQN2/PPPN2PP/2KR1B1R w - - 0 12",
"moves": [
"d2e4",
"d6f4",
"e3f4",
"f8f4"
],
"rating": 1134,
"themes": [
"advantage",
"opening",
"pin",
"short"
],
"setup": true,
"lichess": "pPIfr"
},
{
"id": 212,
"fen": "2kr1b2/1q4p1/2p1pp1p/3n4/Q1NP4/8/PP1R1P2/1K1R4 w - - 2 32",
"moves": [
"c4a5",
"d5c3",
"b1c2",
"c3a4",
"a5b7",
"c8b7"
],
"rating": 1114,
"themes": [
"advantage",
"long",
"middlegame",
"pin"
],
"setup": true,
"lichess": "RzQVL"
},
{
"id": 213,
"fen": "r1b1k2r/ppp1qppp/8/4n3/1bPp4/PP4P1/1B1NPP1P/R2QKB1R w KQkq - 1 11",
"moves": [
"b2d4",
"e5d3"
],
"rating": 848,
"themes": [
"mate",
"mateIn1",
"oneMove",
"opening",
"pin",
"smotheredMate"
],
"setup": true,
"lichess": "kKhLl"
}
],
"trap": {
"name": "Légal's Mate",
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
]
}
},
{
"motif": "skewer",
"puzzles": [
{
"id": 301,
"fen": "8/7p/1p2k1p1/2p2R2/1PKb2P1/8/6P1/8 w - - 0 46",
"moves": [
"f5d5",
"b6b5",
"c4b5",
"e6d5"
],
"rating": 1195,
"themes": [
"crushing",
"deflection",
"endgame",
"short"
],
"setup": true,
"lichess": "GhIuQ"
},
{
"id": 302,
"fen": "6k1/pQ2pp1p/6pP/8/5P2/4r2q/PPr2R1P/4R2K w - - 0 28",
"moves": [
"e1e3",
"c2c1",
"e3e1",
"c1e1",
"f2f1",
"e1f1"
],
"rating": 1187,
"themes": [
"endgame",
"killBoxMate",
"long",
"mate",
"mateIn3"
],
"setup": true,
"lichess": "e8wn5"
},
{
"id": 303,
"fen": "rnb2rk1/pp3ppp/3p4/8/3P4/3Q1NP1/q3PKBP/1R5R b - - 1 17",
"moves": [
"b8c6",
"f3g5",
"c8f5",
"d3f5"
],
"rating": 1253,
"themes": [
"advantage",
"middlegame",
"short"
],
"setup": true,
"lichess": "t9i2v"
},
{
"id": 304,
"fen": "rn3rk1/p1pp1pb1/1p2p3/4B1q1/3P2p1/2N5/PPP2PR1/R2QK3 b Q - 0 15",
"moves": [
"g7e5",
"g2g4",
"g5g4",
"d1g4"
],
"rating": 1188,
"themes": [
"advantage",
"middlegame",
"pin",
"short"
],
"setup": true,
"lichess": "9C7sL"
},
{
"id": 305,
"fen": "3r4/5pk1/7p/RBP2bp1/3KNn2/5PP1/6P1/8 w - - 5 29",
"moves": [
"d4e5",
"d8d5"
],
"rating": 1163,
"themes": [
"endgame",
"hookMate",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "NSbZG"
}
],
"tactic": [
{
"id": 311,
"fen": "5r2/1b6/p5kp/1p1pPP2/8/2P1K3/PP6/6R1 b - - 0 40",
"moves": [
"g6f5",
"g1f1",
"f5e5",
"f1f8"
],
"rating": 896,
"themes": [
"crushing",
"endgame",
"short",
"skewer"
],
"setup": true,
"lichess": "gHpeQ"
},
{
"id": 312,
"fen": "2r5/p5pp/q3k3/3p1p2/1NrPp3/1Qn1PP2/1P4PP/2RK3R w - - 0 27",
"moves": [
"c1c3",
"a6a1",
"d1d2",
"a1h1"
],
"rating": 1060,
"themes": [
"advantage",
"middlegame",
"short",
"skewer"
],
"setup": true,
"lichess": "oYmwW"
},
{
"id": 313,
"fen": "8/3b4/5p1p/3PpPp1/1p2P1P1/1P3k1P/3K4/5B2 w - - 7 47",
"moves": [
"d2d3",
"d7b5",
"d3c2",
"b5f1",
"d5d6",
"f1b5"
],
"rating": 1069,
"themes": [
"bishopEndgame",
"crushing",
"defensiveMove",
"endgame",
"long",
"skewer"
],
"setup": true,
"lichess": "499KN"
}
],
"trap": {
"name": "Blackburne Shilling Gambit",
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
]
}
},
{
"motif": "back-rank",
"puzzles": [
{
"id": 401,
"fen": "3rr1k1/ppq2pp1/4b2p/8/3p2n1/1NPB3P/PPQ1RPP1/4R1K1 b - - 0 21",
"moves": [
"e6b3",
"e2e8",
"d8e8",
"e1e8"
],
"rating": 1429,
"themes": [
"kingsideAttack",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "7PPNB"
},
{
"id": 402,
"fen": "b7/3k3p/p3p1p1/1p3r2/3p2B1/3Pq1B1/PPP2RPP/5RK1 b - - 8 24",
"moves": [
"f5g5",
"g3f4",
"g5g4",
"f4e3"
],
"rating": 1437,
"themes": [
"advantage",
"fork",
"middlegame",
"short",
"trappedPiece"
],
"setup": true,
"lichess": "uKIew"
},
{
"id": 403,
"fen": "r4r1k/pp6/2b5/3p3p/3PpNq1/4P1P1/P1Q2PP1/2RR2K1 w - - 0 25",
"moves": [
"c2e2",
"f8f4",
"e2g4",
"f4g4"
],
"rating": 1413,
"themes": [
"advantage",
"master",
"middlegame",
"short"
],
"setup": true,
"lichess": "y3TpE"
},
{
"id": 404,
"fen": "r5rk/6b1/pp4Qp/4B3/P1Pp4/5q1P/1P3PR1/7K b - - 0 26",
"moves": [
"a8a7",
"g6h6"
],
"rating": 1527,
"themes": [
"mate",
"mateIn1",
"middlegame",
"oneMove",
"pin"
],
"setup": true,
"lichess": "UiC7W"
},
{
"id": 405,
"fen": "1r4k1/5pp1/4p3/5q2/3P4/2P1B1Qp/P4P1K/1r4R1 b - - 2 32",
"moves": [
"b1g1",
"g3b8",
"g8h7",
"h2g1"
],
"rating": 1428,
"themes": [
"advantage",
"endgame",
"hangingPiece",
"intermezzo",
"short"
],
"setup": true,
"lichess": "2pNHZ"
}
],
"tactic": [
{
"id": 411,
"fen": "r1b2r1k/pp2n3/3p1q1p/7B/3n4/8/PPP1QPPP/R1B1R1K1 w - - 0 18",
"moves": [
"e2e7",
"f6f2",
"g1h1",
"f2f1",
"e1f1",
"f8f1"
],
"rating": 1308,
"themes": [
"backRankMate",
"long",
"mate",
"mateIn3",
"middlegame",
"sacrifice"
],
"setup": true,
"lichess": "O6Akr"
},
{
"id": 412,
"fen": "r1b2r2/2b2kpp/2N1p3/1p2P3/1p5B/1B6/P5PP/5R1K b - - 2 35",
"moves": [
"f7g8",
"c6e7",
"g8h8",
"f1f8"
],
"rating": 1136,
"themes": [
"backRankMate",
"deflection",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "s3c6S"
},
{
"id": 413,
"fen": "4r1k1/pp3p1p/6pB/8/1P1n4/8/3N1PPP/R5K1 w - - 0 25",
"moves": [
"a1a7",
"e8e1",
"d2f1",
"d4e2",
"g1h1",
"e1f1"
],
"rating": 1147,
"themes": [
"backRankMate",
"deflection",
"endgame",
"long",
"mate",
"mateIn3"
],
"setup": true,
"lichess": "lMIly"
}
],
"trap": {
"name": "Elephant Trap",
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
]
}
},
{
"motif": "discovered",
"puzzles": [
{
"id": 501,
"fen": "r5k1/ppp3pp/5R2/3p4/3Pn2P/2qBQ3/P5P1/R5K1 b - - 0 19",
"moves": [
"e4f6",
"d3h7",
"g8h7",
"e3c3"
],
"rating": 1629,
"themes": [
"crushing",
"discoveredAttack",
"endgame",
"short"
],
"setup": true,
"lichess": "Dxim5"
},
{
"id": 502,
"fen": "6k1/5pp1/p3r2p/1p1p3P/1B4P1/PnP5/1P3R2/1K1Nr1R1 w - - 2 33",
"moves": [
"g1f1",
"e1f1",
"f2f1",
"b3d2",
"b1c1",
"d2f1"
],
"rating": 1618,
"themes": [
"advantage",
"attraction",
"fork",
"long",
"middlegame",
"pin"
],
"setup": true,
"lichess": "cLoIl"
},
{
"id": 503,
"fen": "7R/4kr2/4p3/2qnb3/8/2P4P/PP1Q1P2/3RK3 w - - 2 32",
"moves": [
"d2g5",
"e5f6",
"g5g3",
"f6h8"
],
"rating": 1615,
"themes": [
"advantage",
"defensiveMove",
"fork",
"middlegame",
"short"
],
"setup": true,
"lichess": "C9hRq"
},
{
"id": 504,
"fen": "r1r5/4pp1k/3p4/p7/4qb1P/P2N4/P2KB3/2BRQ2R w - - 0 30",
"moves": [
"d3f4",
"c8c2"
],
"rating": 1523,
"themes": [
"master",
"mate",
"mateIn1",
"middlegame",
"oneMove"
],
"setup": true,
"lichess": "Qvm8E"
},
{
"id": 505,
"fen": "6rk/RQ4b1/6Rp/2p1pr2/1p5P/3P2P1/1PP3PK/4q3 b - - 10 34",
"moves": [
"f5f1",
"g6h6",
"g7h6",
"b7h7"
],
"rating": 1654,
"themes": [
"mate",
"mateIn2",
"middlegame",
"sacrifice",
"short"
],
"setup": true,
"lichess": "Y6vBa"
}
],
"tactic": [
{
"id": 511,
"fen": "4r1rk/1pp2Qp1/p2p1pRp/2n1qP1P/4P3/2N5/PPP5/1K4R1 b - - 5 25",
"moves": [
"e8e7",
"g6h6",
"g7h6",
"g1g8"
],
"rating": 1486,
"themes": [
"discoveredAttack",
"kingsideAttack",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "zoEPF"
},
{
"id": 512,
"fen": "r2r2k1/1p2bppp/p1n1pB2/8/2P2PP1/q2BQ2P/4N3/3RK2R b K - 0 19",
"moves": [
"e7f6",
"d3h7",
"g8h7",
"e3a3",
"d8d1",
"e1d1"
],
"rating": 1263,
"themes": [
"advantage",
"discoveredAttack",
"long",
"middlegame"
],
"setup": true,
"lichess": "Qk6m5"
},
{
"id": 513,
"fen": "4r1k1/pp2rpp1/2p2np1/4n1B1/6P1/2N1RP2/PPP4P/2K1R3 w - - 8 21",
"moves": [
"f3f4",
"e5d3",
"c2d3",
"e7e3",
"e1e3",
"e8e3",
"g5f6",
"g7f6"
],
"rating": 1327,
"themes": [
"advantage",
"discoveredAttack",
"middlegame",
"veryLong"
],
"setup": true,
"lichess": "SUKF7"
}
],
"trap": {
"name": "Fishing Pole Trap",
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
]
}
},
{
"motif": "removing-defender",
"puzzles": [
{
"id": 601,
"fen": "r2qk3/p2nBp1p/1p1pp3/1Bpb4/4P3/2P5/PP1r3P/R2Q1R1K w q - 0 17",
"moves": [
"e7d8",
"d5e4",
"d1f3",
"e4f3",
"f1f3",
"a8d8"
],
"rating": 1923,
"themes": [
"advantage",
"kingsideAttack",
"long",
"middlegame"
],
"setup": true,
"lichess": "WAXxx"
},
{
"id": 602,
"fen": "r2qkb1r/ppp2ppp/2n2n2/3p4/3P2b1/1Q3P1N/PPP3PP/RNB1KB1R b KQkq - 0 7",
"moves": [
"c6d4",
"b3a4",
"d4c6",
"f3g4"
],
"rating": 1882,
"themes": [
"equality",
"fork",
"opening",
"short"
],
"setup": true,
"lichess": "X7peI"
},
{
"id": 603,
"fen": "r2q1rk1/3b1p1p/2np1P2/2p4Q/pp6/1P2PN1P/PKPP1P2/3R3R b - - 0 18",
"moves": [
"a4b3",
"h5g5",
"g8h8",
"g5g7"
],
"rating": 1806,
"themes": [
"kingsideAttack",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "pBVGS"
},
{
"id": 604,
"fen": "r2qk2r/pbp2p1n/1p2pb1Q/8/2B5/2N5/PPP2PPP/R1B2RK1 w kq - 2 13",
"moves": [
"f1e1",
"h7g5",
"c1g5",
"h8h6"
],
"rating": 1820,
"themes": [
"crushing",
"discoveredAttack",
"opening",
"quietMove",
"short",
"trappedPiece"
],
"setup": true,
"lichess": "qoxD3"
},
{
"id": 605,
"fen": "3r3k/7p/3q2pb/1P6/8/1B2Q2P/3pKPP1/3R4 w - - 6 37",
"moves": [
"e3h6",
"d6d3"
],
"rating": 1807,
"themes": [
"endgame",
"mate",
"mateIn1",
"oneMove"
],
"setup": true,
"lichess": "NH87P"
}
],
"tactic": [
{
"id": 611,
"fen": "r1bq1knr/1p3ppp/p1nN4/4P3/1P1pP3/8/1PP3PP/R1BQKB1R w KQ - 3 12",
"moves": [
"d1f3",
"c6e5",
"f3g3",
"d8d6"
],
"rating": 1526,
"themes": [
"advantage",
"capturingDefender",
"opening",
"short"
],
"setup": true,
"lichess": "gtZo2"
},
{
"id": 612,
"fen": "r2q2k1/pp2br2/2p2n1Q/3pP3/8/2N4P/PPP3P1/R4RK1 b - - 0 18",
"moves": [
"f6h7",
"f1f7",
"g8f7",
"h6h7"
],
"rating": 1896,
"themes": [
"advantage",
"attraction",
"capturingDefender",
"kingsideAttack",
"middlegame",
"short"
],
"setup": true,
"lichess": "HGBOo"
},
{
"id": 613,
"fen": "8/6p1/1pbk3p/2p2PPP/p1P2K2/N2P4/8/8 b - - 0 49",
"moves": [
"c6g2",
"f5f6",
"d6e6",
"f6g7",
"e6f7",
"g5h6"
],
"rating": 1936,
"themes": [
"advancedPawn",
"capturingDefender",
"crushing",
"endgame",
"long"
],
"setup": true,
"lichess": "b6KTu"
}
],
"trap": {
"name": "Noah's Ark Trap",
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
]
}
},
{
"motif": "double-check",
"puzzles": [
{
"id": 701,
"fen": "2r2r1k/3QNppp/p3p3/1p2Pb2/3p1P2/6P1/PP2P1BP/2q2R1K w - - 2 20",
"moves": [
"f1c1",
"c8c1",
"g2f1",
"f5h3"
],
"rating": 2032,
"themes": [
"crushing",
"middlegame",
"pin",
"short"
],
"setup": true,
"lichess": "zDbBh"
},
{
"id": 702,
"fen": "2R1R3/5p1k/5P2/2pp2p1/5B1p/3P3P/Pr4PK/3q4 b - - 0 39",
"moves": [
"g5f4",
"e8g8",
"h7h6",
"g8g7",
"b2g2",
"g7g2",
"d1d3",
"c8h8"
],
"rating": 2124,
"themes": [
"crushing",
"endgame",
"queenRookEndgame",
"quietMove",
"veryLong"
],
"setup": true,
"lichess": "dw46x"
},
{
"id": 703,
"fen": "r2r2k1/pp3N1p/3qp1p1/8/8/2Q5/PPP2nPP/5RK1 b - - 2 24",
"moves": [
"d6b6",
"f7h6",
"g8f8",
"c3f6",
"f8e8",
"f6f7"
],
"rating": 2067,
"themes": [
"long",
"mate",
"mateIn3",
"middlegame"
],
"setup": true,
"lichess": "VkZw7"
},
{
"id": 704,
"fen": "6k1/4Q1pp/1p3p2/b1p5/P1q5/6BP/5PP1/6K1 b - - 0 33",
"moves": [
"c4a4",
"e7e6",
"g8h8",
"e6c8",
"a4e8",
"c8e8"
],
"rating": 2132,
"themes": [
"backRankMate",
"endgame",
"long",
"mate",
"mateIn3"
],
"setup": true,
"lichess": "td0gu"
},
{
"id": 705,
"fen": "r1bq1rk1/ppp2p2/4p1p1/3nb1NP/2Bn4/N6Q/PPP4P/R1B1K2R b KQ - 0 13",
"moves": [
"d5f4",
"c1f4",
"e5f4",
"h5g6",
"d4f3",
"g5f3"
],
"rating": 1939,
"themes": [
"advantage",
"long",
"opening"
],
"setup": true,
"lichess": "0FgKF"
}
],
"tactic": [
{
"id": 711,
"fen": "1k1nr3/pP2q2p/8/5Q2/5b2/3P1NpP/PBPr2B1/R2K1R2 w - - 1 28",
"moves": [
"d1c1",
"d2d1",
"c1d1",
"e7e2"
],
"rating": 2090,
"themes": [
"attraction",
"doubleCheck",
"mate",
"mateIn2",
"middlegame",
"queensideAttack",
"sacrifice",
"short"
],
"setup": true,
"lichess": "h6bNh"
},
{
"id": 712,
"fen": "5rk1/p4ppp/1p2p3/8/1P1Pb1nq/P3PN2/B5rP/R2Q1R1K w - - 4 22",
"moves": [
"f3h4",
"g2h2",
"h1g1",
"h2h1"
],
"rating": 1905,
"themes": [
"doubleCheck",
"fork",
"mate",
"mateIn2",
"middlegame",
"short"
],
"setup": true,
"lichess": "7GSRB"
},
{
"id": 713,
"fen": "3r2k1/1R1bb3/4pp1p/6p1/3Bp3/4P2P/P3NPP1/4KB1R w K - 2 24",
"moves": [
"d4b6",
"e7b4",
"e1d1",
"d7a4",
"d1c1",
"b4a3",
"c1b1",
"d8d1",
"e2c1",
"d1c1"
],
"rating": 2098,
"themes": [
"doubleCheck",
"mate",
"mateIn5",
"middlegame",
"veryLong"
],
"setup": true,
"lichess": "fMSR6"
}
],
"trap": {
"name": "Magnus Smith Trap",
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
]
}
},
{
"motif": "promotion",
"puzzles": [
{
"id": 801,
"fen": "r3k2r/1p1b1ppp/p1n5/2Q5/5B2/4P3/P2NKPPP/q4B1R b kq - 0 16",
"moves": [
"e8c8",
"d2c4",
"d7g4",
"f2f3",
"a1a2",
"e2e1"
],
"rating": 2708,
"themes": [
"advantage",
"defensiveMove",
"long",
"middlegame",
"quietMove"
],
"setup": true,
"lichess": "4NGTh"
},
{
"id": 802,
"fen": "r7/p1p3k1/3p2p1/2pPpr2/2P1NnR1/6Q1/PP3P1K/8 w - - 2 32",
"moves": [
"e4g5",
"f5g5",
"g4g5",
"a8h8",
"h2g1",
"f4e2",
"g1f1",
"e2g3"
],
"rating": 2448,
"themes": [
"advantage",
"endgame",
"exposedKing",
"fork",
"sacrifice",
"veryLong"
],
"setup": true,
"lichess": "W4KI0"
},
{
"id": 803,
"fen": "r2qr1k1/1p3ppp/p2b4/2pP3n/8/5P2/PB1QNPBP/R3K2R w KQ - 2 17",
"moves": [
"e1g1",
"e8e2",
"d2e2",
"h5f4",
"f1e1",
"f4e2"
],
"rating": 2456,
"themes": [
"advantage",
"attraction",
"kingsideAttack",
"long",
"middlegame",
"sacrifice"
],
"setup": true,
"lichess": "jvxai"
},
{
"id": 804,
"fen": "3r2k1/b2q1pp1/p7/7p/1P2n3/2P1N1BP/P3QPP1/R5K1 w - - 3 30",
"moves": [
"a1d1",
"e4c3",
"e2h5",
"c3d1"
],
"rating": 2529,
"themes": [
"advantage",
"fork",
"middlegame",
"short"
],
"setup": true,
"lichess": "RdkZn"
},
{
"id": 805,
"fen": "r1b1kb1r/ppp1p2p/2nq1np1/5p2/3P4/2N2NP1/PPP1Q2P/R1B1KB1R b KQkq - 0 9",
"moves": [
"c8d7",
"c3b5",
"d6b4",
"c1d2",
"b4b2",
"d2c3",
"b2a1",
"c3a1"
],
"rating": 2439,
"themes": [
"crushing",
"defensiveMove",
"opening",
"trappedPiece",
"veryLong"
],
"setup": true,
"lichess": "yuLvx"
}
],
"tactic": [
{
"id": 811,
"fen": "8/6P1/3kb2R/3p4/3P4/1r6/4pK1p/8 b - - 1 43",
"moves": [
"b3h3",
"h6e6",
"d6e6",
"g7g8q",
"e6f6",
"g8d8"
],
"rating": 2443,
"themes": [
"advancedPawn",
"attraction",
"crushing",
"endgame",
"long",
"promotion"
],
"setup": true,
"lichess": "yDdp9"
},
{
"id": 812,
"fen": "8/8/6p1/3K4/4P1k1/5p2/5P2/8 b - - 0 62",
"moves": [
"g4f4",
"e4e5",
"g6g5",
"e5e6",
"g5g4",
"e6e7",
"g4g3",
"e7e8q"
],
"rating": 2497,
"themes": [
"advancedPawn",
"crushing",
"endgame",
"pawnEndgame",
"promotion",
"quietMove",
"veryLong"
],
"setup": true,
"lichess": "mFlao"
},
{
"id": 813,
"fen": "8/4k2p/p3p2p/PR4K1/3p4/8/8/8 w - - 0 35",
"moves": [
"g5h6",
"a6b5",
"a5a6",
"d4d3",
"a6a7",
"d3d2",
"a7a8q",
"d2d1q"
],
"rating": 2260,
"themes": [
"advancedPawn",
"crushing",
"endgame",
"hangingPiece",
"promotion",
"veryLong"
],
"setup": true,
"lichess": "uHFmZ"
}
],
"trap": {
"name": "Lasker Trap",
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
]
}
},
{
"motif": "trapped",
"puzzles": [
{
"id": 901,
"fen": "r1b1r1k1/ppp2ppp/3b4/3P4/2P3q1/2NB1nP1/PP2N2P/R1BQ1RK1 w - - 2 14",
"moves": [
"g1g2",
"g4h3",
"g2f3",
"d6c5"
],
"rating": 2820,
"themes": [
"crushing",
"defensiveMove",
"opening",
"sacrifice",
"short"
],
"setup": true,
"lichess": "qDIXo"
},
{
"id": 902,
"fen": "8/3bK2k/3P2pp/8/1p6/1P4P1/6P1/8 b - - 1 39",
"moves": [
"d7c6",
"g3g4",
"h7g7",
"g4g5"
],
"rating": 2929,
"themes": [
"bishopEndgame",
"crushing",
"endgame",
"quietMove",
"short"
],
"setup": true,
"lichess": "3FlCg"
},
{
"id": 903,
"fen": "1r6/5Q2/p1kpp3/2p3P1/2qnP2P/P1NR1P2/1P6/1K1R4 w - - 1 34",
"moves": [
"g5g6",
"b8b2",
"b1a1",
"b2b8",
"d1d2",
"d4b3",
"a1b1",
"b3d2"
],
"rating": 2812,
"themes": [
"crushing",
"discoveredCheck",
"doubleCheck",
"fork",
"middlegame",
"quietMove",
"veryLong"
],
"setup": true,
"lichess": "bmfhc"
},
{
"id": 904,
"fen": "rnb1Bb1r/ppp1kQ1p/5p2/4p3/3Pp3/8/PPP1KP1P/RN5q b - - 1 12",
"moves": [
"e7d6",
"f7f6",
"c8e6",
"b1d2",
"h1f3",
"d2f3"
],
"rating": 2827,
"themes": [
"crushing",
"fork",
"long",
"middlegame"
],
"setup": true,
"lichess": "tYGQ5"
},
{
"id": 905,
"fen": "5r1k/1p4p1/p5Pp/3R4/P1BpP1Pb/1P5q/2P3Q1/5K2 w - - 2 33",
"moves": [
"f1g1",
"h3e3",
"g1h1",
"f8f3",
"c4f1",
"e3e4"
],
"rating": 2866,
"themes": [
"crushing",
"endgame",
"interference",
"long",
"quietMove"
],
"setup": true,
"lichess": "yzHQA"
}
],
"tactic": [
{
"id": 911,
"fen": "2kr4/p2bQ3/6qr/2P2p2/4p3/4P3/PP1B1PPP/R4RK1 w - - 5 22",
"moves": [
"d2a5",
"d8g8",
"g2g3",
"g6h5",
"h2h4",
"h6e6",
"e7d7",
"c8d7"
],
"rating": 2689,
"themes": [
"advantage",
"clearance",
"middlegame",
"quietMove",
"trappedPiece",
"veryLong"
],
"setup": true,
"lichess": "fV2MR"
},
{
"id": 912,
"fen": "r1bqkbnr/1p1ppppp/p1n5/8/1pB1P3/5N2/PBPP1PPP/RN1QK2R b KQkq - 3 5",
"moves": [
"b7b5",
"c4f7",
"e8f7",
"f3g5",
"f7e8",
"b2g7",
"g8f6",
"g7h8"
],
"rating": 2680,
"themes": [
"advantage",
"attackingF2F7",
"attraction",
"deflection",
"opening",
"sacrifice",
"trappedPiece",
"veryLong"
],
"setup": true,
"lichess": "yUvBh"
},
{
"id": 913,
"fen": "8/8/2R5/5k2/1P3ppB/4P2p/r6K/8 w - - 1 49",
"moves": [
"h2g1",
"h3h2",
"g1h1",
"g4g3",
"c6f6",
"f5g4",
"h4g3",
"f4g3"
],
"rating": 2704,
"themes": [
"advancedPawn",
"crushing",
"endgame",
"trappedPiece",
"veryLong"
],
"setup": true,
"lichess": "T8EQs"
}
],
"trap": {
"name": "Siberian Trap",
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
]
}
}
];
